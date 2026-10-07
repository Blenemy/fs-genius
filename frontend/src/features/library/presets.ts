export const IMAGE_ACTIONS = [
  { id: "compress", label: "Сжать сильнее" },
  { id: "grayscale", label: "Чёрно-белое" },
  { id: "contrast", label: "Контраст" },
  { id: "square", label: "Квадрат" },
  { id: "rotate", label: "Повернуть на 90°" },
  { id: "jpeg", label: "В JPEG" },
  { id: "webp", label: "В WebP" },
] as const;

export const VIDEO_ACTIONS = [
  { id: "speed2x", label: "Ускорить ×2" },
  { id: "compress", label: "Сжать сильнее" },
  { id: "mute", label: "Без звука" },
  { id: "grayscale", label: "Чёрно-белое" },
  { id: "contrast", label: "Контраст" },
  { id: "square", label: "Квадрат" },
  { id: "trim", label: "Обрезать по времени" },
] as const;

export type ImageActionId = (typeof IMAGE_ACTIONS)[number]["id"];
export type VideoActionId = (typeof VIDEO_ACTIONS)[number]["id"];
export type ActionId = ImageActionId | VideoActionId;

const LABELS: Record<string, string> = {};
for (const action of [...IMAGE_ACTIONS, ...VIDEO_ACTIONS]) {
  LABELS[action.id] = action.label;
}

export function presetLabel(preset: string | null | undefined): string | null {
  if (!preset) return null;
  return LABELS[preset] ?? null;
}

/** Секунды: `90`, `1:30`, `1:02:03`. */
export function parseTimecode(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }

  // Lenient on purpose: the mask can produce `0:75`, which means 75 seconds.
  const clock = text.match(/^(?:(\d+):)?(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!clock) return null;
  const hours = clock[1] ? Number(clock[1]) : 0;
  const minutes = Number(clock[2]);
  const seconds = Number(clock[3]);
  const frac = clock[4] ? Number(`0.${clock[4]}`) : 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds + frac) * 1000);
}

const MAX_TIMECODE_DIGITS = 6;

/**
 * Digits fill from the right, like a microwave timer:
 * `1` → `0:01`, `130` → `1:30`, `13000` → `1:30:00`.
 */
export function maskTimecode(raw: string): string {
  const digits = raw
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, MAX_TIMECODE_DIGITS);
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const seconds = padded.slice(-2);
  const rest = padded.slice(0, -2);
  if (rest.length <= 2) return `${Number(rest)}:${seconds}`;
  return `${Number(rest.slice(0, -2))}:${rest.slice(-2)}:${seconds}`;
}

/** Whole seconds, rounded down so the end never overshoots the clip. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}
