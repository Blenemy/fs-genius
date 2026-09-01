import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { childLogger } from './logger.js';

export type RedisRole = 'cache' | 'queue';

const roleOptions: Record<RedisRole, RedisOptions> = {
  cache: {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 200,
  },
  queue: {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  },
};

function redisUrl(): string {
  return env.REDIS_URL;
}

export function createRedis(name: string, role: RedisRole): Redis {
  const redis = new Redis(redisUrl(), {
    enableReadyCheck: true,
    ...roleOptions[role],
  });

  const log = childLogger({ redis: name, role });

  redis.on('ready', () => log.info('redis ready'));
  redis.on('error', (err) => log.error({ err }, 'redis error'));

  return redis;
}

let shared: Redis | null = null;

export function getRedis(): Redis {
  shared ??= createRedis('shared', 'cache');
  return shared;
}

export async function disconnectRedis(): Promise<void> {
  if (!shared) return;

  const redis = shared;
  shared = null;
  await redis.quit();
}
