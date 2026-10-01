export type BotCommand = {
  command: string;
  arg: string;
};

export function parseBotCommand(text: string): BotCommand | null {
  const trimmed = text.trim();
  const match =
    /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:[\s\n]+([\s\S]*))?$/.exec(
      trimmed,
    );
  if (!match) return null;
  return {
    command: match[1]!.toLowerCase(),
    arg: match[2]?.trim() ?? "",
  };
}
