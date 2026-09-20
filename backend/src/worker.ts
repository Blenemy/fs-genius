import { Worker } from "bullmq";
import { childLogger } from "./lib/logger.js";
import { createRedis } from "./lib/redis.js";
import { disconnectDb } from "./lib/prisma.js";
import { QUEUE_NAMES } from "./shared/queue-names.js";
import type { ImageJobData, ProbeJobData } from "./shared/jobs.js";
import { ProbeProcessor } from "./worker/probe.processor.js";
import { ImageProcessor } from "./worker/image.processor.js";
import { ImageQueue } from "./queues/image.queue.js";

const log = childLogger({ service: "worker" });

const probeRedis = createRedis("worker-probe", "queue");
const imageRedis = createRedis("worker-image", "queue");
const imageProducerRedis = createRedis("worker-image-producer", "queue");

const imageQueue = new ImageQueue(imageProducerRedis);
const probeProcessor = new ProbeProcessor(imageQueue);
const imageProcessor = new ImageProcessor();

const probeWorker = new Worker<ProbeJobData>(
  QUEUE_NAMES.mediaProbe,
  (job) => probeProcessor.process(job),
  { connection: probeRedis, concurrency: 4, lockDuration: 30_000 },
);

const imageWorker = new Worker<ImageJobData>(
  QUEUE_NAMES.mediaImage,
  (job) => imageProcessor.process(job),
  { connection: imageRedis, concurrency: 1 },
);

function attachLogs(worker: Worker, queueName: string) {
  worker.on("completed", (job) => {
    log.info({ id: job.id, queue: queueName }, "job completed");
  });
  worker.on("failed", (job, err) => {
    log.error({ id: job?.id, err, queue: queueName }, "job failed");
  });
  worker.on("error", (err) => {
    log.error({ err, queue: queueName }, "worker error");
  });
}

attachLogs(probeWorker, QUEUE_NAMES.mediaProbe);
attachLogs(imageWorker, QUEUE_NAMES.mediaImage);

log.info({ queue: QUEUE_NAMES.mediaProbe }, "media probe worker listening");
log.info({ queue: QUEUE_NAMES.mediaImage }, "media image worker listening");

async function shutdown(signal: string): Promise<void> {
  log.info(`got ${signal}, shutting down worker`);

  try {
    await probeWorker.close();
    await imageWorker.close();
    await imageQueue.close();
  } catch (err) {
    log.error({ err }, "error closing worker");
  }

  try {
    await probeRedis.quit();
    await imageRedis.quit();
    await imageProducerRedis.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, "error disconnecting");
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
