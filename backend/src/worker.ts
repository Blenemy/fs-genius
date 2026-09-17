import { Worker } from 'bullmq';
import { childLogger } from './lib/logger.js';
import { createRedis } from './lib/redis.js';
import { disconnectDb } from './lib/prisma.js';
import { QUEUE_NAMES } from './shared/queue-names.js';
import type { ImageJobData, LearnJobData } from './shared/jobs.js';
import { LearnProcessor } from './worker/learn.processor.js';
import { ImageProcessor } from './worker/image.processor.js';

const log = childLogger({ service: 'worker' });

const learnRedis = createRedis('worker-learn', 'queue');
const imageRedis = createRedis('worker-image', 'queue');

const learnProcessor = new LearnProcessor();
const imageProcessor = new ImageProcessor();

const learnWorker = new Worker<LearnJobData>(
  QUEUE_NAMES.learn,
  (job) => learnProcessor.process(job),
  { connection: learnRedis, concurrency: 1 },
);

const imageWorker = new Worker<ImageJobData>(
  QUEUE_NAMES.mediaImage,
  (job) => imageProcessor.process(job),
  { connection: imageRedis, concurrency: 1 },
);

learnWorker.on('completed', (job) => {
  log.info({ id: job.id }, 'completed');
});
learnWorker.on('failed', (job, err) => {
  log.error({ id: job?.id, err }, 'failed');
});
learnWorker.on('error', (err) => {
  log.error({ err }, 'worker error');
});

imageWorker.on('completed', (job) => {
  log.info({ id: job.id }, 'media image job completed');
});
imageWorker.on('failed', (job, err) => {
  log.error({ id: job?.id, err }, 'media image job failed');
});
imageWorker.on('error', (err) => {
  log.error({ err }, 'media image worker error');
});

log.info({ queue: QUEUE_NAMES.learn }, 'worker listening');
log.info({ queue: QUEUE_NAMES.mediaImage }, 'media image worker listening');

async function shutdown(signal: string): Promise<void> {
  log.info(`got ${signal}, shutting down worker`);

  try {
    await learnWorker.close();
    await imageWorker.close();
  } catch (err) {
    log.error({ err }, 'error closing worker');
  }

  try {
    await learnRedis.quit();
    await imageRedis.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, 'error disconnecting');
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
