import { fileTypeFromBuffer } from "file-type";
import {
  isAllowedMediaType,
  mediaClassOf,
  type AllowedMediaType,
} from "./uploads.schema.js";

/**
 * file-type читает магию с начала файла. Для jpeg/png/gif/webp/mp4/mov/webm/mkv
 * этого окна хватает; хвост гигабайтного ролика на complete не нужен.
 */
export const SIGNATURE_BYTES = 4100;

export async function detectMime(bytes: Uint8Array): Promise<string | null> {
  if (bytes.byteLength === 0) return null;
  const found = await fileTypeFromBuffer(bytes);
  return found?.mime ?? null;
}

/**
 * Заявленный тип и сигнатура должны быть одного класса: картинка с картинкой,
 * ролик с роликом. Иначе jpeg, названный mp4, проходит потолок видео.
 * Внутри класса верим сигнатуре, не заголовку клиента.
 */
export function matchClaimedType(
  claimed: string,
  detected: string | null,
): { ok: true; contentType: AllowedMediaType } | { ok: false } {
  if (!detected || !isAllowedMediaType(detected)) return { ok: false };
  const claimedClass = mediaClassOf(claimed);
  const detectedClass = mediaClassOf(detected);
  if (!claimedClass || claimedClass !== detectedClass) return { ok: false };
  return { ok: true, contentType: detected };
}
