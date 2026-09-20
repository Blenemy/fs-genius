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
import { logger } from "./logger.js";

/** API process only. The worker process must not import this module. */
const probeProducerRedis = createRedis("probe-producer", "queue");

export const probeQueue = new ProbeQueue(probeProducerRedis);

export const usersService = new UsersService(
  prisma,
  getRedis(),
  requestCoalescer,
);

export const healthService = new HealthService(prisma, getRedis());
export const uploadsService = new UploadsService(prisma, probeQueue);
export const assetService = new AssetService(prisma);
export const authService = new AuthService(prisma, tokenHelper);

/**
 * Только очередные соединения. Общий кеш-клиент гасит disconnectRedis():
 * он единственный сбрасывает модульный shared, и повторный quit() по нему
 * из этого списка ушёл бы в уже закрытый сокет.
 */
const queueConnections = [probeProducerRedis];

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
  await probeQueue.close();

  await quitQueueConnections();

  await disconnectRedis();
  destroyS3();
  await disconnectDb();
}
