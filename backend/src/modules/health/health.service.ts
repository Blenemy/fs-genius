import type { Redis } from 'ioredis';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { checkStorage, type StorageCheck } from '../../lib/s3.js';

export type DepCheck = { ok: true } | { ok: false; error: string };

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: 'api';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    mysql: DepCheck;
    redis: DepCheck;
    storage: StorageCheck;
  };
}

export class HealthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [mysql, redis, storage] = await Promise.all([
      this.checkMysql(),
      this.checkRedis(),
      checkStorage(),
    ]);

    const ok = mysql.ok && redis.ok && storage.ok;

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { mysql, redis, storage },
    };
  }

  private async checkMysql(): Promise<DepCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'mysql unreachable' };
    }
  }

  private async checkRedis(): Promise<DepCheck> {
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return { ok: false, error: `unexpected ping reply: ${pong}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'redis unreachable' };
    }
  }
}
