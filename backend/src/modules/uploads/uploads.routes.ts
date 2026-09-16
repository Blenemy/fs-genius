import { Router } from "express";
import { AppError } from "../../middleware/error.js";
import { uploadsService } from "../../lib/container.js";
import { parseOrThrow } from "../../lib/parse.js";
import { presignSchema } from "./uploads.schema.js";
import { requireAuth } from "../../middleware/auth.js";

export const uploadRouter: Router = Router();

uploadRouter.post("/uploads/presign", requireAuth, async (req, res) => {
  const user = req.user;

  const data = parseOrThrow(
    presignSchema,
    req.body,
    "Некорректные данные файла",
  );

  const result = await uploadsService.presign(data, user!.id);
  res.status(200).json(result);
});

uploadRouter.post("/uploads/:id/complete", requireAuth, async (req, res) => {
  const assetId = req.params.id as string | undefined;
  const user = req.user;

  if (!assetId) {
    throw new AppError(400, "VALIDATION_FAILED", "Нет id загрузки");
  }

  const result = await uploadsService.complete(assetId, user!.id);
  res.status(200).json(result);
});
