import { Worker } from "bullmq";
import { childLogger } from "./lib/logger.js";
import { createRedis } from "./lib/redis.js";
import { disconnectDb } from "./lib/prisma.js";
import { QUEUE_NAMES } from "./shared/queue-names.js";
import type {
  ImageJobData,
  NotifyJobData,
  ProbeJobData,
  VideoJobData,
  CleanupJobData,
} from "./shared/jobs.js";
import { ProbeProcessor } from "./worker/probe.processor.js";
import { ImageProcessor } from "./worker/image.processor.js";
import { VideoProcessor } from "./worker/video.processor.js";
import { NotifyProcessor } from "./worker/notify.processor.js";
import { CleanupProcessor } from "./worker/cleanup.processor.js";
import { ImageQueue } from "./queues/image.queue.js";
import { VideoQueue } from "./queues/video.queue.js";
import { NotifyQueue } from "./queues/notify.queue.js";
import { CleanupQueue } from "./queues/cleanup.queue.js";
import { MediaEventsPublisher } from "./lib/media-events-publisher.js";
import { mediaBin } from "./lib/media-bin.js";
import { JobCancelStore } from "./lib/job-cancel.js";

const log = childLogger({ service: "worker" });

const probeRedis = createRedis("worker-probe", "queue");
const imageRedis = createRedis("worker-image", "queue");
const videoRedis = createRedis("worker-video", "queue");
const notifyRedis = createRedis("worker-notify", "queue");
const cleanupRedis = createRedis("worker-cleanup", "queue");
const imageProducerRedis = createRedis("worker-image-producer", "queue");
const videoProducerRedis = createRedis("worker-video-producer", "queue");
const notifyProducerRedis = createRedis("worker-notify-producer", "queue");
const cleanupProducerRedis = createRedis("worker-cleanup-producer", "queue");
const eventsPubRedis = createRedis("worker-events-pub", "queue");
const cancelRedis = createRedis("worker-cancel", "queue");

const imageQueue = new ImageQueue(imageProducerRedis);
const videoQueue = new VideoQueue(videoProducerRedis);
const notifyQueue = new NotifyQueue(notifyProducerRedis);
const cleanupQueue = new CleanupQueue(cleanupProducerRedis);
const mediaEvents = new MediaEventsPublisher(eventsPubRedis);
const jobCancel = new JobCancelStore(cancelRedis);
const shutdown = new AbortController();
const probeProcessor = new ProbeProcessor(
  imageQueue,
  videoQueue,
  mediaEvents,
  jobCancel,
  notifyQueue,
  shutdown.signal,
);
const imageProcessor = new ImageProcessor(
  mediaEvents,
  jobCancel,
  notifyQueue,
  shutdown.signal,
);
const videoProcessor = new VideoProcessor(
  mediaEvents,
  jobCancel,
  notifyQueue,
  shutdown.signal,
);
const notifyProcessor = new NotifyProcessor();
const cleanupProcessor = new CleanupProcessor();

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

const videoWorker = new Worker<VideoJobData>(
  QUEUE_NAMES.mediaVideo,
  (job) => videoProcessor.process(job),
  { connection: videoRedis, concurrency: 1, lockDuration: 35 * 60 * 1000 },
);

const notifyWorker = new Worker<NotifyJobData>(
  QUEUE_NAMES.notify,
  (job, token) => notifyProcessor.process(job, token),
  {
    connection: notifyRedis,
    concurrency: 5,
    limiter: { max: 25, duration: 1000 },
    lockDuration: 30_000,
  },
);

const cleanupWorker = new Worker<CleanupJobData>(
  QUEUE_NAMES.cleanup,
  (job) => cleanupProcessor.process(job),
  { connection: cleanupRedis, concurrency: 1, lockDuration: 10 * 60 * 1000 },
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
attachLogs(videoWorker, QUEUE_NAMES.mediaVideo);
attachLogs(notifyWorker, QUEUE_NAMES.notify);
attachLogs(cleanupWorker, QUEUE_NAMES.cleanup);

log.info(
  { ffmpeg: mediaBin("ffmpeg"), ffprobe: mediaBin("ffprobe") },
  "media binaries",
);
log.info({ queue: QUEUE_NAMES.mediaProbe }, "media probe worker listening");
log.info({ queue: QUEUE_NAMES.mediaImage }, "media image worker listening");
log.info({ queue: QUEUE_NAMES.mediaVideo }, "media video worker listening");
log.info({ queue: QUEUE_NAMES.notify }, "notify worker listening");
log.info({ queue: QUEUE_NAMES.cleanup }, "cleanup worker listening");

void cleanupQueue.scheduleHourly().catch((err) => {
  log.error({ err }, "cleanup scheduler failed");
});

async function onShutdown(signal: string): Promise<void> {
  log.info(`got ${signal}, shutting down worker`);
  shutdown.abort();

  try {
    await probeWorker.close();
    await imageWorker.close();
    await videoWorker.close();
    await notifyWorker.close();
    await cleanupWorker.close();
    await imageQueue.close();
    await videoQueue.close();
    await notifyQueue.close();
    await cleanupQueue.close();
  } catch (err) {
    log.error({ err }, "error closing worker");
  }

  try {
    await probeRedis.quit();
    await imageRedis.quit();
    await videoRedis.quit();
    await notifyRedis.quit();
    await cleanupRedis.quit();
    await imageProducerRedis.quit();
    await videoProducerRedis.quit();
    await notifyProducerRedis.quit();
    await cleanupProducerRedis.quit();
    await eventsPubRedis.quit();
    await cancelRedis.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, "error disconnecting");
  }

  process.exit(0);
}

process.on("SIGTERM", () => void onShutdown("SIGTERM"));
process.on("SIGINT", () => void onShutdown("SIGINT"));
