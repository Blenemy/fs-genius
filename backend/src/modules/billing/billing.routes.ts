import { Router } from "express";

/**
 * Stripe-песочница. Сервис и схема в базе остаются, HTTP выключен.
 * Чтобы вернуть: раскомментировать хендлеры ниже и монтирование в app.ts.
 */
export const billingRouter: Router = Router();

export const billingWebhookRouter: Router = Router();

/*
import { billingService } from "../../lib/container.js";
import { requireAuth } from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";

billingWebhookRouter.post("/", async (req, res) => {
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    throw new AppError(400, "BAD_REQUEST", "Пустой webhook");
  }

  await billingService.handleWebhook(req.body, signature);
  res.status(200).json({ received: true });
});

billingRouter.get("/billing/subscription", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");

  const result = await billingService.status(user.id);
  res.status(200).json(result);
});

billingRouter.post("/billing/checkout", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");

  const result = await billingService.createCheckout(user.id);
  res.status(200).json(result);
});
*/
