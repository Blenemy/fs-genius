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
  MONTHLY_WRITE_OPS_CAP,
} from "./limits.js";
import { readWriteOps } from "../../lib/storage-ops.js";
import { childLogger } from "../../lib/logger.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type QuotaSnapshot = {
  quotaBytes: number;
  usedBytes: number;
  videoBusy: boolean;
  globalQuotaBytes: number;
  globalUsedBytes: number;
};

export class QuotaService {
  private readonly log = childLogger({ service: "quota" });

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

  /**
   * Предохранитель от счёта за операции: файлы можно грузить и удалять по
   * кругу, место освобождается, а записи копятся. Без Redis считаем, что
   * бюджет кончился — молча пропустить дороже, чем отказать.
   */
  async ensureWriteBudget(): Promise<void> {
    let used: number;
    try {
      used = await readWriteOps();
    } catch (err) {
      this.log.warn({ err }, "write budget unknown, refusing");
      throw new AppError(
        503,
        "WRITE_BUDGET_UNAVAILABLE",
        "Сейчас нельзя загружать и обрабатывать файлы. Попробуй позже.",
      );
    }
    if (used < MONTHLY_WRITE_OPS_CAP) return;
    this.log.warn({ used, cap: MONTHLY_WRITE_OPS_CAP }, "write budget exhausted");
    throw new AppError(
      503,
      "WRITE_BUDGET_EXHAUSTED",
      "Лимит операций хранилища на этот месяц исчерпан. Загрузка и обработка откроются в начале следующего месяца.",
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
        derivatives: { select: { sizeBytes: true, kind: true } },
      },
    });
  }
}

function toCount(value: bigint): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
