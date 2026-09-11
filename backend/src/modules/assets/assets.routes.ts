import { Router } from "express";
import { AppError } from "../../middleware/error.js";
import { assetService } from "../../lib/container.js";

export const assetsRouter: Router = Router();

assetsRouter.get("/assets", async (_req, res) => {
  const assets = await assetService.getAssets();
  res.status(200).json({ assets });
});

assetsRouter.delete("/assets/:id", async (req, res) => {
  const assetId = req.params.id;
  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id файла");
  }

  await assetService.deleteAsset(assetId);
  res.status(200).json({ ok: true });
});
