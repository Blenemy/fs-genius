import { randomBytes, timingSafeEqual } from "node:crypto";
import { Bot } from "grammy";
import type { Update } from "@grammyjs/types";
import type { Redis } from "ioredis";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { childLogger } from "../../lib/logger.js";
import { AppError } from "../../middleware/error.js";

const LINK_TTL_SEC = 15 * 60;
const LINK_PREFIX = "telegram:link:";

export class TelegramService {
  private readonly log = childLogger({ component: "telegram" });
  private bot: Bot | undefined;
  private username: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async status(userId: string): Promise<{ linked: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
    return { linked: user.telegramChatId != null };
  }

  async createLink(userId: string): Promise<{ url: string }> {
    const bot = this.requireBot();
    const username = await this.botUsername(bot);
    const token = randomBytes(24).toString("base64url");
    await this.redis.set(`${LINK_PREFIX}${token}`, userId, "EX", LINK_TTL_SEC);
    return { url: `https://t.me/${username}?start=${token}` };
  }

  async unlink(userId: string): Promise<{ linked: false }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null },
    });
    return { linked: false };
  }

  async handleUpdate(update: Update): Promise<void> {
    const message = update.message;
    const text = message?.text;
    const chatId = message?.chat.id;
    if (!text || chatId == null) return;
    if (!text.startsWith("/start")) return;

    const token = text.slice("/start".length).trim();
    const bot = this.requireBot();

    if (!token) {
      await this.reply(
        bot,
        chatId,
        "Открой ссылку «Подключить Telegram» в приложении.",
      );
      return;
    }

    const userId = await this.redis.getdel(`${LINK_PREFIX}${token}`);
    if (!userId) {
      await this.reply(
        bot,
        chatId,
        "Ссылка устарела. Запроси новую в приложении.",
      );
      return;
    }

    const chat = BigInt(chatId);
    await this.prisma.user.updateMany({
      where: { telegramChatId: chat, NOT: { id: userId } },
      data: { telegramChatId: null },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chat },
    });
    await this.reply(
      bot,
      chatId,
      "Готово. Напишу, когда твоя картинка обработается.",
    );
    this.log.info({ userId }, "telegram linked");
  }

  async registerWebhook(): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN) return;
    if (!env.TELEGRAM_WEBHOOK_URL || !env.TELEGRAM_WEBHOOK_SECRET) {
      this.log.warn(
        "telegram webhook skipped: set TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET",
      );
      return;
    }
    if (!env.TELEGRAM_WEBHOOK_URL.startsWith("https://")) {
      this.log.error(
        "telegram webhook skipped: TELEGRAM_WEBHOOK_URL must be https",
      );
      return;
    }

    const bot = this.requireBot();
    await bot.api.setWebhook(env.TELEGRAM_WEBHOOK_URL, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
    });
    this.log.info({ url: env.TELEGRAM_WEBHOOK_URL }, "telegram webhook set");
  }

  webhookAuthorized(header: string | undefined): boolean {
    const secret = env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const left = Buffer.from(header);
    const right = Buffer.from(secret);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private requireBot(): Bot {
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new AppError(
        503,
        "TELEGRAM_UNAVAILABLE",
        "Telegram не настроен",
      );
    }
    this.bot ??= new Bot(env.TELEGRAM_BOT_TOKEN);
    return this.bot;
  }

  private async botUsername(bot: Bot): Promise<string> {
    if (this.username) return this.username;
    const me = await bot.api.getMe();
    this.username = me.username;
    return me.username;
  }

  private async reply(bot: Bot, chatId: number, text: string): Promise<void> {
    try {
      await bot.api.sendMessage(chatId, text);
    } catch (err) {
      this.log.warn({ err, chatId }, "telegram reply failed");
    }
  }
}
