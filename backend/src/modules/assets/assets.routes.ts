import { Router } from "express";
import { AppError } from "../../middleware/error.js";
import { assetService } from "../../lib/container.js";
import { requireAuth } from "../../middleware/auth.js";

export const assetsRouter: Router = Router();

assetsRouter.get("/assets", requireAuth, async (_req, res) => {
  const assets = await assetService.getAssets();
  res.status(200).json({ assets });
});

assetsRouter.delete("/assets/:id", requireAuth, async (req, res) => {
  const assetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  await assetService.deleteAsset(assetId);
  res.status(200).json({ ok: true });
});
