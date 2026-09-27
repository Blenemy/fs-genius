import Stripe from "stripe";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { corsOrigins, env } from "../../config/env.js";
import { childLogger } from "../../lib/logger.js";
import { isUniqueViolation } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export class BillingService {
  private readonly log = childLogger({ component: "billing" });
  private stripe: Stripe | undefined;

  constructor(private readonly prisma: PrismaClient) {}

  async status(userId: string): Promise<{
    plan: "FREE" | "PRO" | "ENTERPRISE";
    subscription: { status: string; currentPeriodEnd: string | null } | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        billingSubscription: {
          select: { status: true, currentPeriodEnd: true },
        },
      },
    });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");

    const subscription = user.billingSubscription;
    return {
      plan: user.plan,
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
    };
  }

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

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = this.client();
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError(
        503,
        "BILLING_UNAVAILABLE",
        "Не задан STRIPE_WEBHOOK_SECRET",
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      if (err instanceof stripe.errors.StripeSignatureVerificationError) {
        this.log.warn({ err }, "stripe webhook signature rejected");
        throw new AppError(400, "BAD_REQUEST", "Чужой webhook");
      }
      throw err;
    }

    if (!HANDLED_EVENTS.has(event.type)) return;

    const seen = await this.prisma.stripeEvent.findUnique({
      where: { id: event.id },
      select: { id: true },
    });
    if (seen) return;

    await this.applyEvent(event);

    try {
      await this.prisma.stripeEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  private async applyEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
        await this.onCheckout(event.data.object);
        return;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.onSubscription(event.data.object);
        return;
      case "invoice.paid":
        await this.onInvoicePaid(event.data.object);
        return;
      case "invoice.payment_failed":
        await this.onInvoiceFailed(event.data.object);
        return;
      default:
        return;
    }
  }

  private async onCheckout(session: Stripe.Checkout.Session): Promise<void> {
    if (session.mode !== "subscription") return;

    const userId = session.metadata?.userId || session.client_reference_id;
    const subscriptionId = stripeId(session.subscription);
    if (!userId || !subscriptionId) {
      this.log.warn(
        { sessionId: session.id },
        "checkout session has no user or subscription",
      );
      return;
    }

    const subscription = await this.client().subscriptions.retrieve(subscriptionId);
    const customerId = stripeId(subscription.customer);
    if (!customerId) return;
    await this.saveSubscription(userId, customerId, subscription);
  }

  private async onSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = stripeId(subscription.customer);
    const userId = await this.userIdFor(subscription);
    if (!userId || !customerId) {
      this.log.warn(
        { subscriptionId: subscription.id },
        "subscription has no local user",
      );
      return;
    }
    await this.saveSubscription(userId, customerId, subscription);
  }

  private async onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return;
    const subscription = await this.client().subscriptions.retrieve(subscriptionId);
    await this.onSubscription(subscription);
  }

  private async onInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return;

    const subscription = await this.client().subscriptions.retrieve(subscriptionId);
    const customerId = stripeId(subscription.customer);
    const userId = await this.userIdFor(subscription);
    if (!userId || !customerId) {
      this.log.warn({ subscriptionId }, "failed invoice has no local user");
      return;
    }

    const status =
      subscription.status === "active" ? "past_due" : subscription.status;
    await this.saveSubscription(userId, customerId, subscription, status);
  }

  private async userIdFor(subscription: Stripe.Subscription): Promise<string | null> {
    if (subscription.metadata?.userId) return subscription.metadata.userId;

    const row = await this.prisma.billingSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private async saveSubscription(
    userId: string,
    customerId: string,
    subscription: Stripe.Subscription,
    status: string = subscription.status,
  ): Promise<void> {
    const paid = status === "active" || status === "trialing";
    const currentPeriodEnd = periodEnd(subscription);

    await this.prisma.$transaction(async (tx) => {
      await tx.billingSubscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status,
          currentPeriodEnd,
        },
        update: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status,
          currentPeriodEnd,
        },
      });

      if (paid) {
        await tx.user.updateMany({
          where: { id: userId, plan: "FREE" },
          data: { plan: "PRO" },
        });
        return;
      }

      await tx.user.updateMany({
        where: { id: userId, plan: "PRO" },
        data: { plan: "FREE" },
      });
    });
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

function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return stripeId(subscription);
}

function periodEnd(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  if (!end) return null;
  return new Date(end * 1000);
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
