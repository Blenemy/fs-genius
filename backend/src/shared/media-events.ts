export const MEDIA_EVENTS_CHANNEL = "media:events";

export type MediaEventPayload = {
  userId: string;
  assetId: string;
  status: "PENDING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  /** 0..100 while ffmpeg runs. Omit on status-only frames. */
  progress?: number;
};
