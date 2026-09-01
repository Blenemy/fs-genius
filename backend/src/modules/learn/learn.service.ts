import type { LearnQueue } from '../../queues/learn.queue.js';
import type { JobCounts } from '../../shared/jobs.js';

export class LearnService {
  constructor(private readonly learnQueue: LearnQueue) {}

  async enqueue(): Promise<{ ids: string[]; counts: JobCounts }> {
    const job = await this.learnQueue.add({ foo: 'bar' });
    const counts = await this.learnQueue.getCounts();
    return {
      ids: job.id ? [job.id] : [],
      counts,
    };
  }
}
