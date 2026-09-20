import { UnrecoverableError, type Job as BullJob } from "bullmq";
import { fileTypeFromFile } from "file-type";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import sharp from "sharp";
import { childLogger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { getObjectToFile } from "../lib/s3.js";
import type { ProbeJobData } from "../shared/jobs.js";
import type { ImageQueue } from "../queues/image.queue.js";
import type { AssetKind } from "../generated/prisma/client.js";
import {
  isDuplicateJobId,
  isFatalJobError,
  isUnreadableMedia,
  markAssetFailed,
  markAssetProcessing,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from "./media-status.js";

/** Default sharp cap is ~268 MP; a 2 MB file can still unpack past that. */
const LIMIT_INPUT_PIXELS = 64_000_000;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

export class ProbeProcessor {
  private readonly log = childLogger({ processor: "probe" });

  constructor(private readonly imageQueue: ImageQueue) {}

  async process(job: BullJob<ProbeJobData>): Promise<void> {
    this.log.info({ id: job.id, data: job.data }, "picked up");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `probe-${job.id}-`));

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: job.data.assetId },
      });

      if (!asset) {
        throw new UnrecoverableError("Asset not found");
      }

      await markJobRunning(job.data.jobId, job.attemptsMade);
      await markAssetProcessing(asset.id);

      const originalPath = path.join(tmpDir, "original");
      await getObjectToFile(asset.storageKey, originalPath);

      const detected = await fileTypeFromFile(originalPath);
      const mime = detected?.mime;
      if (!mime) {
        throw new UnrecoverableError("Unknown file type");
      }

      if (VIDEO_MIMES.has(mime)) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { kind: "VIDEO" },
        });
        await markJobDone(job.data.jobId);
        this.log.info(
          { assetId: asset.id, mime },
          "video probed; transcode queue not wired yet",
        );
        return;
      }

      if (!IMAGE_MIMES.has(mime)) {
        throw new UnrecoverableError(`Unsupported media type: ${mime}`);
      }

      const meta = await this.readImageMeta(originalPath);
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          kind: "IMAGE" satisfies AssetKind,
          width: meta.width,
          height: meta.height,
          codec: meta.codec,
        },
      });

      await this.enqueueImageVariants(asset.id, asset.userId);
      await markJobDone(job.data.jobId);
      this.log.info(
        { assetId: asset.id, width: meta.width, height: meta.height },
        "image probed",
      );
    } catch (err) {
      const fatal =
        err instanceof UnrecoverableError ||
        isFatalJobError(err, job.attemptsMade, job.opts.attempts);
      if (fatal) {
        await this.persistFailure(job.data.jobId, job.data.assetId, err);
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

  private async enqueueImageVariants(assetId: string, userId: string) {
    const existing = await prisma.job.findFirst({
      where: {
        assetId,
        type: "IMAGE_VARIANTS",
        status: { in: ["QUEUED", "RUNNING", "DONE"] },
      },
      orderBy: { createdAt: "desc" },
    });

    const imageJob =
      existing ??
      (await prisma.job.create({
        data: {
          assetId,
          type: "IMAGE_VARIANTS",
          status: "QUEUED",
        },
      }));

    try {
      const queued = await this.imageQueue.add({
        assetId,
        userId,
        jobId: imageJob.id,
      });
      if (!imageJob.queueJobId) {
        await prisma.job.update({
          where: { id: imageJob.id },
          data: { queueJobId: String(queued.id) },
        });
      }
    } catch (err) {
      if (!isDuplicateJobId(err)) throw err;
    }
  }

  private async persistFailure(
    jobId: string,
    assetId: string,
    err: unknown,
  ): Promise<void> {
    try {
      await markJobFailed(jobId, err);
    } catch (updateErr) {
      this.log.warn({ err: updateErr, jobId }, "failed to persist job error");
    }
    try {
      await markAssetFailed(assetId);
    } catch (updateErr) {
      this.log.warn({ err: updateErr, assetId }, "failed to persist asset error");
    }
  }

  private async readImageMeta(originalPath: string) {
    const meta = await sharp(originalPath, {
      failOn: "error",
      limitInputPixels: LIMIT_INPUT_PIXELS,
    }).metadata();

    if (!meta.width || !meta.height) {
      throw new UnrecoverableError("Image has no dimensions");
    }

    const swapped = (meta.orientation ?? 1) >= 5 && (meta.orientation ?? 1) <= 8;

    return {
      width: swapped ? meta.height : meta.width,
      height: swapped ? meta.width : meta.height,
      codec: meta.format ?? null,
    };
  }
}
