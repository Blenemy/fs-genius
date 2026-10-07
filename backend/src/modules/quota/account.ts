import type { AssetKind, AssetStatus } from "../../generated/prisma/client.js";

export type QuotaAsset = {
  id: string;
  sizeBytes: bigint;
  status: AssetStatus;
  kind: AssetKind | null;
  contentType: string;
  derivatives: { sizeBytes: bigint }[];
};

/** Original is dropped after a successful video transcode. */
export function countsOriginalObject(
  status: AssetStatus,
  kind: AssetKind | null,
): boolean {
  if (status === "PENDING") return false;
  if (kind === "VIDEO" && status === "READY") return false;
  return true;
}

export function isVideoLike(
  kind: AssetKind | null,
  contentType: string,
): boolean {
  if (kind === "VIDEO") return true;
  return contentType.startsWith("video/");
}

export function isActiveVideo(asset: QuotaAsset, exceptId?: string): boolean {
  if (exceptId && asset.id === exceptId) return false;
  if (asset.status !== "PROCESSING" && asset.status !== "UPLOADED") {
    return false;
  }
  return isVideoLike(asset.kind, asset.contentType);
}

export function exceedsQuota(
  used: bigint,
  incoming: bigint,
  cap: bigint,
): boolean {
  return used + incoming > cap;
}

export function usedBytesOf(assets: QuotaAsset[]): bigint {
  let total = 0n;
  for (const asset of assets) {
    if (asset.status === "PENDING") {
      total += asset.sizeBytes;
      continue;
    }
    if (countsOriginalObject(asset.status, asset.kind)) {
      total += asset.sizeBytes;
    }
    for (const deriv of asset.derivatives) {
      total += deriv.sizeBytes;
    }
  }
  return total;
}

export function activeVideoCount(
  assets: QuotaAsset[],
  exceptId?: string,
): number {
  return assets.filter((asset) => isActiveVideo(asset, exceptId)).length;
}
