import { UnrecoverableError, type Job } from "bullmq";
import type { DerivKind } from "../generated/prisma/client.js";
import { childLogger } from "../lib/logger.js";
import type { ImageJobData } from "../shared/jobs.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { getObjectToFile, putObjectToS3 } from "../lib/s3.js";
import sharp from "sharp";

export class ImageProcessor {
  private readonly log = childLogger({ processor: "image" });

  async process(job: Job<ImageJobData>): Promise<void> {
    this.log.info({ id: job.id, data: job.data }, "picked up");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `img-${job.id}-`));

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: job.data.assetId },
      });

      if (!asset) {
        this.log.error({ id: job.id, data: job.data }, "asset not found");
        throw new UnrecoverableError("Asset not found");
      }

      const originalPath = path.join(tmpDir, "original");
      await getObjectToFile(asset.storageKey, originalPath);
      this.log.info({ originalPath }, "original on disk");

      const thumbPath = path.join(tmpDir, "thumb_320.webp");
      const previewPath = path.join(tmpDir, "preview_1280.webp");

      const thumb = await sharp(originalPath)
        .rotate()
        .resize(320, 320, { fit: "inside" })
        .webp({ quality: 80 })
        .toFile(thumbPath);
      const preview = await sharp(originalPath)
        .rotate()
        .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(previewPath);

      this.log.info({ tmpDir }, "generated thumbs");

      const dir = path.posix.dirname(asset.storageKey);
      const thumbKey = `${dir}/thumb_320.webp`;
      const previewKey = `${dir}/preview_1280.webp`;

      await putObjectToS3(thumbKey, thumbPath, "image/webp");
      await putObjectToS3(previewKey, previewPath, "image/webp");

      await this.saveDerivative(asset.id, "THUMBNAIL", thumbKey, thumb);
      await this.saveDerivative(asset.id, "PREVIEW", previewKey, preview);

      this.log.info({ thumbKey, previewKey }, "derivatives stored");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private saveDerivative(
    assetId: string,
    kind: DerivKind,
    storageKey: string,
    info: { size: number; width: number; height: number },
  ) {
    return prisma.derivative.upsert({
      where: { assetId_kind: { assetId, kind } },
      create: {
        assetId,
        kind,
        storageKey,
        mimeType: "image/webp",
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
      update: {
        storageKey,
        mimeType: "image/webp",
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
    });
  }
}
