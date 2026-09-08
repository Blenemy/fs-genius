import { Router } from 'express';
import { AppError } from '../../middleware/error.js';
import { uploadsService } from '../../lib/container.js';
import { presignSchema } from './uploads.schema.js';

export const uploadRouter: Router = Router();

uploadRouter.post('/uploads/presign', async (req, res) => {
  const parsed = presignSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Некорректные данные файла', {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const result = await uploadsService.presign(parsed.data);
  res.status(200).json(result);
});

uploadRouter.post('/uploads/:id/complete', async (req, res) => {
  const assetId = req.params.id;
  if (!assetId) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Нет id загрузки');
  }

  const result = await uploadsService.complete(assetId);
  res.status(200).json(result);
});
