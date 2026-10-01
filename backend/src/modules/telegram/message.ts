import type { AssetKind, DerivKind } from "../../generated/prisma/client.js";
import { corsOrigins } from "../../config/env.js";
import { escapeHtml } from "./html.js";

const DERIV_LABEL: Record<DerivKind, string> = {
  THUMBNAIL: "миниатюра",
  PREVIEW: "превью",
  POSTER: "постер",
  VIDEO_720P: "видео 720p",
  AUDIO_MP3: "аудио",
};

const DERIV_ORDER: DerivKind[] = [
  "PREVIEW",
  "POSTER",
  "THUMBNAIL",
  "VIDEO_720P",
  "AUDIO_MP3",
];

/** What we actually upload to Telegram: stills only. Video → poster/preview. */
const TELEGRAM_IMAGE_KINDS: DerivKind[] = ["PREVIEW", "POSTER", "THUMBNAIL"];

export type NotifyLink = {
  kind: DerivKind;
  url: string;
};

export function pickTelegramImage<T extends { kind: DerivKind }>(
  derivatives: T[],
): T | undefined {
  for (const kind of TELEGRAM_IMAGE_KINDS) {
    const found = derivatives.find((item) => item.kind === kind);
    if (found) return found;
  }
  return undefined;
}

export function isTelegramImageKind(kind: DerivKind): boolean {
  return (TELEGRAM_IMAGE_KINDS as DerivKind[]).includes(kind);
}

export function derivLabel(kind: DerivKind): string {
  return DERIV_LABEL[kind] ?? kind;
}

export function appHomeUrl(): string {
  return corsOrigins[0] ?? "http://localhost:5173";
}

export function notifyHeadline(
  kind: AssetKind | null,
  status: "READY" | "FAILED",
  originalName: string,
): string {
  const name = escapeHtml(originalName);
  if (status === "READY") {
    if (kind === "VIDEO") return `Видео готово: ${name}`;
    if (kind === "IMAGE") return `Картинка готова: ${name}`;
    return `Файл готов: ${name}`;
  }
  if (kind === "VIDEO") return `Видео не обработалось: ${name}`;
  if (kind === "IMAGE") return `Картинка не обработалась: ${name}`;
  return `Файл не обработался: ${name}`;
}

export function notifyCaption(
  kind: AssetKind | null,
  status: "READY" | "FAILED",
  originalName: string,
  error?: string,
): string {
  const head = notifyHeadline(kind, status, originalName);
  if (status !== "FAILED") return head;
  const reason = error?.trim().slice(0, 200);
  return reason ? `${head}\n${escapeHtml(reason)}` : head;
}

export function notifyLinksHtml(links: NotifyLink[]): string {
  if (links.length === 0) {
    return `<a href="${escapeHtml(appHomeUrl())}">Открыть в приложении</a>`;
  }

  const sorted = [...links].sort(
    (a, b) => DERIV_ORDER.indexOf(a.kind) - DERIV_ORDER.indexOf(b.kind),
  );
  const lines = sorted.map((link) => {
    const label = DERIV_LABEL[link.kind] ?? link.kind;
    return `• ${escapeHtml(label)} — <a href="${escapeHtml(link.url)}">скачать</a>`;
  });

  return [
    "Варианты:",
    ...lines,
    "",
    `<a href="${escapeHtml(appHomeUrl())}">Открыть в приложении</a>`,
    "Ссылки живут 1 час.",
  ].join("\n");
}

export function lastAssetHtml(
  originalName: string,
  url: string | null,
): string {
  const name = escapeHtml(originalName);
  if (!url) return `• <b>${name}</b>`;
  return `• <b>${name}</b> — <a href="${escapeHtml(url)}">скачать</a>`;
}

export function derivDownloadName(
  originalName: string,
  kind: DerivKind,
): string {
  const stem = originalName.replace(/\.[^.]+$/, "") || "file";
  switch (kind) {
    case "POSTER":
      return `${stem}_poster.jpg`;
    case "THUMBNAIL":
      return `${stem}_thumb.webp`;
    case "PREVIEW":
      return `${stem}_preview.webp`;
    case "VIDEO_720P":
      return `${stem}_720p.mp4`;
    case "AUDIO_MP3":
      return `${stem}_audio.mp3`;
    default:
      return originalName;
  }
}
