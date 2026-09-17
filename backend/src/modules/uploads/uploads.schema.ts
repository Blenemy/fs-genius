import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_BYTES),
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
  }
}
