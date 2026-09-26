import Stripe from "stripe";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { corsOrigins, env } from "../../config/env.js";
import { childLogger } from "../../lib/logger.js";
import { AppError } from "../../middleware/error.js";

export class BillingService {
  private readonly log = childLogger({ component: "billing" });
  private stripe: Stripe | undefined;

  constructor(private readonly prisma: PrismaClient) {}

  async createCheckout(userId: string): Promise<{ url: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");

    const stripe = this.client();

    try {
      const priceId = await this.recurringPriceId(stripe);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: withSessionPlaceholder(returnUrl("success")),
        cancel_url: returnUrl("cancel"),
        client_reference_id: user.id,
        customer_email: user.email,
        metadata: { userId: user.id },
        subscription_data: { metadata: { userId: user.id } },
      });

      if (!session.url) {
        throw new AppError(
          502,
          "BILLING_FAILED",
          "Stripe не вернул ссылку на оплату",
        );
      }

      return { url: session.url };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw this.stripeFailure(stripe, err);
    }
  }

  private async recurringPriceId(stripe: Stripe): Promise<string> {
    const page = await stripe.prices.list({
      active: true,
      type: "recurring",
      limit: 100,
    });

    if (page.has_more || page.data.length > 1) {
      throw new AppError(
        503,
        "BILLING_UNAVAILABLE",
        "В Stripe несколько активных тарифов",
      );
    }

    const price = page.data[0];
    if (!price) {
      throw new AppError(503, "BILLING_UNAVAILABLE", "В Stripe нет активного тарифа");
    }

    return price.id;
  }

  private client(): Stripe {
    if (!env.STRIPE_SECRET_KEY) {
      throw new AppError(
        503,
        "BILLING_UNAVAILABLE",
        "Не задан STRIPE_SECRET_KEY",
      );
    }
    this.stripe ??= new Stripe(env.STRIPE_SECRET_KEY);
    return this.stripe;
  }

  private stripeFailure(stripe: Stripe, err: unknown): AppError {
    if (!(err instanceof stripe.errors.StripeError)) throw err;

    this.log.warn({ err }, "stripe checkout session failed");

    if (err instanceof stripe.errors.StripeAuthenticationError) {
      return new AppError(503, "BILLING_UNAVAILABLE", "Ключ Stripe отклонён");
    }
    if (err.code === "resource_missing") {
      return new AppError(502, "BILLING_FAILED", "Тариф Stripe не найден");
    }
    return new AppError(502, "BILLING_FAILED", "Stripe не открыл оплату");
  }
}

function returnUrl(kind: "success" | "cancel"): string {
  const configured =
    kind === "success"
      ? env.STRIPE_CHECKOUT_SUCCESS_URL
      : env.STRIPE_CHECKOUT_CANCEL_URL;
  if (configured) return configured;

  const origin = corsOrigins[0] ?? "http://localhost:5173";
  return `${origin}/?checkout=${kind}`;
}

function withSessionPlaceholder(url: string): string {
  if (url.includes("{CHECKOUT_SESSION_ID}")) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}session_id={CHECKOUT_SESSION_ID}`;
}
