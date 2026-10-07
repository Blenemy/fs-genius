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
import {
  canRemuxTo720p,
  fileHasAudio,
  probeVideoFile,
} from "../lib/ffprobe.js";
import {
  createFfmpegTimeParser,
  extractFrameArgs,
  extractMp3Args,
  remux720pArgs,
  runFfmpeg,
  transcode720pArgs,
  videoEditArgs,
} from "../lib/ffmpeg.js";
import {
  editOutputDurationMs,
  isVideoEditPreset,
} from "../shared/edits.js";
import type { EditJobPayload } from "../shared/edits.js";
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
import type { JobCancelStore } from "../lib/job-cancel.js";
import type { NotifyQueue } from "../queues/notify.queue.js";
import {
  persistCanceled,
  persistEditCanceled,
  resolveAbort,
  startJobAbort,
  WorkerShutdownError,
  isJobCanceledError,
} from "./job-abort.js";

function even(value: number): number {
  return value - (value % 2);
}

export class VideoProcessor {
  private readonly log = childLogger({ processor: "video" });

  constructor(
    private readonly mediaEvents: MediaEventsPublisher,
    private readonly cancel: JobCancelStore,
    private readonly notifyQueue: NotifyQueue,
    private readonly shutdown?: AbortSignal,
  ) {}

