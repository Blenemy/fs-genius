import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { deleteObject, presignGet } from "../../lib/s3.js";

export class AssetService {
  constructor(private readonly prisma: PrismaClient) {}

  async getAssets(userId: string) {
    const rows = await this.prisma.asset.findMany({
      where: { userId, status: { not: "PENDING" } },
      include: { derivatives: true },
      orderBy: { createdAt: "desc" },
    });

    const assets = await Promise.all(
      rows.map(async (asset) => {
        const thumb = asset.derivatives.find((d) => d.kind === "THUMBNAIL");
        const url = await presignGet(thumb?.storageKey ?? asset.storageKey);

        return {
          id: asset.id,
          originalName: asset.originalName,
          contentType: thumb?.mimeType ?? asset.contentType,
          status: asset.status,
          url,
          createdAt: asset.createdAt,
        };
      }),
    );

    return assets;
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
}
