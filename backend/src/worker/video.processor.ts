import { UnrecoverableError, type Job } from "bullmq";
import type { DerivKind } from "../generated/prisma/client.js";
import { childLogger } from "../lib/logger.js";
import type { VideoJobData } from "../shared/jobs.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "../lib/prisma.js";
import { getObjectToFile, putObjectToS3, deleteObject } from "../lib/s3.js";
import { fileHasAudio } from "../lib/ffprobe.js";
import {
  createFfmpegTimeParser,
  extractFrameArgs,
  extractMp3Args,
  runFfmpeg,
  transcode720pArgs,
} from "../lib/ffmpeg.js";
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

function even(value: number): number {
  return value - (value % 2);
}

export class VideoProcessor {
  private readonly log = childLogger({ processor: "video" });

  constructor(private readonly mediaEvents: MediaEventsPublisher) {}

  async process(job: Job<VideoJobData>): Promise<void> {
    this.log.info({ id: job.id, data: job.data }, "picked up");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `vid-${job.id}-`));
    let jobId = job.data.jobId;

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: job.data.assetId },
      });

      if (!asset) {
        throw new UnrecoverableError("Asset not found");
      }

      this.lastProgressAt = 0;
      this.lastProgressPct = -1;

      jobId = await this.resolveJobId(job.data);
      await markJobRunning(jobId, job.attemptsMade);

      const originalPath = path.join(tmpDir, "original");
      await getObjectToFile(asset.storageKey, originalPath);

      const durationMs = asset.durationMs ?? 0;
      const hasAudio = await fileHasAudio(originalPath);
      const seekSec = durationMs > 0 ? (durationMs * 0.1) / 1000 : 0;
      const framePath = path.join(tmpDir, "frame.jpg");
      await runFfmpeg(extractFrameArgs(originalPath, framePath, seekSec));

      const posterPath = path.join(tmpDir, "poster.jpg");
      const thumbPath = path.join(tmpDir, "thumb_320.webp");
      const poster = await sharp(framePath)
        .rotate()
        .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(posterPath);
      const thumb = await sharp(framePath)
        .rotate()
        .resize(320, 320, { fit: "inside" })
        .webp({ quality: 80 })
        .toFile(thumbPath);

      const dir = path.posix.dirname(asset.storageKey);
      const posterKey = `${dir}/poster.jpg`;
      const thumbKey = `${dir}/thumb_320.webp`;
      const videoKey = `${dir}/video_720p.mp4`;
      const audioKey = `${dir}/audio.mp3`;

      await putObjectToS3(posterKey, posterPath, "image/jpeg");
      await putObjectToS3(thumbKey, thumbPath, "image/webp");
      await this.saveDerivative(
        asset.id,
        jobId,
        "POSTER",
        posterKey,
        "image/jpeg",
        poster,
      );
      await this.saveDerivative(
        asset.id,
        jobId,
        "THUMBNAIL",
        thumbKey,
        "image/webp",
        thumb,
      );
      await this.publishProgress(asset.userId, asset.id, 0);

      const videoPath = path.join(tmpDir, "video_720p.mp4");
      await runFfmpeg(transcode720pArgs(originalPath, videoPath, hasAudio), {
        onStdout: createFfmpegTimeParser((ms) => {
          if (durationMs <= 0) return;
          const percent = Math.min(
            99,
            Math.max(0, Math.round((ms / durationMs) * 100)),
          );
          this.throttledProgress(asset.userId, asset.id, percent);
        }),
      });

      await putObjectToS3(videoKey, videoPath, "video/mp4");
      const videoStat = await fs.stat(videoPath);
      const height = Math.min(720, asset.height ?? 720);
      const width =
        asset.width && asset.height
          ? even(Math.round((asset.width * height) / asset.height))
          : null;
      await this.saveDerivative(
        asset.id,
        jobId,
        "VIDEO_720P",
        videoKey,
        "video/mp4",
        { size: videoStat.size, width, height },
      );

      if (hasAudio) {
        const audioPath = path.join(tmpDir, "audio.mp3");
        try {
          await runFfmpeg(extractMp3Args(originalPath, audioPath));
          await putObjectToS3(audioKey, audioPath, "audio/mpeg");
          const audioStat = await fs.stat(audioPath);
          await this.saveDerivative(
            asset.id,
            jobId,
            "AUDIO_MP3",
            audioKey,
            "audio/mpeg",
            { size: audioStat.size, width: null, height: null },
          );
        } catch (err) {
          this.log.warn({ err, assetId: asset.id }, "audio extract skipped");
        }
      }

      try {
        await deleteObject(asset.storageKey);
        this.log.info(
          { key: asset.storageKey },
          "original removed after transcode",
        );
      } catch (err) {
        this.log.warn(
          { err, key: asset.storageKey },
          "failed to delete original after transcode",
        );
      }

      await markJobDone(jobId);
      await markAssetReady(asset.id);
      await this.mediaEvents.publish({
        userId: asset.userId,
        assetId: asset.id,
        status: "READY",
        progress: 100,
      });

      this.log.info({ posterKey, thumbKey, videoKey }, "derivatives stored");
    } catch (err) {
      const fatal =
        err instanceof UnrecoverableError ||
        isFatalJobError(err, job.attemptsMade, job.opts.attempts);
      if (fatal) {
        await this.persistFailure(
          jobId,
          job.data.assetId,
          job.data.userId,
          err,
        );
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

  private lastProgressAt = 0;
  private lastProgressPct = -1;

  private throttledProgress(userId: string, assetId: string, percent: number) {
    const now = Date.now();
    if (percent === this.lastProgressPct) return;
    if (now - this.lastProgressAt < 1000 && percent < 99) return;
    this.lastProgressAt = now;
    this.lastProgressPct = percent;
    void this.publishProgress(userId, assetId, percent);
  }

  private publishProgress(userId: string, assetId: string, progress: number) {
    return this.mediaEvents.publish({
      userId,
      assetId,
      status: "PROCESSING",
      progress,
    });
  }

  private async resolveJobId(data: VideoJobData): Promise<string> {
    if (data.jobId) return data.jobId;

    const created = await prisma.job.create({
      data: {
        assetId: data.assetId,
        type: "VIDEO_TRANSCODE",
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
      this.log.warn(
        { err: updateErr, assetId },
        "failed to persist asset error",
      );
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
    mimeType: string,
    info: { size: number; width: number | null; height: number | null },
  ) {
    return prisma.derivative.upsert({
      where: { assetId_kind: { assetId, kind } },
      create: {
        assetId,
        jobId,
        kind,
        storageKey,
        mimeType,
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
      update: {
        jobId,
        storageKey,
        mimeType,
        sizeBytes: BigInt(info.size),
        width: info.width,
        height: info.height,
      },
    });
  }
}
