import { Queue } from "bullmq";
import type { JobCounts, ProbeJobData } from "../shared/jobs.js";
import type { Redis } from "ioredis";
import { PROBE_JOB_NAME, QUEUE_NAMES } from "../shared/queue-names.js";

export class ProbeQueue {
  private readonly queue: Queue<ProbeJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<ProbeJobData>(QUEUE_NAMES.mediaProbe, {
      connection,
    });
  }

  add(data: ProbeJobData) {
    return this.queue.add(PROBE_JOB_NAME, data, {
      jobId: data.assetId,
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
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
