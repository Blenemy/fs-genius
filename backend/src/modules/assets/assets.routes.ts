import { Router } from "express";
import { parseOrThrow } from "../../lib/parse.js";
import { editRequestSchema } from "./assets.schema.js";
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

  const body = req.body as unknown;
  if (hasPreset(body)) {
    const parsed = parseOrThrow(
      editRequestSchema,
      body,
      "Проверь параметры обработки",
    );
    const result = await assetService.startEdit(assetId, req.user!.id, parsed);
    res.status(202).json(result);
    return;
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

function hasPreset(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "preset" in body
  );
}
