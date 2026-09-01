import { Worker } from 'bullmq';
import { childLogger } from './lib/logger.js';
import { createRedis } from './lib/redis.js';
import { disconnectDb } from './lib/prisma.js';
import { QUEUE_NAMES } from './shared/queue-names.js';
import type { LearnJobData } from './shared/jobs.js';
import { LearnProcessor } from './worker/learn.processor.js';

const log = childLogger({ service: 'worker' });
const connection = createRedis('worker', 'queue');
const processor = new LearnProcessor();

const worker = new Worker<LearnJobData>(
  QUEUE_NAMES.learn,
  (job) => processor.process(job),
  { connection, concurrency: 1 },
);

worker.on('completed', (job) => {
  log.info({ id: job.id }, 'completed');
});

worker.on('failed', (job, err) => {
  log.error({ id: job?.id, err }, 'failed');
});

worker.on('error', (err) => {
  log.error({ err }, 'worker error');
});

log.info({ queue: QUEUE_NAMES.learn }, 'worker listening');

async function shutdown(signal: string): Promise<void> {
  log.info(`got ${signal}, shutting down worker`);

  try {
    await worker.close();
  } catch (err) {
    log.error({ err }, 'error closing worker');
  }

  try {
    await connection.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, 'error disconnecting');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
