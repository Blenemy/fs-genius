import { Queue } from "bullmq";
import type { JobCounts, VideoJobData } from "../shared/jobs.js";
import type { Redis } from "ioredis";
import { QUEUE_NAMES, VIDEO_JOB_NAME } from "../shared/queue-names.js";

export class VideoQueue {
  private readonly queue: Queue<VideoJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<VideoJobData>(QUEUE_NAMES.mediaVideo, {
      connection,
    });
  }

  add(data: VideoJobData) {
    return this.queue.add(VIDEO_JOB_NAME, data, {
      jobId: data.assetId,
      // A broken file must not eat three half-hour slots.
      attempts: 2,
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

  async remove(jobId: string): Promise<number> {
    return this.queue.remove(jobId);
  }

  async discard(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      return;
    }
    await this.queue.remove(jobId);
  }
}
