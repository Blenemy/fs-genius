/** Пресеты обработки. Имена фиксированы: воркер не подставляет строки пользователя в ffmpeg. */

export const IMAGE_EDIT_PRESETS = [
  "compress",
  "grayscale",
  "contrast",
  "square",
  "rotate",
  "jpeg",
  "webp",
] as const;

export const VIDEO_EDIT_PRESETS = [
  "speed2x",
  "compress",
  "mute",
  "grayscale",
  "contrast",
  "square",
  "trim",
] as const;

export const ALL_EDIT_PRESETS = [
  "compress",
  "grayscale",
  "contrast",
  "square",
  "rotate",
  "jpeg",
  "webp",
  "speed2x",
  "mute",
  "trim",
] as const;

export type ImageEditPreset = (typeof IMAGE_EDIT_PRESETS)[number];
export type VideoEditPreset = (typeof VIDEO_EDIT_PRESETS)[number];
export type EditPreset = ImageEditPreset | VideoEditPreset;

/** Совпадает с потолком длительности в probe. */
export const EDIT_MAX_MS = 30 * 60 * 1000;
export const EDIT_MIN_TRIM_MS = 500;

export type EditRequest = {
  preset: EditPreset;
  startMs?: number;
  endMs?: number;
};

export type NormalizedEdit =
  | { kind: "image"; preset: ImageEditPreset }
  | { kind: "video"; preset: Exclude<VideoEditPreset, "trim"> }
  | { kind: "video"; preset: "trim"; startMs: number; endMs: number };

export type EditJobPayload = {
  preset: EditPreset;
  startMs?: number;
  endMs?: number;
};

const IMAGE_SET: readonly string[] = IMAGE_EDIT_PRESETS;
const VIDEO_SET: readonly string[] = VIDEO_EDIT_PRESETS;

export function isImageEditPreset(value: string): value is ImageEditPreset {
  return IMAGE_SET.includes(value);
}

export function isVideoEditPreset(value: string): value is VideoEditPreset {
  return VIDEO_SET.includes(value);
}

export function normalizeEdit(
  assetKind: "IMAGE" | "VIDEO",
  body: EditRequest,
  durationMs: number | null,
): { ok: true; edit: NormalizedEdit } | { ok: false; message: string } {
  if (assetKind === "IMAGE") {
    if (!isImageEditPreset(body.preset)) {
      return { ok: false, message: "Это действие только для видео" };
    }
    if (body.startMs != null || body.endMs != null) {
      return { ok: false, message: "Для картинки таймкод не нужен" };
    }
    return { ok: true, edit: { kind: "image", preset: body.preset } };
  }

  if (!isVideoEditPreset(body.preset)) {
    return { ok: false, message: "Это действие только для картинки" };
  }
  if (body.preset !== "trim") {
    if (body.startMs != null || body.endMs != null) {
      return { ok: false, message: "Для этого действия таймкод не нужен" };
    }
    return { ok: true, edit: { kind: "video", preset: body.preset } };
  }

  if (body.startMs == null || body.endMs == null) {
    return { ok: false, message: "Укажи начало и конец отрезка" };
  }
  if (durationMs == null || durationMs <= 0) {
    return { ok: false, message: "У ролика нет длительности" };
  }
  if (body.endMs <= body.startMs) {
    return { ok: false, message: "Конец должен быть позже начала" };
  }
  if (body.endMs - body.startMs < EDIT_MIN_TRIM_MS) {
    return { ok: false, message: "Отрезок короче полсекунды" };
  }
  if (body.startMs > durationMs || body.endMs > durationMs) {
    return { ok: false, message: "Отрезок выходит за длину ролика" };
  }
  return {
    ok: true,
    edit: {
      kind: "video",
      preset: "trim",
      startMs: body.startMs,
      endMs: body.endMs,
    },
  };
}

export function toEditPayload(edit: NormalizedEdit): EditJobPayload {
  if (edit.kind === "video" && edit.preset === "trim") {
    return { preset: "trim", startMs: edit.startMs, endMs: edit.endMs };
  }
  return { preset: edit.preset };
}

export function exportFile(
  edit: NormalizedEdit,
): { name: string; mimeType: string } {
  if (edit.kind === "video") {
    return { name: "export.mp4", mimeType: "video/mp4" };
  }
  if (edit.preset === "webp") {
    return { name: "export.webp", mimeType: "image/webp" };
  }
  return { name: "export.jpg", mimeType: "image/jpeg" };
}

/**
 * Верхняя оценка новых байт. Тот же ключ заменяется, поэтому из оценки
 * вычитается прошлый результат. Другой ключ (jpeg вместо webp) живёт рядом,
 * пока старый объект не удалят — резервируем источник целиком.
 */
export function editReserveBytes(
  sourceBytes: bigint,
  previous: { sizeBytes: bigint; storageKey: string } | null,
  nextKey: string,
): bigint {
  const source = sourceBytes > 0n ? sourceBytes : 0n;
  if (!previous || previous.storageKey !== nextKey) return source;
  const net = source - previous.sizeBytes;
  return net > 0n ? net : 0n;
}

export function editOutputDurationMs(
  preset: VideoEditPreset,
  sourceDurationMs: number,
  startMs?: number,
  endMs?: number,
): number {
  if (preset === "trim" && startMs != null && endMs != null) {
    return Math.max(0, endMs - startMs);
  }
  if (preset === "speed2x") {
    return Math.max(0, Math.round(sourceDurationMs / 2));
  }
  return Math.max(0, sourceDurationMs);
}

function even(value: number): number {
  const n = value - (value % 2);
  return n >= 2 ? n : 2;
}

export function videoExportFrame(
  preset: VideoEditPreset,
  width: number | null,
  height: number | null,
): { width: number | null; height: number | null } {
  if (!width || !height || width < 2 || height < 2) {
    return { width: null, height: null };
  }
  if (preset === "square") {
    const side = even(Math.min(width, height, 720));
    return { width: side, height: side };
  }
  if (preset === "compress") {
    const nextHeight = even(Math.min(480, height));
    const nextWidth = even(Math.round((width * nextHeight) / height));
    return { width: nextWidth, height: nextHeight };
  }
  return { width: even(width), height: even(height) };
}
