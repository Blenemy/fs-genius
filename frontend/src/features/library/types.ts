export type AssetStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'CANCELED';

export type AssetKind = 'IMAGE' | 'VIDEO';

export type DerivKind =
  | 'THUMBNAIL'
  | 'PREVIEW'
  | 'POSTER'
  | 'VIDEO_720P'
  | 'AUDIO_MP3';

export type JobType =
  | 'PROBE'
  | 'IMAGE_VARIANTS'
  | 'VIDEO_TRANSCODE'
  | 'AUDIO_EXTRACT';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED';

export interface Asset {
  id: string;
  originalName: string;
  contentType: string;
  sourceType?: string;
  status: AssetStatus;
  /** Thumb, poster, or the original when no derivative exists yet. */
  url: string;
  /**
   * Playable rendition (720p). Absent until the video worker publishes it.
   * While the original itself is a browser video, `url` is the fallback.
   */
  playbackUrl?: string | null;
  kind?: AssetKind | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  codec?: string | null;
  bitrate?: number | null;
  sizeBytes?: number | null;
  /** 0..100 from SSE while ffmpeg runs. Omitted for images. */
  progress?: number | null;
  createdAt: string;
}

export interface AssetFileLink {
  url: string;
  downloadUrl: string;
  sizeBytes: number;
}

export interface AssetDerivative extends AssetFileLink {
  kind: DerivKind;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface AssetJob {
  id: string;
  type: JobType;
  status: JobStatus;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AssetDetail extends Asset {
  original: AssetFileLink | null;
  derivatives: AssetDerivative[];
  jobs: AssetJob[];
}

export function isVideoAsset(asset: Asset): boolean {
  return (
    asset.kind === 'VIDEO' ||
    Boolean(asset.playbackUrl) ||
    asset.contentType.startsWith('video/')
  );
}

/** Source for `<video>`. Poster-only cards have none until transcode finishes. */
export function playbackSrc(asset: Asset): string | null {
  if (asset.playbackUrl) return asset.playbackUrl;
  if (asset.contentType.startsWith('video/')) return asset.url;
  return null;
}

/** Still image for the tile. A raw video url is not a poster. */
export function posterSrc(asset: Asset): string | null {
  if (asset.contentType.startsWith('video/')) return null;
  return asset.url || null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} ГБ`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function formatPixels(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (!width || !height) return '—';
  return `${width}×${height}`;
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return '—';
  const kbps = bps / 1000;
  if (kbps < 1000) return `${Math.round(kbps)} кбит/с`;
  return `${(kbps / 1000).toFixed(1)} Мбит/с`;
}

export const DERIV_LABEL: Record<DerivKind, string> = {
  POSTER: 'Постер',
  THUMBNAIL: 'Миниатюра',
  PREVIEW: 'Превью',
  VIDEO_720P: 'Видео 720p',
  AUDIO_MP3: 'Аудио MP3',
};

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  PROBE: 'Метаданные',
  IMAGE_VARIANTS: 'Превью',
  VIDEO_TRANSCODE: 'Видео 720p',
  AUDIO_EXTRACT: 'Аудио',
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: 'В очереди',
  RUNNING: 'Идёт',
  DONE: 'Готово',
  FAILED: 'Ошибка',
  CANCELED: 'Отменено',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  PENDING: 'Черновик',
  UPLOADED: 'Загружен',
  PROCESSING: 'Обработка',
  READY: 'Готово',
  FAILED: 'Ошибка',
  CANCELED: 'Отменено',
};
