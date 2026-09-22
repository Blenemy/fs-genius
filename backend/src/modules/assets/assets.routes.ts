import { Router } from "express";
import { AppError } from "../../middleware/error.js";
import { assetService } from "../../lib/container.js";
import { requireAuth } from "../../middleware/auth.js";

export const assetsRouter: Router = Router();

assetsRouter.get("/assets", requireAuth, async (req, res) => {
  const assets = await assetService.getAssets(req.user!.id);
  res.status(200).json({ assets });
});

assetsRouter.get("/assets/:id", requireAuth, async (req, res) => {
  const assetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  const asset = await assetService.getAssetDetail(assetId, req.user!.id);
  res.status(200).json({ asset });
});

assetsRouter.post("/assets/:id/cancel", requireAuth, async (req, res) => {
  const assetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  const result = await assetService.cancelAsset(assetId, req.user!.id);
  res.status(202).json(result);
});

assetsRouter.post("/assets/:id/jobs", requireAuth, async (req, res) => {
  const assetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  const result = await assetService.restartAsset(assetId, req.user!.id);
  res.status(202).json(result);
});

assetsRouter.delete("/assets/:id", requireAuth, async (req, res) => {
  const assetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  await assetService.deleteAsset(assetId, req.user!.id);
  res.status(200).json({ ok: true });
});
