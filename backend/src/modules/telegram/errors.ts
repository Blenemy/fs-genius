type TelegramErrorShape = {
  error_code?: unknown;
  description?: unknown;
  parameters?: { retry_after?: unknown };
};

function shape(err: unknown): TelegramErrorShape | undefined {
  if (!err || typeof err !== "object") return undefined;
  return err as TelegramErrorShape;
}

export function telegramErrorCode(err: unknown): number | undefined {
  const code = shape(err)?.error_code;
  return typeof code === "number" ? code : undefined;
}

export function telegramErrorDescription(err: unknown): string {
  const description = shape(err)?.description;
  if (typeof description === "string") return description;
  return err instanceof Error ? err.message : "";
}

/** Seconds from Telegram 429. Undefined = not a flood wait. */
export function telegramRetryAfterSec(err: unknown): number | undefined {
  if (telegramErrorCode(err) !== 429) return undefined;
  const wait = shape(err)?.parameters?.retry_after;
  if (typeof wait === "number" && Number.isFinite(wait) && wait > 0) {
    return Math.min(Math.ceil(wait), 300);
  }
  return 5;
}

/** Bot blocked, kicked, or chat gone — retrying is useless. */
export function isTelegramForbidden(err: unknown): boolean {
  const code = telegramErrorCode(err);
  const description = telegramErrorDescription(err).toLowerCase();
  if (code === 403) return true;
  return (
    description.includes("bot was blocked") ||
    description.includes("user is deactivated") ||
    description.includes("bot was kicked") ||
    description.includes("chat not found")
  );
}
