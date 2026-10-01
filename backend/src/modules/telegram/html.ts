const TELEGRAM_TEXT_LIMIT = 4096;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Split on line boundaries when possible so HTML tags stay intact. */
export function splitTelegramText(
  text: string,
  max = TELEGRAM_TEXT_LIMIT,
): string[] {
  if (text.length <= max) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf("\n");
    if (cut < Math.floor(max * 0.5)) cut = max;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) parts.push(rest);
  const chunks = parts.filter((part) => part.length > 0);
  return chunks.length > 0 ? chunks : [text.slice(0, max)];
}
