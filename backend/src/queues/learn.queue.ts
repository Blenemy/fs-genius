import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_NAMES, LEARN_JOB_NAME } from '../shared/queue-names.js';
import type { JobCounts, LearnJobData } from '../shared/jobs.js';

export class LearnQueue {
  private readonly queue: Queue<LearnJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<LearnJobData>(QUEUE_NAMES.learn, { connection });
  }

  add(data: LearnJobData) {
    return this.queue.add(LEARN_JOB_NAME, data);
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
