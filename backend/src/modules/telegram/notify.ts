import { Bot } from "grammy";
import { env } from "../../config/env.js";
import { childLogger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";

const log = childLogger({ component: "telegram" });

let bot: Bot | undefined;
let missingWarned = false;

function client(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    if (!missingWarned) {
      missingWarned = true;
      log.warn("telegram notify skipped: TELEGRAM_BOT_TOKEN is empty");
    }
    return null;
  }
  bot ??= new Bot(env.TELEGRAM_BOT_TOKEN);
  return bot;
}

/** Чат владельца файла. Ошибка Telegram не должна ронять джобу. */
export async function notifyImageProcessed(input: {
  userId: string;
  originalName: string;
  status: "READY" | "FAILED";
  error?: string;
}): Promise<void> {
  const api = client();
  if (!api) return;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { telegramChatId: true },
  });
  if (user?.telegramChatId == null) return;
  const chatId = user.telegramChatId.toString();

  const headline =
    input.status === "READY"
      ? `Картинка готова: ${input.originalName}`
      : `Картинка не обработалась: ${input.originalName}`;
  const reason = input.error?.trim().slice(0, 200);
  const text = reason ? `${headline}\n${reason}` : headline;

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      api.api.sendMessage(chatId, text),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("telegram timeout")), 10_000);
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (err) {
    log.warn({ err, status: input.status }, "telegram notify failed");
  }
}
