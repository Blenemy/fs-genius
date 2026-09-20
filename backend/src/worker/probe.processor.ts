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
      await this.markRunning(job);

      const asset = await prisma.asset.findUnique({
        where: { id: job.data.assetId },
      });

      if (!asset) {
        throw new UnrecoverableError("Asset not found");
      }

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
        await this.markDone(job.data.jobId);
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

      try {
        await this.imageQueue.add({
          assetId: asset.id,
          userId: asset.userId,
        });
      } catch (err) {
        if (!isDuplicateJobId(err)) throw err;
      }

      await this.markDone(job.data.jobId);
      this.log.info(
        { assetId: asset.id, width: meta.width, height: meta.height },
        "image probed",
      );
    } catch (err) {
      const fatal =
        err instanceof UnrecoverableError ||
        isUnreadableMedia(err) ||
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (fatal) await this.markFailed(job.data.jobId, err);
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

  private markRunning(job: BullJob<ProbeJobData>) {
    return prisma.job.update({
      where: { id: job.data.jobId },
      data: {
        status: "RUNNING",
        attempts: job.attemptsMade + 1,
        startedAt: new Date(),
        error: null,
      },
    });
  }

  private markDone(jobId: string) {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        progress: 100,
        finishedAt: new Date(),
        error: null,
      },
    });
  }

  private async markFailed(jobId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: message.slice(0, 4000),
          finishedAt: new Date(),
        },
      });
    } catch (updateErr) {
      this.log.warn({ err: updateErr, jobId }, "failed to persist job error");
    }
  }
}

function isDuplicateJobId(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message);
}

function isUnreadableMedia(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("unsupported") ||
    msg.includes("corrupt") ||
    msg.includes("limitinputpixels") ||
    msg.includes("too large") ||
    msg.includes("input file is missing") ||
    msg.includes("vips")
  );
}
