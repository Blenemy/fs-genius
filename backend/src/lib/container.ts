import { prisma, disconnectDb } from "./prisma.js";
import { createRedis, getRedis, disconnectRedis } from "./redis.js";
import { destroyS3 } from "./s3.js";
import { requestCoalescer } from "./request-coalescer.js";
import { HealthService } from "../modules/health/health.service.js";
import { UsersService } from "../modules/users/users.service.js";
import { UploadsService } from "../modules/uploads/uploads.service.js";
import { AssetService } from "../modules/assets/assets.service.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { tokenHelper } from "./tokens.js";
import { ProbeQueue } from "../queues/probe.queue.js";
import { ImageQueue } from "../queues/image.queue.js";
import { VideoQueue } from "../queues/video.queue.js";
import { MediaEventsPublisher } from "./media-events-publisher.js";
import { JobCancelStore } from "./job-cancel.js";
import { MediaEventsHub } from "../modules/events/events.hub.js";
import { logger } from "./logger.js";
import { TelegramService } from "../modules/telegram/telegram.service.js";
import { BillingService } from "../modules/billing/billing.service.js";

/** API process only. The worker process must not import this module. */
const probeProducerRedis = createRedis("probe-producer", "queue");
const imageProducerRedis = createRedis("image-producer", "queue");
const videoProducerRedis = createRedis("video-producer", "queue");
const eventsPubRedis = createRedis("events-pub", "queue");
const eventsSubRedis = createRedis("events-sub", "queue");

export const probeQueue = new ProbeQueue(probeProducerRedis);
export const imageQueue = new ImageQueue(imageProducerRedis);
export const videoQueue = new VideoQueue(videoProducerRedis);
export const mediaEventsPublisher = new MediaEventsPublisher(eventsPubRedis);
export const jobCancelStore = new JobCancelStore(getRedis());

export const usersService = new UsersService(
  prisma,
  getRedis(),
  requestCoalescer,
);

export const healthService = new HealthService(prisma, getRedis());
export const assetService = new AssetService(
  prisma,
  probeQueue,
  imageQueue,
  videoQueue,
  jobCancelStore,
  mediaEventsPublisher,
);
export const mediaEventsHub = new MediaEventsHub(eventsSubRedis, assetService);
export const uploadsService = new UploadsService(
  prisma,
  probeQueue,
  mediaEventsPublisher,
);
export const authService = new AuthService(prisma, tokenHelper);
export const telegramService = new TelegramService(prisma, getRedis());
export const billingService = new BillingService(prisma);

/**
 * Только очередные соединения. Общий кеш-клиент гасит disconnectRedis():
 * он единственный сбрасывает модульный shared, и повторный quit() по нему
 * из этого списка ушёл бы в уже закрытый сокет.
 */
const queueConnections = [
  probeProducerRedis,
  imageProducerRedis,
  videoProducerRedis,
  eventsPubRedis,
  eventsSubRedis,
];

async function quitQueueConnections(): Promise<void> {
  for (const connection of queueConnections) {
    try {
      await connection.quit();
    } catch (err) {
      logger.warn({ err }, "failed to quit redis connection");
    }
  }
}

export async function disconnectApi(): Promise<void> {
  await telegramService.stop();
  await mediaEventsHub.close();
  await probeQueue.close();
  await imageQueue.close();
  await videoQueue.close();

  await quitQueueConnections();

  await disconnectRedis();
  destroyS3();
  await disconnectDb();
}
