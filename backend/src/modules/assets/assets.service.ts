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
import type { EditJobPayload } from "../../shared/edits.js";
import {
  editReserveBytes,
  exportFile,
  normalizeEdit,
  toEditPayload,
} from "../../shared/edits.js";
import type { EditRequestBody } from "./assets.schema.js";

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
  presetKey: string | null;
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
          const name = downloadName(row.originalName, item.kind, item.mimeType);
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
        presetKey: job.presetKey,
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
      return { ok: true as const, pending: false, status: "CANCELED" as const };
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
    const editing =
      openJobs.length > 0 && openJobs.every((job) => job.type === "EDIT");
    if (running) {
      return { ok: true as const, pending: true, status: "PROCESSING" as const };
    }

    const nextStatus = editing ? "READY" : "CANCELED";
    await this.prisma.job.updateMany({
      where: {
        assetId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: { status: "CANCELED", finishedAt: new Date() },
    });
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: nextStatus },
    });
    await this.mediaEvents.publish({
      userId,
      assetId,
      status: nextStatus,
    });

    return { ok: true as const, pending: false, status: nextStatus };
  }

  async startEdit(assetId: string, userId: string, body: EditRequestBody) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { derivatives: true, jobs: true },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }
    if (asset.status !== "READY") {
      throw new AppError(
        409,
        "NOT_READY",
        "Сначала дождись окончания обработки",
      );
    }
    if (asset.kind !== "IMAGE" && asset.kind !== "VIDEO") {
      throw new AppError(409, "NOT_READY", "Файл ещё не разобран");
    }

    const normalized = normalizeEdit(asset.kind, body, asset.durationMs);
    if (!normalized.ok) {
      throw new AppError(400, "VALIDATION_FAILED", normalized.message);
    }
    const edit = normalized.edit;

    const source =
      edit.kind === "image"
        ? { key: asset.storageKey, sizeBytes: asset.sizeBytes }
        : (() => {
            const rendition = asset.derivatives.find(
              (item) => item.kind === "VIDEO_720P",
            );
            return rendition
              ? { key: rendition.storageKey, sizeBytes: rendition.sizeBytes }
              : null;
          })();
    if (!source) {
      throw new AppError(
        409,
        "NO_RENDITION",
        "Нет готового ролика. Дождись обработки или загрузи заново",
      );
    }

    let head;
    try {
      head = await headObject(source.key);
    } catch {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось проверить файл в хранилище",
      );
    }
    if (!head) {
      throw new AppError(
        409,
        "SOURCE_GONE",
        edit.kind === "video"
          ? "Ролик 720p уже удалён, загрузи заново"
          : "Исходный файл уже удалён, загрузи заново",
      );
    }

    const file = exportFile(edit);
    const dir = pathDir(asset.storageKey);
    const nextKey = dir ? `${dir}/${file.name}` : file.name;
    const previous = asset.derivatives.find((item) => item.kind === "EXPORT");
    const sourceBytes =
      head.contentLength > 0 ? BigInt(head.contentLength) : source.sizeBytes;
    // Video edits overwrite the 720p in place; reserve the whole source as the
    // upper bound because the re-encode can come out larger than its input.
    const reserve = editReserveBytes(
      sourceBytes,
      previous && edit.kind === "image"
        ? { sizeBytes: previous.sizeBytes, storageKey: previous.storageKey }
        : null,
      nextKey,
    );
    const contentType = edit.kind === "video" ? "video/mp4" : "image/jpeg";
    await this.quota.ensureWriteBudget();

    const claimed = await this.quota.withUserLock(
      userId,
      async (tx, quota, assets) => {
        const current = await tx.asset.findUnique({
          where: { id: asset.id },
          include: {
            jobs: {
              where: { status: { in: ["QUEUED", "RUNNING"] } },
              select: { id: true },
            },
          },
        });
        if (!current || current.userId !== userId) {
          throw new AppError(404, "NOT_FOUND", "Файл не найден");
        }
        if (current.status !== "READY") {
          throw new AppError(
            409,
            "NOT_READY",
            "Сначала дождись окончания обработки",
          );
        }
        if (current.jobs.length > 0) {
          throw new AppError(409, "BUSY", "Уже идёт обработка");
        }

        this.quota.ensureVideoSlot(
          assets,
          current.kind,
          contentType,
          current.id,
        );
        this.quota.ensureFits(quota, assets, reserve, contentType);
        await this.quota.ensureGlobalFits(tx, reserve);

        const mediaJob = await tx.job.create({
          data: {
            assetId: current.id,
            type: "EDIT",
            status: "QUEUED",
            presetKey: edit.preset,
            presetParams:
              edit.kind === "video" && edit.preset === "trim"
                ? { startMs: edit.startMs, endMs: edit.endMs }
                : undefined,
          },
        });
        await tx.asset.update({
          where: { id: current.id },
          data: { status: "PROCESSING" },
        });
        return { mediaJob, userId: current.userId };
      },
    );

    const payload = toEditPayload(edit);
    const queued = await this.enqueueEdit(edit.kind === "video" ? "VIDEO" : "IMAGE", {
      assetId: asset.id,
      userId: claimed.userId,
      jobId: claimed.mediaJob.id,
      edit: payload,
    }).catch(async (err: unknown) => {
      await this.prisma.job.update({
        where: { id: claimed.mediaJob.id },
        data: {
          status: "FAILED",
          error: "Не удалось поставить задачу",
          finishedAt: new Date(),
        },
      });
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: "READY" },
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
      progress: 0,
    });

    return { ok: true as const, status: "PROCESSING" as const };
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

    await this.quota.ensureWriteBudget();
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

  private enqueueEdit(
    kind: "IMAGE" | "VIDEO",
    data: {
      assetId: string;
      userId: string;
      jobId: string;
    edit: EditJobPayload;
    },
  ) {
    if (kind === "VIDEO") {
      return this.addFresh(this.videoQueue, data);
    }
    return this.addFresh(this.imageQueue, data);
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
    data: {
      assetId: string;
      userId: string;
      jobId: string;
      edit?: EditJobPayload;
    },
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
    const exported = asset.derivatives.find((item) => item.kind === "EXPORT");
    const exportImage = exported?.mimeType.startsWith("image/")
      ? exported
      : null;
    const exportVideo = exported?.mimeType.startsWith("video/")
      ? exported
      : null;
    const thumb = asset.derivatives.find((d) => d.kind === "THUMBNAIL");
    const poster = asset.derivatives.find((d) => d.kind === "POSTER");
    const video = asset.derivatives.find((d) => d.kind === "VIDEO_720P");
    const still = exportImage ?? thumb ?? poster;
    const playback = exportVideo ?? video;
    const url = await presignGet(still?.storageKey ?? asset.storageKey);
    const playbackUrl = playback ? await presignGet(playback.storageKey) : null;

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
    "EXPORT",
    "POSTER",
    "THUMBNAIL",
    "PREVIEW",
    "VIDEO_720P",
    "AUDIO_MP3",
  ];
  const index = order.indexOf(kind);
  return index === -1 ? order.length : index;
}

function downloadName(
  originalName: string,
  kind: DerivKind,
  mimeType?: string,
): string {
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
    case "EXPORT":
      return `${stem}_result.${exportExt(mimeType)}`;
    default:
      return originalName;
  }
}

function exportExt(mimeType: string | undefined): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "video/mp4") return "mp4";
  return "jpg";
}

function pathDir(storageKey: string): string {
  const slash = storageKey.lastIndexOf("/");
  return slash === -1 ? "" : storageKey.slice(0, slash);
}
