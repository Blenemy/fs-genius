import { Redis } from 'ioredis';
import { env } from './config/env.js';

/**
 * BullMQ требует maxRetriesPerRequest: null — иначе воркер отвалится
 * от блокирующих команд при первой же сетевой заминке.
 */
export function createRedis(): Redis {
  if (!env.REDIS_URL) {
    throw new Error(
      'Не задан REDIS_URL. Воркеру нужен Redis: раскомментируй сервис redis ' +
        'в docker-compose.yml и добавь переменную в .env',
    );
  }

  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
