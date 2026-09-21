import type { Request, Response } from "express";
import type { Redis } from "ioredis";
import { SseHub } from "../../lib/sse-hub.js";
import { childLogger } from "../../lib/logger.js";
import { MEDIA_EVENTS_CHANNEL } from "../../shared/media-events.js";
import type { AssetService, AssetClient } from "../assets/assets.service.js";

export type MediaSseEvent =
  | { type: "snapshot"; assets: AssetClient[] }
  | { type: "asset"; asset: AssetClient };

/** Keep-alive comment so proxies do not close an idle SSE socket. Under nginx's default 60s read timeout. */
const HEARTBEAT_MS = 20_000;

export class MediaEventsHub {
  private readonly log = childLogger({ component: "media-events-hub" });
  private readonly hub = new SseHub<MediaSseEvent>();

  constructor(
    private readonly subscriber: Redis,
    private readonly assets: AssetService,
  ) {
    this.subscriber.on("message", (channel, raw) => {
      if (channel !== MEDIA_EVENTS_CHANNEL) return;
      void this.forward(raw);
    });

    void this.subscriber.subscribe(MEDIA_EVENTS_CHANNEL, (err) => {
      if (err) this.log.error({ err }, "subscribe failed");
      else this.log.info({ channel: MEDIA_EVENTS_CHANNEL }, "subscribed");
    });
  }

  async subscribe(req: Request, res: Response): Promise<void> {
    const userId = req.user!.id;

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    this.hub.add(userId, res);

    try {
      const assets = await this.assets.getProcessingAssets(userId);
      this.hub.send(res, { type: "snapshot", assets });
    } catch (err) {
      this.log.warn({ err, userId }, "snapshot failed");
    }

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      this.hub.remove(userId, res);
    });
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(MEDIA_EVENTS_CHANNEL);
  }

  private async forward(raw: string): Promise<void> {
    let parsed: { userId?: string; assetId?: string; progress?: unknown };
    try {
      parsed = JSON.parse(raw) as {
        userId?: string;
        assetId?: string;
        progress?: unknown;
      };
    } catch {
      this.log.warn("ignored malformed media event");
      return;
    }

    const { userId, assetId } = parsed;
    if (!userId || !assetId) return;

    try {
      const asset = await this.assets.getClientAsset(assetId, userId);
      if (!asset) return;
      const progress =
        typeof parsed.progress === "number" && Number.isFinite(parsed.progress)
          ? Math.min(100, Math.max(0, Math.round(parsed.progress)))
          : undefined;
      this.hub.emit(userId, {
        type: "asset",
        asset: progress === undefined ? asset : { ...asset, progress },
      });
    } catch (err) {
      this.log.warn({ err, assetId, userId }, "failed to forward media event");
    }
  }
}
