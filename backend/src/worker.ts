import { Worker } from "bullmq";
import { childLogger } from "./lib/logger.js";
import { createRedis } from "./lib/redis.js";
import { disconnectDb } from "./lib/prisma.js";
import { QUEUE_NAMES } from "./shared/queue-names.js";
import type { ImageJobData, ProbeJobData, VideoJobData } from "./shared/jobs.js";
import { ProbeProcessor } from "./worker/probe.processor.js";
import { ImageProcessor } from "./worker/image.processor.js";
import { VideoProcessor } from "./worker/video.processor.js";
import { ImageQueue } from "./queues/image.queue.js";
import { VideoQueue } from "./queues/video.queue.js";
import { MediaEventsPublisher } from "./lib/media-events-publisher.js";
import { mediaBin } from "./lib/media-bin.js";

const log = childLogger({ service: "worker" });

const probeRedis = createRedis("worker-probe", "queue");
const imageRedis = createRedis("worker-image", "queue");
const videoRedis = createRedis("worker-video", "queue");
const imageProducerRedis = createRedis("worker-image-producer", "queue");
const videoProducerRedis = createRedis("worker-video-producer", "queue");
const eventsPubRedis = createRedis("worker-events-pub", "queue");

const imageQueue = new ImageQueue(imageProducerRedis);
const videoQueue = new VideoQueue(videoProducerRedis);
const mediaEvents = new MediaEventsPublisher(eventsPubRedis);
const probeProcessor = new ProbeProcessor(imageQueue, videoQueue, mediaEvents);
const imageProcessor = new ImageProcessor(mediaEvents);
const videoProcessor = new VideoProcessor(mediaEvents);

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

log.info(
  { ffmpeg: mediaBin("ffmpeg"), ffprobe: mediaBin("ffprobe") },
  "media binaries",
);
log.info({ queue: QUEUE_NAMES.mediaProbe }, "media probe worker listening");
log.info({ queue: QUEUE_NAMES.mediaImage }, "media image worker listening");
log.info({ queue: QUEUE_NAMES.mediaVideo }, "media video worker listening");

async function shutdown(signal: string): Promise<void> {
  log.info(`got ${signal}, shutting down worker`);

  try {
    await probeWorker.close();
    await imageWorker.close();
    await videoWorker.close();
    await imageQueue.close();
    await videoQueue.close();
  } catch (err) {
    log.error({ err }, "error closing worker");
  }

  try {
    await probeRedis.quit();
    await imageRedis.quit();
    await videoRedis.quit();
    await imageProducerRedis.quit();
    await videoProducerRedis.quit();
    await eventsPubRedis.quit();
    await disconnectDb();
  } catch (err) {
    log.error({ err }, "error disconnecting");
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
