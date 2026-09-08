export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** POST /api/uploads/presign */
export interface PresignRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * uploadUrl — presigned PUT to MinIO (host the browser can reach).
 * headers — must be sent on PUT, same values that were signed (usually Content-Type).
 */
export interface PresignResponse {
  assetId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

/** POST /api/uploads/:id/complete — JSON body, always. */
export interface CompleteResponse {
  assetId: string;
  status: string;
}

export function isAllowedImage(file: File): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
}
