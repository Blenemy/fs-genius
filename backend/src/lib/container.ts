import { prisma, disconnectDb } from "./prisma.js";
import { createRedis, getRedis, disconnectRedis } from "./redis.js";
import { destroyS3 } from "./s3.js";
import { requestCoalescer } from "./request-coalescer.js";
import { HealthService } from "../modules/health/health.service.js";
import { LearnQueue } from "../queues/learn.queue.js";
import { LearnService } from "../modules/learn/learn.service.js";
import { LearnEventsHub } from "../modules/learn/learn.events.js";
import { UsersService } from "../modules/users/users.service.js";
import { UploadsService } from "../modules/uploads/uploads.service.js";
import { AssetService } from "../modules/assets/assets.service.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { tokenHelper } from "./tokens.js";
import { ImageQueue } from "../queues/image.queue.js";

/** API process only. The worker process must not import this module. */
const learnProducerRedis = createRedis("learn-producer", "queue");
const imageProducerRedis = createRedis("image-producer", "queue");
const learnEventsRedis = createRedis("queue-events", "queue");

export const learnQueue = new LearnQueue(learnProducerRedis);
export const imageQueue = new ImageQueue(imageProducerRedis);
export const learnEventsHub = new LearnEventsHub(learnQueue, learnEventsRedis);
export const learnService = new LearnService(learnQueue);

export const usersService = new UsersService(
  prisma,
  getRedis(),
  requestCoalescer,
);

export const healthService = new HealthService(prisma, getRedis());
export const uploadsService = new UploadsService(prisma, imageQueue);
export const assetService = new AssetService(prisma);
export const authService = new AuthService(prisma, tokenHelper);

export async function disconnectApi(): Promise<void> {
  await learnEventsHub.close();
  await learnQueue.close();
  await imageQueue.close();

  try {
    await learnProducerRedis.quit();
  } catch {
    // already closed
  }

  try {
    await imageProducerRedis.quit();
  } catch {
    // already closed
  }

  try {
    await learnEventsRedis.quit();
  } catch {
    // already closed
  }

  await disconnectRedis();
  destroyS3();
  await disconnectDb();
}
