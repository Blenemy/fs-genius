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
import {
  isFatalJobError,
  isUnreadableMedia,
  markAssetFailed,
  markAssetReady,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from "./media-status.js";
import type { MediaEventsPublisher } from "../lib/media-events-publisher.js";

export class ImageProcessor {
  private readonly log = childLogger({ processor: "image" });

  constructor(private readonly mediaEvents: MediaEventsPublisher) {}

  async process(job: Job<ImageJobData>): Promise<void> {
    this.log.info({ id: job.id, data: job.data }, "picked up");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `img-${job.id}-`));
    let jobId = job.data.jobId;

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: job.data.assetId },
      });

      if (!asset) {
        throw new UnrecoverableError("Asset not found");
      }

      jobId = await this.resolveJobId(job.data);
      await markJobRunning(jobId, job.attemptsMade);

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

      await this.saveDerivative(asset.id, jobId, "THUMBNAIL", thumbKey, thumb);
      await this.saveDerivative(asset.id, jobId, "PREVIEW", previewKey, preview);

      await markJobDone(jobId);
      await markAssetReady(asset.id);
      await this.mediaEvents.publish({
        userId: asset.userId,
        assetId: asset.id,
        status: "READY",
      });

      this.log.info({ thumbKey, previewKey }, "derivatives stored");
    } catch (err) {
      const fatal =
        err instanceof UnrecoverableError ||
        isFatalJobError(err, job.attemptsMade, job.opts.attempts);
      if (fatal) {
        await this.persistFailure(jobId, job.data.assetId, job.data.userId, err);
      }
      if (err instanceof UnrecoverableError) throw err;
      if (isUnreadableMedia(err)) {
        throw new UnrecoverableError(
          err instanceof Error ? err.message : "Unreadable media",
        );
      }
      throw err;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async resolveJobId(data: ImageJobData): Promise<string> {
    if (data.jobId) return data.jobId;

    const created = await prisma.job.create({
      data: {
        assetId: data.assetId,
        type: "IMAGE_VARIANTS",
        status: "RUNNING",
      },
    });
    return created.id;
  }

  private async persistFailure(
    jobId: string | undefined,
    assetId: string,
    userId: string,
    err: unknown,
  ): Promise<void> {
    if (jobId) {
      try {
        await markJobFailed(jobId, err);
      } catch (updateErr) {
        this.log.warn({ err: updateErr, jobId }, "failed to persist job error");
      }
    }
    try {
      await markAssetFailed(assetId);
    } catch (updateErr) {
      this.log.warn({ err: updateErr, assetId }, "failed to persist asset error");
    }
    await this.mediaEvents.publish({
      userId,
      assetId,
      status: "FAILED",
    });
  }

  private saveDerivative(
    assetId: string,
    jobId: string,
    kind: DerivKind,
    storageKey: string,
    info: { size: number; width: number; height: number },
  ) {
    return prisma.derivative.upsert({
      where: { assetId_kind: { assetId, kind } },
      create: {
        assetId,
        jobId,
        kind,
        storageKey,
        mimeType: "image/webp",
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
      update: {
        jobId,
        storageKey,
        mimeType: "image/webp",
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
    });
  }
}
