import type { Job } from 'bullmq';
import { childLogger } from '../lib/logger.js';
import type { LearnJobData } from '../shared/jobs.js';

export class LearnProcessor {
  private readonly log = childLogger({ processor: 'learn' });

  async process(job: Job<LearnJobData>): Promise<void> {
    this.log.info({ id: job.id, name: job.name, data: job.data }, 'picked up');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
