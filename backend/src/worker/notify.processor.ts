import {
  DelayedError,
  UnrecoverableError,
  type Job,
} from "bullmq";
import { Bot, InputFile } from "grammy";
import type { DerivKind } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { childLogger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { presignGet } from "../lib/s3.js";
import type { NotifyJobData } from "../shared/jobs.js";
import {
  isTelegramForbidden,
  telegramRetryAfterSec,
} from "../modules/telegram/errors.js";
import { jpegFromStorageKey } from "../modules/telegram/files.js";
import { splitTelegramText } from "../modules/telegram/html.js";
import {
  derivDownloadName,
  isTelegramImageKind,
  notifyCaption,
  notifyLinksHtml,
  pickTelegramImage,
  type NotifyLink,
} from "../modules/telegram/message.js";
import { storageEndpointReachableFromTelegram } from "../modules/telegram/storage-links.js";

class TelegramDelaySignal extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("telegram 429");
    this.retryAfterSec = retryAfterSec;
  }
}

class TelegramBlockedSignal extends Error {
  readonly userId: string;
  constructor(userId: string) {
    super("telegram forbidden");
    this.userId = userId;
  }
}

export class NotifyProcessor {
  private readonly log = childLogger({ processor: "notify" });
  private bot: Bot | undefined;
  private missingWarned = false;

  async process(job: Job<NotifyJobData>, token?: string): Promise<void> {
    try {
      await this.deliver(job);
    } catch (err) {
      if (err instanceof TelegramDelaySignal) {
        if (!token) throw err;
        await job.moveToDelayed(Date.now() + err.retryAfterSec * 1000, token);
        throw new DelayedError();
      }
      if (err instanceof TelegramBlockedSignal) {
        await prisma.user.update({
          where: { id: err.userId },
          data: { telegramMuted: true },
        });
        this.log.info({ userId: err.userId }, "telegram muted after 403");
        throw new UnrecoverableError("telegram blocked");
      }
      throw err;
    }
  }

  private async deliver(job: Job<NotifyJobData>): Promise<void> {
    const api = this.client();
    if (!api) return;

    const user = await prisma.user.findUnique({
      where: { id: job.data.userId },
      select: { telegramChatId: true, telegramMuted: true },
    });
    if (user?.telegramChatId == null || user.telegramMuted) return;

    const asset = await prisma.asset.findUnique({
      where: { id: job.data.assetId },
      include: { derivatives: true },
    });
    if (!asset) return;

    const chatId = user.telegramChatId.toString();
    const caption = notifyCaption(
      asset.kind,
      job.data.status,
      asset.originalName,
      job.data.error,
    );

    if (!job.data.photoSent) {
      if (job.data.status === "READY") {
        const sent = await this.sendThumb(
          api,
          job,
          chatId,
          asset.derivatives,
          caption,
        );
        if (!sent) {
          await this.sendHtml(api, job, chatId, caption);
        }
      } else {
        await this.sendHtml(api, job, chatId, caption);
      }
      await job.updateData({ ...job.data, photoSent: true });
    }

    if (job.data.status !== "READY") return;
    if (job.data.fileSent) return;

    if (storageEndpointReachableFromTelegram(env.S3_ENDPOINT)) {
      const links = await this.presignLinks(
        asset.originalName,
        asset.derivatives,
      );
      await this.sendHtml(api, job, chatId, notifyLinksHtml(links));
    }
    await job.updateData({ ...job.data, photoSent: true, fileSent: true });
  }

  private client(): Bot | null {
    if (!env.TELEGRAM_BOT_TOKEN) {
      if (!this.missingWarned) {
        this.missingWarned = true;
        this.log.warn("telegram notify skipped: TELEGRAM_BOT_TOKEN is empty");
      }
      return null;
    }
    this.bot ??= new Bot(env.TELEGRAM_BOT_TOKEN);
    return this.bot;
  }

  private async sendThumb(
    bot: Bot,
    job: Job<NotifyJobData>,
    chatId: string,
    derivatives: { kind: DerivKind; storageKey: string; mimeType: string }[],
    caption: string,
  ): Promise<boolean> {
    const still = pickTelegramImage(derivatives);
    if (!still) return false;

    try {
      const jpeg = await jpegFromStorageKey(still.storageKey);
      await this.callTelegram(job, () =>
        bot.api.sendPhoto(chatId, new InputFile(jpeg, "preview.jpg"), {
          caption,
          parse_mode: "HTML",
        }),
      );
      return true;
    } catch (err) {
      if (
        err instanceof TelegramDelaySignal ||
        err instanceof TelegramBlockedSignal
      ) {
        throw err;
      }
      this.log.warn({ err, assetId: job.data.assetId }, "telegram photo skipped");
      return false;
    }
  }

  private async presignLinks(
    originalName: string,
    derivatives: { kind: DerivKind; storageKey: string }[],
  ): Promise<NotifyLink[]> {
    const links: NotifyLink[] = [];
    for (const item of derivatives) {
      if (!isTelegramImageKind(item.kind)) continue;
      try {
        const url = await presignGet(
          item.storageKey,
          3600,
          derivDownloadName(originalName, item.kind),
        );
        links.push({ kind: item.kind, url });
      } catch (err) {
        this.log.warn({ err, kind: item.kind }, "telegram link presign failed");
      }
    }
    return links;
  }

  private async sendHtml(
    bot: Bot,
    job: Job<NotifyJobData>,
    chatId: string,
    text: string,
  ): Promise<void> {
    for (const part of splitTelegramText(text)) {
      await this.callTelegram(job, () =>
        bot.api.sendMessage(chatId, part, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
      );
    }
  }

  private async callTelegram<T>(
    job: Job<NotifyJobData>,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const retryAfter = telegramRetryAfterSec(err);
      if (retryAfter != null) {
        throw new TelegramDelaySignal(retryAfter);
      }
      if (isTelegramForbidden(err)) {
        throw new TelegramBlockedSignal(job.data.userId);
      }
      throw err;
    }
  }
}
