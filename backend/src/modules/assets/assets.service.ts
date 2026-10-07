import type {
  AssetKind,
  AssetStatus,
  DerivKind,
  JobType,
} from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { headObject, presignGet } from "../../lib/s3.js";
import type { ProbeQueue } from "../../queues/probe.queue.js";
import type { ImageQueue } from "../../queues/image.queue.js";
import type { VideoQueue } from "../../queues/video.queue.js";
import type { JobCancelStore } from "../../lib/job-cancel.js";
import type { MediaEventsPublisher } from "../../lib/media-events-publisher.js";
import type { QuotaService } from "../quota/quota.service.js";
import { purgeAsset } from "../cleanup/purge.js";

export type AssetClient = {
  id: string;
  originalName: string;
  contentType: string;
  sourceType: string;
  status: AssetStatus;
  kind: AssetKind | null;
  url: string;
  playbackUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
  bitrate: number | null;
  sizeBytes: number;
  progress?: number;
  createdAt: Date;
};

export type AssetFileLink = {
  url: string;
  downloadUrl: string;
  sizeBytes: number;
};

export type AssetDerivativeClient = AssetFileLink & {
  kind: DerivKind;
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type AssetJobClient = {
  id: string;
  type: JobType;
  status: string;
  error: string | null;
  attempts: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type AssetDetailClient = AssetClient & {
  original: AssetFileLink | null;
  derivatives: AssetDerivativeClient[];
  jobs: AssetJobClient[];
};

type AssetRow = {
  id: string;
  userId: string;
  originalName: string;
  contentType: string;
  status: AssetStatus;
  kind: AssetKind | null;
  storageKey: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  codec: string | null;
  bitrate: number | null;
  sizeBytes: bigint;
  createdAt: Date;
  derivatives: {
    kind: DerivKind;
    storageKey: string;
    mimeType: string;
    sizeBytes: bigint;
    width: number | null;
    height: number | null;
  }[];
};

export class AssetService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly probeQueue: ProbeQueue,
    private readonly imageQueue: ImageQueue,
    private readonly videoQueue: VideoQueue,
    private readonly cancelStore: JobCancelStore,
    private readonly mediaEvents: MediaEventsPublisher,
    private readonly quota: QuotaService,
  ) {}

  async getAssets(userId: string) {
    const rows = await this.prisma.asset.findMany({
      where: { userId, status: { not: "PENDING" } },
      include: { derivatives: true },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(rows.map((row) => this.toClient(row)));
  }

  async getProcessingAssets(userId: string) {
    const rows = await this.prisma.asset.findMany({
      where: { userId, status: "PROCESSING" },
      include: { derivatives: true },
      orderBy: { createdAt: "desc" },
    });

    return Promise.all(rows.map((row) => this.toClient(row)));
  }

  async getClientAsset(assetId: string, userId: string) {
    const row = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { derivatives: true },
    });

    if (!row || row.userId !== userId) return null;
    return this.toClient(row);
  }

  async getAssetDetail(assetId: string, userId: string): Promise<AssetDetailClient> {
    const row = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        derivatives: true,
        jobs: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!row || row.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    const base = await this.toClient(row);
    const derivatives = await Promise.all(
      [...row.derivatives]
        .sort((a, b) => derivOrder(a.kind) - derivOrder(b.kind))
        .map(async (item) => {
          const name = downloadName(row.originalName, item.kind);
          return {
            kind: item.kind,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
            sizeBytes: toCount(item.sizeBytes),
            url: await presignGet(item.storageKey),
            downloadUrl: await presignGet(item.storageKey, 3600, name),
          };
        }),
    );

    let original: AssetFileLink | null = null;
    try {
      const head = await headObject(row.storageKey);
      if (head) {
        original = {
          sizeBytes: toCount(row.sizeBytes),
          url: await presignGet(row.storageKey),
          downloadUrl: await presignGet(
            row.storageKey,
            3600,
            row.originalName,
          ),
        };
      }
    } catch {
      original = null;
    }

    return {
      ...base,
      original,
      derivatives,
      jobs: row.jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        error: job.error,
        attempts: job.attempts,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      })),
    };
  }

  async deleteAsset(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, userId: true },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    await purgeAsset(this.prisma, asset.id);
  }

  async cancelAsset(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { jobs: true },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    if (asset.status === "CANCELED") {
      return { ok: true as const, pending: false };
    }

    if (asset.status === "READY") {
      throw new AppError(409, "ALREADY_READY", "Файл уже обработан");
    }

    if (asset.status !== "PROCESSING" && asset.status !== "UPLOADED") {
      throw new AppError(409, "NOT_CANCELABLE", "Этот файл нельзя отменить");
    }

    const openJobs = asset.jobs.filter(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );

    await this.cancelStore.flagAsset(assetId);
    await Promise.all(openJobs.map((job) => this.cancelStore.flag(job.id)));

    await Promise.all([
      this.probeQueue.remove(assetId).catch(() => 0),
      this.imageQueue.remove(assetId).catch(() => 0),
      this.videoQueue.remove(assetId).catch(() => 0),
    ]);

    const running = openJobs.some((job) => job.status === "RUNNING");
    if (running) {
      return { ok: true as const, pending: true };
    }

    await this.prisma.job.updateMany({
      where: {
        assetId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: { status: "CANCELED", finishedAt: new Date() },
    });
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: "CANCELED" },
    });
    await this.mediaEvents.publish({
      userId,
      assetId,
      status: "CANCELED",
    });

    return { ok: true as const, pending: false };
  }

  async restartAsset(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { jobs: true },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    if (asset.status !== "CANCELED" && asset.status !== "FAILED") {
      throw new AppError(
        409,
        "NOT_RESTARTABLE",
        "Повторить можно только отменённый или упавший файл",
      );
    }

    let original;
    try {
      original = await headObject(asset.storageKey);
    } catch {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось проверить файл в хранилище",
      );
    }

    if (!original) {
      throw new AppError(
        409,
        "ORIGINAL_GONE",
        "Исходный файл уже удалён, загрузи заново",
      );
    }

    await this.cancelStore.clearAsset(assetId);
    await Promise.all(asset.jobs.map((job) => this.cancelStore.clear(job.id)));

    const claimed = await this.quota.withUserLock(
      userId,
      async (tx, _quota, assets) => {
        const current = await tx.asset.findUnique({
          where: { id: asset.id },
        });
        if (!current || current.userId !== userId) {
          throw new AppError(404, "NOT_FOUND", "Файл не найден");
        }
        if (current.status !== "CANCELED" && current.status !== "FAILED") {
          throw new AppError(
            409,
            "NOT_RESTARTABLE",
            "Повторить можно только отменённый или упавший файл",
          );
        }

        this.quota.ensureVideoSlot(
          assets,
          current.kind,
          current.contentType,
          current.id,
        );

        const jobType = this.restartJobType(current.kind, current.durationMs);
        const mediaJob = await tx.job.create({
          data: {
            assetId: current.id,
            type: jobType,
            status: "QUEUED",
          },
        });
        await tx.asset.update({
          where: { id: current.id },
          data: { status: "PROCESSING" },
        });
        return { mediaJob, jobType, userId: current.userId };
      },
    );

    const queued = await this.enqueueRestart(claimed.jobType, {
      assetId: asset.id,
      userId: claimed.userId,
      jobId: claimed.mediaJob.id,
    }).catch(async (err: unknown) => {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: "CANCELED" },
      });
      throw err instanceof AppError
        ? err
        : new AppError(503, "QUEUE_UNAVAILABLE", "Не удалось поставить задачу");
    });

    await this.prisma.job.update({
      where: { id: claimed.mediaJob.id },
      data: { queueJobId: String(queued.id) },
    });

    await this.mediaEvents.publish({
      userId: asset.userId,
      assetId: asset.id,
      status: "PROCESSING",
    });

    return { ok: true as const, status: "PROCESSING" as const };
  }

  private restartJobType(
    kind: AssetKind | null,
    durationMs: number | null,
  ): JobType {
    if (kind === "VIDEO" && durationMs && durationMs > 0) {
      return "VIDEO_TRANSCODE";
    }
    if (kind === "IMAGE") return "IMAGE_VARIANTS";
    return "PROBE";
  }

  private enqueueRestart(
    type: JobType,
    data: { assetId: string; userId: string; jobId: string },
  ) {
    if (type === "VIDEO_TRANSCODE") {
      return this.addFresh(this.videoQueue, data);
    }
    if (type === "IMAGE_VARIANTS") {
      return this.addFresh(this.imageQueue, data);
    }
    return this.addFresh(this.probeQueue, data);
  }

  private async addFresh(
    queue: ProbeQueue | ImageQueue | VideoQueue,
    data: { assetId: string; userId: string; jobId: string },
  ) {
    await queue.discard(data.assetId).catch(() => undefined);
    try {
      return await queue.add(data);
    } catch (err) {
      if (!(err instanceof Error) || !/already exists/i.test(err.message)) {
        throw err;
      }
      await queue.discard(data.assetId).catch(() => undefined);
      return queue.add(data);
    }
  }

  private async toClient(asset: AssetRow): Promise<AssetClient> {
    const thumb = asset.derivatives.find((d) => d.kind === "THUMBNAIL");
    const poster = asset.derivatives.find((d) => d.kind === "POSTER");
    const video = asset.derivatives.find((d) => d.kind === "VIDEO_720P");
    const still = thumb ?? poster;
    const url = await presignGet(still?.storageKey ?? asset.storageKey);
    const playbackUrl = video ? await presignGet(video.storageKey) : null;

    return {
      id: asset.id,
      originalName: asset.originalName,
      contentType: still?.mimeType ?? asset.contentType,
      sourceType: asset.contentType,
      status: asset.status,
      kind: asset.kind,
      url,
      playbackUrl,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      codec: asset.codec,
      bitrate: asset.bitrate,
      sizeBytes: toCount(asset.sizeBytes),
      createdAt: asset.createdAt,
    };
  }
}

function toCount(value: bigint): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function derivOrder(kind: DerivKind): number {
  const order: DerivKind[] = [
    "POSTER",
    "THUMBNAIL",
    "PREVIEW",
    "VIDEO_720P",
    "AUDIO_MP3",
  ];
  const index = order.indexOf(kind);
  return index === -1 ? order.length : index;
}

function downloadName(originalName: string, kind: DerivKind): string {
  const stem = originalName.replace(/\.[^.]+$/, "") || "file";
  switch (kind) {
    case "POSTER":
      return `${stem}_poster.jpg`;
    case "THUMBNAIL":
      return `${stem}_thumb.webp`;
    case "PREVIEW":
      return `${stem}_preview.webp`;
    case "VIDEO_720P":
      return `${stem}_720p.mp4`;
    case "AUDIO_MP3":
      return `${stem}_audio.mp3`;
    default:
      return originalName;
  }
}
