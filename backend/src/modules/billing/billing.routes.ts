import { Router } from "express";
import { billingService } from "../../lib/container.js";
import { requireAuth } from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";

export const billingRouter: Router = Router();

billingRouter.post("/billing/checkout", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");

  const result = await billingService.createCheckout(user.id);
  res.status(200).json(result);
});
