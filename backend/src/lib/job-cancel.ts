import type { Redis } from "ioredis";
import {
  CANCEL_TTL_SEC,
  assetCancelKey,
  cancelKey,
  JobCanceledError,
} from "../shared/cancel.js";

const POLL_MS = 500;

export class JobCancelStore {
  constructor(private readonly redis: Redis) {}

  async flag(jobId: string): Promise<void> {
    await this.redis.set(cancelKey(jobId), "1", "EX", CANCEL_TTL_SEC);
  }

  async flagAsset(assetId: string): Promise<void> {
    await this.redis.set(assetCancelKey(assetId), "1", "EX", CANCEL_TTL_SEC);
  }

  async isFlagged(jobId: string): Promise<boolean> {
    return (await this.redis.get(cancelKey(jobId))) === "1";
  }

  async isAssetFlagged(assetId: string): Promise<boolean> {
    return (await this.redis.get(assetCancelKey(assetId))) === "1";
  }

  async isCanceled(jobId: string, assetId?: string): Promise<boolean> {
    if (await this.isFlagged(jobId)) return true;
    if (assetId && (await this.isAssetFlagged(assetId))) return true;
    return false;
  }

  async clear(jobId: string): Promise<void> {
    await this.redis.del(cancelKey(jobId));
  }

  async clearAsset(assetId: string): Promise<void> {
    await this.redis.del(assetCancelKey(assetId));
  }

  async throwIf(jobId: string, assetId?: string): Promise<void> {
    if (await this.isCanceled(jobId, assetId)) {
      throw new JobCanceledError();
    }
  }

  watch(
    jobId: string,
    controller: AbortController,
    assetId?: string,
  ): () => void {
    const tick = () => {
      void this.isCanceled(jobId, assetId).then((yes) => {
        if (yes && !controller.signal.aborted) controller.abort();
      });
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }
}
