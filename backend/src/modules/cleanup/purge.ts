import type { PrismaClient } from "../../generated/prisma/client.js";
import { deleteObject } from "../../lib/s3.js";

export async function purgeAsset(
  prisma: PrismaClient,
  assetId: string,
): Promise<void> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { derivatives: true },
  });
  if (!asset) return;

  const keys = [
    asset.storageKey,
    ...asset.derivatives.map((item) => item.storageKey),
  ];
  for (const key of keys) {
    if (key.startsWith("draft:")) continue;
    try {
      await deleteObject(key);
    } catch {
      // Missing object is fine: that is what we wanted.
    }
  }
  await prisma.asset.delete({ where: { id: assetId } });
}
