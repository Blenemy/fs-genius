import { randomBytes, timingSafeEqual } from "node:crypto";
import { Bot, InputFile } from "grammy";
import type { Update } from "@grammyjs/types";
import type { Redis } from "ioredis";
import type { DerivKind, PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { childLogger } from "../../lib/logger.js";
import { AppError } from "../../middleware/error.js";
import { presignGet } from "../../lib/s3.js";
import { parseBotCommand } from "./command.js";
import {
  isTelegramForbidden,
  telegramRetryAfterSec,
} from "./errors.js";
import { jpegFromStorageKey } from "./files.js";
import { splitTelegramText, escapeHtml } from "./html.js";
import {
  derivDownloadName,
  lastAssetHtml,
  pickTelegramImage,
} from "./message.js";
import { storageEndpointReachableFromTelegram } from "./storage-links.js";

const LINK_TTL_SEC = 15 * 60;
const LINK_PREFIX = "telegram:link:";

const LINKED_HELP = [
  "Готово. Напишу, когда файл обработается.",
  "",
  "/status — задачи в работе и в очереди",
  "/last — пять последних готовых файлов",
  "/stop — выключить уведомления",
].join("\n");

const ALREADY_LINKED = [
  "Уже привязан. Напишу, когда файл обработается.",
  "",
  "/status — задачи в работе и в очереди",
  "/last — пять последних готовых файлов",
  "/stop — выключить уведомления",
].join("\n");

export class TelegramService {
  private readonly log = childLogger({ component: "telegram" });
  private bot: Bot | undefined;
  private username: string | undefined;
  private polling = false;
  private handlersBound = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async status(userId: string): Promise<{ linked: boolean; muted: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, telegramMuted: true },
    });
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
    return {
      linked: user.telegramChatId != null,
      muted: user.telegramMuted,
    };
  }

  async createLink(userId: string): Promise<{ url: string }> {
    const bot = this.requireBot();
    const username = await this.botUsername(bot);
    const token = randomBytes(24).toString("base64url");
    await this.redis.set(`${LINK_PREFIX}${token}`, userId, "EX", LINK_TTL_SEC);
    return { url: `https://t.me/${username}?start=${token}` };
  }

  async unlink(userId: string): Promise<{ linked: false; muted: false }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramMuted: false },
    });
    return { linked: false, muted: false };
  }

  async startTransport(): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN) {
      this.log.info("telegram skipped: TELEGRAM_BOT_TOKEN is empty");
      return;
    }
    if (env.TELEGRAM_WEBHOOK_URL && env.TELEGRAM_WEBHOOK_SECRET) {
      this.log.info(
        { url: env.TELEGRAM_WEBHOOK_URL },
        "telegram using webhook; polling off. Unset TELEGRAM_WEBHOOK_URL for local /start",
      );
      await this.registerWebhook();
      return;
    }
    await this.startPolling();
  }

  async stop(): Promise<void> {
    if (!this.polling || !this.bot) return;
    try {
      await this.bot.stop();
    } catch (err) {
      this.log.warn({ err }, "telegram polling stop failed");
    }
    this.polling = false;
  }

  async handleUpdate(update: Update): Promise<void> {
    try {
      await this.dispatch(update);
    } catch (err) {
      this.log.warn({ err }, "telegram update failed");
    }
  }

  webhookAuthorized(header: string | undefined): boolean {
    const secret = env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || !header) return false;
    const left = Buffer.from(header);
    const right = Buffer.from(secret);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private async dispatch(update: Update): Promise<void> {
    const message = update.message;
    const text = message?.text;
    const chatId = message?.chat.id;
    if (!text || chatId == null) return;

    const parsed = parseBotCommand(text);
    if (!parsed) return;

    const bot = this.requireBot();

    switch (parsed.command) {
      case "start":
        await this.onStart(bot, chatId, parsed.arg);
        return;
      case "status":
        await this.onStatus(bot, chatId);
        return;
      case "last":
        await this.onLast(bot, chatId);
        return;
      case "stop":
        await this.onStop(bot, chatId);
        return;
      default:
        await this.reply(
          bot,
          chatId,
          "Команды: /status, /last, /stop.",
        );
    }
  }

  private async onStart(
    bot: Bot,
    chatId: number,
    token: string,
  ): Promise<void> {
    if (!token) {
      const user = await this.userByChat(chatId);
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { telegramMuted: false },
        });
        await this.reply(bot, chatId, ALREADY_LINKED, user.id);
        return;
      }
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
      data: { telegramChatId: null, telegramMuted: false },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chat, telegramMuted: false },
    });
    await this.reply(bot, chatId, LINKED_HELP, userId);
    this.log.info({ userId }, "telegram linked");
  }

  private async onStatus(bot: Bot, chatId: number): Promise<void> {
    const user = await this.requireLinked(bot, chatId);
    if (!user) return;

    const [running, queued] = await Promise.all([
      this.prisma.job.count({
        where: { status: "RUNNING", asset: { userId: user.id } },
      }),
      this.prisma.job.count({
        where: { status: "QUEUED", asset: { userId: user.id } },
      }),
    ]);

    if (running === 0 && queued === 0) {
      await this.reply(bot, chatId, "Сейчас ничего не обрабатывается.", user.id);
      return;
    }

    await this.reply(
      bot,
      chatId,
      `В работе: ${running}\nВ очереди: ${queued}`,
      user.id,
    );
  }

  private async onLast(bot: Bot, chatId: number): Promise<void> {
    const user = await this.requireLinked(bot, chatId);
    if (!user) return;

    const assets = await this.prisma.asset.findMany({
      where: { userId: user.id, status: "READY" },
      include: { derivatives: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (assets.length === 0) {
      await this.reply(bot, chatId, "Пока нет готовых файлов.", user.id);
      return;
    }

    if (storageEndpointReachableFromTelegram(env.S3_ENDPOINT)) {
      const lines: string[] = ["Последние готовые:"];
      for (const asset of assets) {
        const preferred = pickTelegramImage(asset.derivatives);
        let url: string | null = null;
        if (preferred) {
          try {
            url = await presignGet(
              preferred.storageKey,
              3600,
              derivDownloadName(asset.originalName, preferred.kind),
            );
          } catch (err) {
            this.log.warn({ err, assetId: asset.id }, "telegram last presign failed");
          }
        }
        lines.push(lastAssetHtml(asset.originalName, url));
      }
      lines.push("Ссылки живут 1 час.");
      await this.reply(bot, chatId, lines.join("\n"), user.id);
      return;
    }

    await this.reply(
      bot,
      chatId,
      "Последние готовые — картинки следом. Видео в Telegram не грузим, только превью.",
      user.id,
    );
    for (const asset of assets) {
      await this.sendAssetPreview(bot, chatId, asset, user.id);
    }
  }

  private async sendAssetPreview(
    bot: Bot,
    chatId: number,
    asset: {
      originalName: string;
      derivatives: { kind: DerivKind; storageKey: string }[];
    },
    userId: string,
  ): Promise<void> {
    const still = pickTelegramImage(asset.derivatives);
    if (!still) {
      await this.reply(
        bot,
        chatId,
        `${escapeHtml(asset.originalName)} — нет превью.`,
        userId,
      );
      return;
    }

    const caption = `<b>${escapeHtml(asset.originalName)}</b>`;
    try {
      const jpeg = await jpegFromStorageKey(still.storageKey);
      await bot.api.sendPhoto(chatId, new InputFile(jpeg, "preview.jpg"), {
        caption,
        parse_mode: "HTML",
      });
    } catch (err) {
      await this.handleSendError(err, chatId, userId);
    }
  }

  private async handleSendError(
    err: unknown,
    chatId: number,
    userId?: string,
  ): Promise<void> {
    if (isTelegramForbidden(err) && userId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { telegramMuted: true },
      });
      this.log.info({ userId, chatId }, "telegram muted after 403");
      return;
    }
    const retryAfter = telegramRetryAfterSec(err);
    this.log.warn({ err, chatId, retryAfter }, "telegram send failed");
  }

  private async onStop(bot: Bot, chatId: number): Promise<void> {
    const user = await this.requireLinked(bot, chatId);
    if (!user) return;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { telegramMuted: true },
    });
    await this.reply(
      bot,
      chatId,
      "Уведомления выключены. /start — включить снова. Привязка на месте.",
      user.id,
    );
  }

  private async requireLinked(
    bot: Bot,
    chatId: number,
  ): Promise<{ id: string } | null> {
    const user = await this.userByChat(chatId);
    if (user) return user;
    await this.reply(
      bot,
      chatId,
      "Сначала привяжи бота через приложение.",
    );
    return null;
  }

  private userByChat(chatId: number) {
    return this.prisma.user.findUnique({
      where: { telegramChatId: BigInt(chatId) },
      select: { id: true },
    });
  }

  private async registerWebhook(): Promise<void> {
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

  private async startPolling(): Promise<void> {
    const bot = this.requireBot();
    if (!this.handlersBound) {
      this.handlersBound = true;
      bot.on("message:text", (ctx) => this.handleUpdate(ctx.update));
    }
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    this.polling = true;
    this.log.info("telegram polling started");
    void bot
      .start({ allowed_updates: ["message"] })
      .catch((err: unknown) => {
        this.polling = false;
        this.log.error({ err }, "telegram polling failed");
      });
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
    if (!me.username) {
      throw new AppError(
        503,
        "TELEGRAM_UNAVAILABLE",
        "У бота нет username",
      );
    }
    this.username = me.username;
    return me.username;
  }

  private async reply(
    bot: Bot,
    chatId: number,
    text: string,
    userId?: string,
  ): Promise<void> {
    try {
      for (const part of splitTelegramText(text)) {
        await bot.api.sendMessage(chatId, part, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (err) {
      await this.handleSendError(err, chatId, userId);
    }
  }
}
