import type { Redis } from "ioredis";
import { childLogger } from "./logger.js";
import {
  MEDIA_EVENTS_CHANNEL,
  type MediaEventPayload,
} from "../shared/media-events.js";

export class MediaEventsPublisher {
  private readonly log = childLogger({ component: "media-events" });

  constructor(private readonly redis: Redis) {}

  async publish(payload: MediaEventPayload): Promise<void> {
    try {
      await this.redis.publish(
        MEDIA_EVENTS_CHANNEL,
        JSON.stringify(payload),
      );
    } catch (err) {
      this.log.warn({ err, assetId: payload.assetId }, "failed to publish");
    }
  }
}
