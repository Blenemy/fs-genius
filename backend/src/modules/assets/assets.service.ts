import type { AssetKind, AssetStatus, DerivKind } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { deleteObject, presignGet } from "../../lib/s3.js";

export type AssetClient = {
  id: string;
  originalName: string;
  contentType: string;
  status: AssetStatus;
  kind: AssetKind | null;
  url: string;
  playbackUrl: string | null;
  progress?: number;
  createdAt: Date;
};

type AssetRow = {
  id: string;
  userId: string;
  originalName: string;
  contentType: string;
  status: AssetStatus;
  kind: AssetKind | null;
  storageKey: string;
  createdAt: Date;
  derivatives: {
    kind: DerivKind;
    storageKey: string;
    mimeType: string;
  }[];
};

export class AssetService {
  constructor(private readonly prisma: PrismaClient) {}

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

  async deleteAsset(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { derivatives: true },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    const keys = [
      asset.storageKey,
      ...asset.derivatives.map((d) => d.storageKey),
    ];

    try {
      await Promise.all(keys.map((key) => deleteObject(key)));
    } catch {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось удалить файл из хранилища",
      );
    }

    await this.prisma.asset.delete({ where: { id: assetId } });
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
      status: asset.status,
      kind: asset.kind,
      url,
      playbackUrl,
      createdAt: asset.createdAt,
    };
  }
}
