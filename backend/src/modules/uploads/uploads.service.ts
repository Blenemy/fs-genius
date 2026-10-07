import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { childLogger } from "../../lib/logger.js";
import {
  deleteObject,
  getObjectPrefix,
  headObject,
  isS3Configured,
  presignPut,
} from "../../lib/s3.js";
import type { ProbeQueue } from "../../queues/probe.queue.js";
import type { MediaEventsPublisher } from "../../lib/media-events-publisher.js";
import type { QuotaService } from "../quota/quota.service.js";
import { ASSET_TTL_MS } from "../quota/limits.js";
import { extensionFor, type PresignInput } from "./uploads.schema.js";
import {
  detectMime,
  matchClaimedType,
  SIGNATURE_BYTES,
} from "./signature.js";

export class UploadsService {
  private readonly log = childLogger({ service: "uploads" });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly probeQueue: ProbeQueue,
    private readonly mediaEvents: MediaEventsPublisher,
    private readonly quota: QuotaService,
  ) {}

  async presign(input: PresignInput, userId: string) {
    if (!isS3Configured()) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Хранилище не настроено");
    }

    const ext = extensionFor(input.contentType);
    await this.quota.ensureWriteBudget();

    const created = await this.quota.withUserLock(
      userId,
      async (tx, quota, assets) => {
        const incoming = BigInt(input.sizeBytes);
        this.quota.ensureFits(quota, assets, incoming, input.contentType);
        await this.quota.ensureGlobalFits(tx, incoming);
        return tx.asset.create({
          data: {
            userId,
            originalName: input.fileName,
            contentType: input.contentType,
            sizeBytes: BigInt(input.sizeBytes),
            expiresAt: new Date(Date.now() + ASSET_TTL_MS),
            storageKey: `draft:${process.hrtime.bigint()}`,
          },
        });
      },
    );

    const storageKey = `u/${userId}/${created.id}/original.${ext}`;

    const asset = await this.prisma.asset.update({
      where: { id: created.id },
      data: { storageKey },
    });

    const uploadUrl = await presignPut(asset.storageKey, asset.contentType);

    return {
      assetId: asset.id,
      uploadUrl,
      headers: { "Content-Type": asset.contentType },
    };
  }

  async complete(assetId: string, userId: string) {
    if (!isS3Configured()) {
      throw new AppError(503, "STORAGE_UNAVAILABLE", "Хранилище не настроено");
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Загрузка не найдена");
    }

    if (asset.status !== "PENDING") {
      return { assetId: asset.id, status: asset.status };
    }

    let head: { contentLength: number } | null;
    try {
      head = await headObject(asset.storageKey);
    } catch {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось проверить файл в хранилище",
      );
    }

    if (!head) {
      throw new AppError(
        400,
        "UPLOAD_INCOMPLETE",
        "Файл в хранилище не найден",
      );
    }

    if (BigInt(head.contentLength) !== asset.sizeBytes) {
      throw new AppError(
        400,
        "SIZE_MISMATCH",
        "Размер в хранилище не совпал с заявленным",
        { expected: Number(asset.sizeBytes), actual: head.contentLength },
      );
    }

    const detected = await this.readSignature(asset.storageKey);
    const match = matchClaimedType(asset.contentType, detected);
    if (!match.ok) {
      await this.discardRejected(asset.id, asset.storageKey);
      throw new AppError(
        400,
        "INVALID_FILE_TYPE",
        "Файл не похож на картинку или видео",
        { claimed: asset.contentType, detected },
      );
    }

    const claimed = await this.quota.withUserLock(
      userId,
      async (tx, _quota, assets) => {
        const current = await tx.asset.findUnique({
          where: { id: asset.id },
        });
        if (!current || current.userId !== userId) {
          throw new AppError(404, "NOT_FOUND", "Загрузка не найдена");
        }
        if (current.status !== "PENDING") {
          return { kind: "noop" as const, status: current.status };
        }

        this.quota.ensureVideoSlot(
          assets,
          current.kind,
          match.contentType,
        );

        const updated = await tx.asset.update({
          where: { id: current.id },
          data: { status: "PROCESSING", contentType: match.contentType },
        });
        const mediaJob = await tx.job.create({
          data: {
            assetId: current.id,
            type: "PROBE",
            status: "QUEUED",
          },
        });
        return { kind: "queued" as const, updated, mediaJob };
      },
    );

    if (claimed.kind === "noop") {
      return { assetId: asset.id, status: claimed.status };
    }

    const queued = await this.probeQueue.add({
      assetId: claimed.updated.id,
      userId: claimed.updated.userId,
      jobId: claimed.mediaJob.id,
    });

    await this.prisma.job.update({
      where: { id: claimed.mediaJob.id },
      data: { queueJobId: String(queued.id) },
    });

    await this.mediaEvents.publish({
      userId: claimed.updated.userId,
      assetId: claimed.updated.id,
      status: "PROCESSING",
    });

    return { assetId: claimed.updated.id, status: claimed.updated.status };
  }

  private async readSignature(storageKey: string): Promise<string | null> {
    let prefix: Buffer | null;
    try {
      prefix = await getObjectPrefix(storageKey, SIGNATURE_BYTES);
    } catch (err) {
      this.log.warn({ err, storageKey }, "signature read failed");
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось проверить файл в хранилище",
      );
    }

    if (!prefix) {
      throw new AppError(
        400,
        "UPLOAD_INCOMPLETE",
        "Файл в хранилище не найден",
      );
    }

    return detectMime(prefix);
  }

  /** Черновик и объект убираем сразу: иначе квота держит мусор до уборщика. */
  private async discardRejected(
    assetId: string,
    storageKey: string,
  ): Promise<void> {
    try {
      await this.prisma.asset.delete({ where: { id: assetId } });
    } catch (err) {
      this.log.warn({ err, assetId }, "rejected upload row delete failed");
    }

    try {
      await deleteObject(storageKey);
    } catch (err) {
      this.log.warn(
        { err, assetId, storageKey },
        "rejected upload object delete failed",
      );
    }
  }
}
