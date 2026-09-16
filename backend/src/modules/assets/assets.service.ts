import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { deleteObject, presignGet } from "../../lib/s3.js";

export class AssetService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAssets(userId: string) {
    const rows = await this.prisma.asset.findMany({
      where: { status: "UPLOADED", userId },
      orderBy: { createdAt: "desc" },
    });

    const assets = await Promise.all(
      rows.map(async (asset) => ({
        id: asset.id,
        originalName: asset.originalName,
        contentType: asset.contentType,
        url: await presignGet(asset.storageKey),
        createdAt: asset.createdAt,
      })),
    );

    return assets;
  }

  async deleteAsset(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Файл не найден");
    }

    try {
      await deleteObject(asset.storageKey);
    } catch {
      throw new AppError(
        503,
        "STORAGE_UNAVAILABLE",
        "Не удалось удалить файл из хранилища",
      );
    }

    await this.prisma.asset.delete({ where: { id: assetId } });
  }
}
