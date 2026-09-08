import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../middleware/error.js';
import { headObject, isS3Configured, presignPut } from '../../lib/s3.js';
import { extensionFor, STUB_USER_ID, type PresignInput } from './uploads.schema.js';

export class UploadsService {
  constructor(private readonly prisma: PrismaClient) {}

  async presign(input: PresignInput) {
    if (!isS3Configured()) {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Хранилище не настроено');
    }

    const ext = extensionFor(input.contentType);

    const created = await this.prisma.asset.create({
      data: {
        userId: STUB_USER_ID,
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: BigInt(input.sizeBytes),
        // Unique placeholder until we know the cuid. Replaced in the next line.
        storageKey: `draft:${process.hrtime.bigint()}`,
      },
    });

    const storageKey = `u/${STUB_USER_ID}/${created.id}/original.${ext}`;

    const asset = await this.prisma.asset.update({
      where: { id: created.id },
      data: { storageKey },
    });

    const uploadUrl = await presignPut(asset.storageKey, asset.contentType);

    return {
      assetId: asset.id,
      uploadUrl,
      headers: { 'Content-Type': asset.contentType },
    };
  }

  async complete(assetId: string) {
    if (!isS3Configured()) {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Хранилище не настроено');
    }

    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset) {
      throw new AppError(404, 'NOT_FOUND', 'Загрузка не найдена');
    }

    if (asset.status === 'UPLOADED') {
      return { assetId: asset.id, status: asset.status };
    }

    let head: { contentLength: number } | null;
    try {
      head = await headObject(asset.storageKey);
    } catch {
      throw new AppError(
        503,
        'STORAGE_UNAVAILABLE',
        'Не удалось проверить файл в хранилище',
      );
    }

    if (!head) {
      throw new AppError(400, 'UPLOAD_INCOMPLETE', 'Файл в хранилище не найден');
    }

    if (BigInt(head.contentLength) !== asset.sizeBytes) {
      throw new AppError(
        400,
        'SIZE_MISMATCH',
        'Размер в хранилище не совпал с заявленным',
        { expected: Number(asset.sizeBytes), actual: head.contentLength },
      );
    }

    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { status: 'UPLOADED' },
    });

    return { assetId: updated.id, status: updated.status };
  }
}
