import { Redis } from 'ioredis';
import { env } from './config/env.js';

/**
 * BullMQ требует maxRetriesPerRequest: null — иначе воркер отвалится
 * от блокирующих команд при первой же сетевой заминке.
 */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
