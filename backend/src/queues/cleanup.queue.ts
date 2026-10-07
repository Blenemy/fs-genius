import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { CleanupJobData } from "../shared/jobs.js";
import { CLEANUP_JOB_NAME, QUEUE_NAMES } from "../shared/queue-names.js";
import { CLEANUP_EVERY_MS } from "../modules/quota/limits.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ queue: "cleanup" });

export class CleanupQueue {
  private readonly queue: Queue<CleanupJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<CleanupJobData>(QUEUE_NAMES.cleanup, {
      connection,
    });
  }

  async scheduleHourly(): Promise<void> {
    await this.queue.upsertJobScheduler(
      "hourly",
      { every: CLEANUP_EVERY_MS },
      {
        name: CLEANUP_JOB_NAME,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: { age: 86_400 },
        },
      },
    );
    log.info({ everyMs: CLEANUP_EVERY_MS }, "cleanup scheduler upserted");
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
