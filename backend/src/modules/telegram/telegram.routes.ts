import { Router } from "express";
import type { Update } from "@grammyjs/types";
import { telegramService } from "../../lib/container.js";
import { AppError } from "../../middleware/error.js";
import { requireAuth } from "../../middleware/auth.js";

export const telegramRouter: Router = Router();

telegramRouter.get("/telegram/link", requireAuth, async (req, res) => {
  const status = await telegramService.status(req.user!.id);
  res.status(200).json(status);
});

telegramRouter.post("/telegram/link", requireAuth, async (req, res) => {
  const link = await telegramService.createLink(req.user!.id);
  res.status(200).json(link);
});

telegramRouter.delete("/telegram/link", requireAuth, async (req, res) => {
  const status = await telegramService.unlink(req.user!.id);
  res.status(200).json(status);
});

telegramRouter.post("/telegram/webhook", async (req, res) => {
  if (!telegramService.webhookAuthorized(req.get("X-Telegram-Bot-Api-Secret-Token"))) {
    throw new AppError(401, "UNAUTHORIZED", "Чужой webhook");
  }

  const update = req.body as Update;
  if (!update || typeof update !== "object" || !("update_id" in update)) {
    throw new AppError(400, "BAD_REQUEST", "Пустой апдейт");
  }

  await telegramService.handleUpdate(update);
  res.status(200).json({ ok: true });
});
