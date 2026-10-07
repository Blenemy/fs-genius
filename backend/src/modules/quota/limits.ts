export const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024;
/** Общий потолок хранилища на всех пользователей. 1 ГБ, чтобы на проде упереться и проверить отказ. */
export const GLOBAL_QUOTA_BYTES = 1 * 1024 * 1024 * 1024;
export const MAX_ACTIVE_VIDEOS = 1;
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CLEANUP_EVERY_MS = 60 * 60 * 1000;
export const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const TMP_DIR_PREFIXES = [
  "img-",
  "vid-",
  "probe-",
  "tg-jpeg-",
  "tg-file-",
  "tg-thumb-",
] as const;

export function formatQuotaBytes(bytes: number): string {
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
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}
