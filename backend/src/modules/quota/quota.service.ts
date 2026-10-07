import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import {
  activeVideoCount,
  exceedsQuota,
  isVideoLike,
  usedBytesOf,
  type QuotaAsset,
} from "./account.js";
import {
  formatQuotaBytes,
  GLOBAL_QUOTA_BYTES,
  MAX_ACTIVE_VIDEOS,
} from "./limits.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type QuotaSnapshot = {
  quotaBytes: number;
  usedBytes: number;
  videoBusy: boolean;
  globalQuotaBytes: number;
  globalUsedBytes: number;
};

export class QuotaService {
  constructor(private readonly prisma: PrismaClient) {}

  async snapshot(userId: string): Promise<QuotaSnapshot> {
    const [user, assets, everyone] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { quotaBytes: true },
      }),
      this.loadAssets(this.prisma, userId),
      this.loadAssets(this.prisma),
    ]);
    const quota = user?.quotaBytes ?? 0n;
    const used = usedBytesOf(assets);
    return {
      quotaBytes: toCount(quota),
      usedBytes: toCount(used),
      videoBusy: activeVideoCount(assets) >= MAX_ACTIVE_VIDEOS,
      globalQuotaBytes: GLOBAL_QUOTA_BYTES,
      globalUsedBytes: toCount(usedBytesOf(everyone)),
    };
  }

  async withUserLock<T>(
    userId: string,
    fn: (
      tx: Prisma.TransactionClient,
      quota: bigint,
      assets: QuotaAsset[],
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM \`QuotaLock\` WHERE id = 1 FOR UPDATE`,
      );
      if (locked.length === 0) {
        throw new AppError(
          503,
          "GLOBAL_QUOTA_UNAVAILABLE",
          "Общий лимит хранилища не настроен",
        );
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`,
      );
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { quotaBytes: true },
      });
      if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
      const assets = await this.loadAssets(tx, userId);
      return fn(tx, user.quotaBytes, assets);
    });
  }

  ensureFits(
    quota: bigint,
    assets: QuotaAsset[],
    sizeBytes: bigint,
    contentType: string,
  ): void {
    const used = usedBytesOf(assets);
    if (exceedsQuota(used, sizeBytes, quota)) {
      throw new AppError(
        413,
        "QUOTA_EXCEEDED",
        "Не хватает места в квоте 500 МБ",
        {
          quotaBytes: toCount(quota),
          usedBytes: toCount(used),
          incomingBytes: toCount(sizeBytes),
        },
      );
    }
    this.ensureVideoSlot(assets, null, contentType);
  }

  /** Сумма по всем пользователям: то же правило, что и личная квота. */
  async ensureGlobalFits(db: Db, incoming: bigint): Promise<void> {
    const used = usedBytesOf(await this.loadAssets(db));
    const cap = BigInt(GLOBAL_QUOTA_BYTES);
    if (!exceedsQuota(used, incoming, cap)) return;
    throw new AppError(
      413,
      "GLOBAL_QUOTA_EXCEEDED",
      `Общее хранилище ${formatQuotaBytes(GLOBAL_QUOTA_BYTES)} заполнено. Место освободится, когда старые файлы истекут.`,
      {
        quotaBytes: GLOBAL_QUOTA_BYTES,
        usedBytes: toCount(used),
        incomingBytes: toCount(incoming),
      },
    );
  }

  ensureVideoSlot(
    assets: QuotaAsset[],
    kind: QuotaAsset["kind"],
    contentType: string,
    exceptAssetId?: string,
  ): void {
    if (!isVideoLike(kind, contentType)) return;
    if (activeVideoCount(assets, exceptAssetId) >= MAX_ACTIVE_VIDEOS) {
      throw new AppError(
        409,
        "VIDEO_BUSY",
        "Уже обрабатывается одно видео. Дождись окончания или отмени его.",
      );
    }
  }

  private loadAssets(db: Db, userId?: string): Promise<QuotaAsset[]> {
    return db.asset.findMany({
      where: userId ? { userId } : undefined,
      select: {
        id: true,
        sizeBytes: true,
        status: true,
        kind: true,
        contentType: true,
        derivatives: { select: { sizeBytes: true } },
      },
    });
  }
}

function toCount(value: bigint): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
