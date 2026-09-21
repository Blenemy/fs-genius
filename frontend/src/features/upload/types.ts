export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type AllowedVideoType = (typeof ALLOWED_VIDEO_TYPES)[number];
export type MediaKind = 'image' | 'video';

const EXT_MIME: Record<string, AllowedImageType | AllowedVideoType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

/** Picker hint. Extensions cover mkv/mov when the browser leaves `file.type` empty. */
export const ACCEPT_MEDIA = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
].join(',');

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

export function formatBytes(bytes: number): string {
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (bytes >= gb) {
    const value = bytes / gb;
    return Number.isInteger(value) ? `${value} ГБ` : `${value.toFixed(1)} ГБ`;
  }
  if (bytes >= mb) {
    const value = bytes / mb;
    return Number.isInteger(value) ? `${value} МБ` : `${value.toFixed(1)} МБ`;
  }
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

/**
 * Mime to send on presign. Trust a known browser type.
 * Fall back to the extension only when the type is missing or octet-stream
 * (typical for .mkv on Windows).
 */
export function contentTypeFor(file: File): string {
  if (isListedType(file.type)) return file.type;
  if (file.type && file.type !== 'application/octet-stream') return file.type;

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? file.type;
}

export function mediaKindOf(file: File): MediaKind | null {
  const type = contentTypeFor(file);
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) return 'image';
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)) return 'video';
  return null;
}

function isListedType(type: string): boolean {
  return (
    (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type) ||
    (ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)
  );
}
