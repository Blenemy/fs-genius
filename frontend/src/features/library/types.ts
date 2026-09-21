export type AssetStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export type AssetKind = 'IMAGE' | 'VIDEO';

export interface Asset {
  id: string;
  originalName: string;
  contentType: string;
  status: AssetStatus;
  /** Thumb, poster, or the original when no derivative exists yet. */
  url: string;
  /**
   * Playable rendition (720p). Absent until the video worker publishes it.
   * While the original itself is a browser video, `url` is the fallback.
   */
  playbackUrl?: string | null;
  kind?: AssetKind | null;
  /** 0..100 from SSE while ffmpeg runs. Omitted for images. */
  progress?: number | null;
  createdAt: string;
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