  async process(job: Job<VideoJobData>): Promise<void> {
    this.log.info({ id: job.id, data: job.data }, "picked up");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `vid-${job.id}-`));
    let jobId = job.data.jobId;
    let stopAbort: (() => void) | undefined;

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
      const abort = startJobAbort(
        this.cancel,
        jobId,
        job.data.assetId,
        this.shutdown,
      );
      stopAbort = abort.stop;
      const signal = abort.signal;

      await markJobRunning(jobId, job.attemptsMade);
      await this.cancel.throwIf(jobId, job.data.assetId);

      if (job.data.edit) {
        await this.runEdit(asset, job.data.edit, tmpDir, jobId, signal);
        return;
      }

      const originalPath = path.join(tmpDir, "original");
      await getObjectToFile(asset.storageKey, originalPath, signal);
      await this.cancel.throwIf(jobId, job.data.assetId);

      const durationMs = asset.durationMs ?? 0;
      const hasAudio = await fileHasAudio(originalPath, signal);
      const { posterPath, thumbPath, poster, thumb } = await this.renderStills(
        originalPath,
        durationMs,
        tmpDir,
        signal,
      );

      const dir = path.posix.dirname(asset.storageKey);
      const posterKey = `${dir}/poster.jpg`;
      const thumbKey = `${dir}/thumb_320.webp`;
      const videoKey = `${dir}/video_720p.mp4`;
      const audioKey = `${dir}/audio.mp3`;

      await putObjectToS3(posterKey, posterPath, "image/jpeg", signal);
      await putObjectToS3(thumbKey, thumbPath, "image/webp", signal);
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
      await this.cancel.throwIf(jobId, job.data.assetId);

      const videoPath = path.join(tmpDir, "video_720p.mp4");
      // Уже H.264 720p с нормальным битрейтом — перекодирование заняло бы
      // минуты CPU ради того же качества. Копируем потоки как есть.
      const remux = await canRemuxTo720p(originalPath, signal);
      this.log.info({ assetId: asset.id, remux }, "720p mode");
      const videoArgs = remux
        ? remux720pArgs(originalPath, videoPath, hasAudio)
        : transcode720pArgs(originalPath, videoPath, hasAudio);
      await runFfmpeg(videoArgs, {
        signal,
        onStdout: createFfmpegTimeParser((ms) => {
          if (durationMs <= 0) return;
          const percent = Math.min(
            99,
            Math.max(0, Math.round((ms / durationMs) * 100)),
          );
          this.throttledProgress(asset.userId, asset.id, percent);
        }),
      });

      await putObjectToS3(videoKey, videoPath, "video/mp4", signal);
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
          await runFfmpeg(extractMp3Args(originalPath, audioPath), { signal });
          await putObjectToS3(audioKey, audioPath, "audio/mpeg", signal);
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
          if (isJobCanceledError(err)) throw err;
          this.log.warn({ err, assetId: asset.id }, "audio extract skipped");
        }
      }

      await this.cancel.throwIf(jobId, job.data.assetId);

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
      await this.notifyQueue.add({
        userId: asset.userId,
        assetId: asset.id,
        status: "READY",
      });

      this.log.info({ posterKey, thumbKey, videoKey }, "derivatives stored");
    } catch (err) {
      const abortKind = await resolveAbort(
        err,
        this.cancel,
        jobId,
        job.data.assetId,
        this.shutdown,
      );
      if (abortKind === "canceled") {
        if (job.data.edit) {
          await persistEditCanceled(
            job.data.assetId,
            job.data.userId,
            this.mediaEvents,
          );
        } else {
          await persistCanceled(
            job.data.assetId,
            job.data.userId,
            this.mediaEvents,
          );
        }
        return;
      }
      if (abortKind === "shutdown") {
        throw new WorkerShutdownError();
      }
      const fatal =
        err instanceof UnrecoverableError ||
        isFatalJobError(err, job.attemptsMade, job.opts.attempts);
      if (fatal) {
        await this.persistFailure(
          jobId,
          job.data.assetId,
          job.data.userId,
          err,
          Boolean(job.data.edit),
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
      stopAbort?.();
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

  private async runEdit(
    asset: {
      id: string;
      userId: string;
      storageKey: string;
      width: number | null;
      height: number | null;
      durationMs: number | null;
    },
    edit: EditJobPayload,
    tmpDir: string,
    jobId: string,
    signal: AbortSignal,
  ) {
    if (!isVideoEditPreset(edit.preset)) {
      throw new UnrecoverableError("preset mismatch");
    }
    if (
      edit.preset === "trim" &&
      (edit.startMs == null || edit.endMs == null)
    ) {
      throw new UnrecoverableError("bad trim");
    }

    const rendition = await prisma.derivative.findUnique({
      where: { assetId_kind: { assetId: asset.id, kind: "VIDEO_720P" } },
    });
    if (!rendition) {
      throw new UnrecoverableError("Нет ролика 720p");
    }

    const stale = await prisma.derivative.findMany({
      where: { assetId: asset.id, kind: { in: ["EXPORT", "AUDIO_MP3"] } },
    });
    const inputPath = path.join(tmpDir, "source.mp4");
    await getObjectToFile(rendition.storageKey, inputPath, signal);
    await this.cancel.throwIf(jobId, asset.id);

    const hasAudio =
      edit.preset === "mute" ? false : await fileHasAudio(inputPath, signal);
    const outputPath = path.join(tmpDir, "export.mp4");
    const args = videoEditArgs(
      edit.preset === "trim"
        ? { preset: "trim", startMs: edit.startMs ?? 0, endMs: edit.endMs ?? 0 }
        : { preset: edit.preset },
      inputPath,
      outputPath,
      hasAudio,
    );
    const durationMs = editOutputDurationMs(
      edit.preset,
      asset.durationMs ?? 0,
      edit.startMs,
      edit.endMs,
    );
    this.lastProgressAt = 0;
    this.lastProgressPct = -1;
    await runFfmpeg(args, {
      signal,
      onStdout: createFfmpegTimeParser((ms) => {
        if (durationMs <= 0) return;
        const percent = Math.min(
          99,
          Math.max(0, Math.round((ms / durationMs) * 100)),
        );
        this.throttledProgress(asset.userId, asset.id, percent);
      }),
    });
    await this.cancel.throwIf(jobId, asset.id);

    const meta = await probeVideoFile(outputPath, signal);
    const stills = await this.renderStills(
      outputPath,
      meta.durationMs,
      tmpDir,
      signal,
    );
    let audioPath: string | null = null;
    if (hasAudio && (await fileHasAudio(outputPath, signal))) {
      const candidate = path.join(tmpDir, "audio.mp3");
      try {
        await runFfmpeg(extractMp3Args(outputPath, candidate), { signal });
        audioPath = candidate;
      } catch (err) {
        if (isJobCanceledError(err)) throw err;
        this.log.warn({ err, assetId: asset.id }, "audio extract skipped");
      }
    }
    await this.cancel.throwIf(jobId, asset.id);

    // Past this point the 720p object is overwritten: no more cancel checks,
    // and uploads run without the abort signal so metadata cannot diverge.
    const dir = path.posix.dirname(asset.storageKey);
    const posterKey = `${dir}/poster.jpg`;
    const thumbKey = `${dir}/thumb_320.webp`;
    const audioKey = `${dir}/audio.mp3`;
    await putObjectToS3(rendition.storageKey, outputPath, "video/mp4");
    await putObjectToS3(posterKey, stills.posterPath, "image/jpeg");
    await putObjectToS3(thumbKey, stills.thumbPath, "image/webp");
    if (audioPath) await putObjectToS3(audioKey, audioPath, "audio/mpeg");

    const videoStat = await fs.stat(outputPath);
    await this.saveDerivative(
      asset.id,
      jobId,
      "VIDEO_720P",
      rendition.storageKey,
      "video/mp4",
      { size: videoStat.size, width: meta.width, height: meta.height },
    );
    await this.saveDerivative(
      asset.id,
      jobId,
      "POSTER",
      posterKey,
      "image/jpeg",
      stills.poster,
    );
    await this.saveDerivative(
      asset.id,
      jobId,
      "THUMBNAIL",
      thumbKey,
      "image/webp",
      stills.thumb,
    );
    if (audioPath) {
      const audioStat = await fs.stat(audioPath);
      await this.saveDerivative(
        asset.id,
        jobId,
        "AUDIO_MP3",
        audioKey,
        "audio/mpeg",
        { size: audioStat.size, width: null, height: null },
      );
    }

    const dropped = stale.filter(
      (item) => item.kind === "EXPORT" || !audioPath,
    );
    if (dropped.length > 0) {
      await prisma.derivative.deleteMany({
        where: { id: { in: dropped.map((item) => item.id) } },
      });
      for (const item of dropped) {
        await deleteObject(item.storageKey).catch((err: unknown) => {
          this.log.warn({ err, key: item.storageKey }, "stale file delete failed");
        });
      }
    }

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        durationMs: meta.durationMs,
        width: meta.width,
        height: meta.height,
        codec: meta.codec,
        bitrate:
          meta.bitrate ??
          Math.round((videoStat.size * 8 * 1000) / meta.durationMs),
        sizeBytes: BigInt(videoStat.size),
      },
    });

    await markJobDone(jobId);
    await markAssetReady(asset.id);
    await this.mediaEvents.publish({
      userId: asset.userId,
      assetId: asset.id,
      status: "READY",
      progress: 100,
    });
    this.log.info(
      { key: rendition.storageKey, preset: edit.preset },
      "video edit replaced rendition",
    );
  }

  private async renderStills(
    videoPath: string,
    durationMs: number,
    tmpDir: string,
    signal: AbortSignal,
  ) {
    const seekSec = durationMs > 0 ? (durationMs * 0.2) / 1000 : 0;
    const framePath = path.join(tmpDir, "frame.jpg");
    await fs.rm(framePath, { force: true });
    await runFfmpeg(extractFrameArgs(videoPath, framePath, seekSec), {
      signal,
    });

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
    return { posterPath, thumbPath, poster, thumb };
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
    keepReady = false,
  ): Promise<void> {
    if (jobId) {
      try {
        await markJobFailed(jobId, err);
      } catch (updateErr) {
        this.log.warn({ err: updateErr, jobId }, "failed to persist job error");
      }
    }
    try {
      if (keepReady) await markAssetReady(assetId);
      else await markAssetFailed(assetId);
    } catch (updateErr) {
      this.log.warn(
        { err: updateErr, assetId },
        "failed to persist asset error",
      );
    }
    await this.mediaEvents.publish({
      userId,
      assetId,
      status: keepReady ? "READY" : "FAILED",
    });
    if (keepReady) return;
    await this.notifyQueue.add({
      userId,
      assetId,
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
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
