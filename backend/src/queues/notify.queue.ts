import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { JobCounts, NotifyJobData } from "../shared/jobs.js";
import { NOTIFY_JOB_NAME, QUEUE_NAMES } from "../shared/queue-names.js";
import { env } from "../config/env.js";
import { childLogger } from "../lib/logger.js";

function isDuplicateJobId(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message);
}

const log = childLogger({ queue: "notify" });

export class NotifyQueue {
  private readonly queue: Queue<NotifyJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<NotifyJobData>(QUEUE_NAMES.notify, {
      connection,
    });
  }

  async add(data: NotifyJobData): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN) return;
    try {
      await this.queue.add(NOTIFY_JOB_NAME, data, {
        jobId: `${data.assetId}:${data.status}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 86_400 },
      });
    } catch (err) {
      if (isDuplicateJobId(err)) return;
      log.warn({ err, assetId: data.assetId }, "notify enqueue failed");
    }
  }

  async getCounts(): Promise<JobCounts> {
    const raw = await this.queue.getJobCounts();
    return {
      waiting: raw.waiting ?? 0,
      active: raw.active ?? 0,
      completed: raw.completed ?? 0,
      failed: raw.failed ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
