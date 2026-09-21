import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
] as const;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export function isVideoType(contentType: string): boolean {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType);
}

export const presignSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.enum(ALLOWED_MEDIA_TYPES),
    sizeBytes: z.number().int().min(1),
  })
  .superRefine((data, ctx) => {
    const max = isVideoType(data.contentType)
      ? MAX_VIDEO_BYTES
      : MAX_IMAGE_BYTES;
    if (data.sizeBytes > max) {
      ctx.addIssue({
        code: "custom",
        path: ["sizeBytes"],
        message: isVideoType(data.contentType)
          ? "Файл больше 2 ГБ"
          : "Файл больше 20 МБ",
      });
    }
  });

export type PresignInput = z.infer<typeof presignSchema>;

export function extensionFor(contentType: PresignInput["contentType"]): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    case "video/x-matroska":
      return "mkv";
  }
}
