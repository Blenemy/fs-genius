import type { Redis } from 'ioredis';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../middleware/error.js';
import { logger } from '../../lib/logger.js';
import type { RequestCoalescer } from '../../lib/request-coalescer.js';
import type { ReportQuery, CreateUserInput } from './users.schema.js';

interface ReportRow {
  id: string;
  email: string;
  name: string;
  plan: string;
  country: string;
  city: string;
  company: string | null;
  uploadsCount: bigint;
  totalBytes: bigint | null;
  failedCount: bigint;
  avgDurationMs: number | null;
  lastUploadAt: Date | null;
}

function toNumber(value: bigint | number | null): number {
  return value === null ? 0 : Number(value);
}

export class UsersService {
  private cacheMissCount = 0;
  private readonly log = logger.child({ service: 'users' });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly coalescer: RequestCoalescer,
  ) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(data: CreateUserInput) {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppError(
          409,
          'EMAIL_TAKEN',
          'Такая почта уже зарегистрирована',
        );
      }
      throw err;
    }
  }

  async getReport(query: ReportQuery) {
    const { q, country, plan, days, limit, offset } = query;
    const cacheKey = `users:report:${q}:${country ?? '*'}:${plan ?? '*'}:${days}:${limit}:${offset}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, unknown>;
        return { ...parsed, cached: true, cacheKey };
      }
    } catch (err) {
      this.log.warn({ err, cacheKey }, 'failed to read report cache');
    }

    return this.coalescer.execute(cacheKey, () =>
      this.computeReport({ q, country, plan, days, limit, offset, cacheKey }),
    );
  }

  private async computeReport(params: ReportQuery & { cacheKey: string }) {
    const { q, country, plan, days, limit, offset, cacheKey } = params;
    this.cacheMissCount += 1;

    this.log.info(
      { cacheMissCount: this.cacheMissCount, cacheKey },
      'report cache miss, running SQL',
    );

    const startedAt = performance.now();
    const like = `%${q}%`;
    const since = new Date(Date.now() - days * 86_400_000);

    const filters = Prisma.join(
      [
        Prisma.sql`u.isActive = 1`,
        q
          ? Prisma.sql`(u.name LIKE ${like} OR u.company LIKE ${like} OR u.bio LIKE ${like})`
          : Prisma.sql`1 = 1`,
        country ? Prisma.sql`u.country = ${country}` : Prisma.sql`1 = 1`,
        plan ? Prisma.sql`u.plan = ${plan}` : Prisma.sql`1 = 1`,
      ],
      ' AND ',
    );

    const rows = await this.prisma.$queryRaw<ReportRow[]>`
    SELECT
      u.id,
      u.email,
      u.name,
      u.plan,
      u.country,
      u.city,
      u.company,
      COUNT(up.id)                        AS uploadsCount,
      COALESCE(SUM(up.sizeBytes), 0)      AS totalBytes,
      AVG(up.durationMs)                  AS avgDurationMs,
      MAX(up.createdAt)                   AS lastUploadAt,
      (
        SELECT COUNT(*)
        FROM \`Upload\` f
        WHERE f.userId = u.id AND f.status = 'FAILED'
      )                                   AS failedCount
    FROM \`User\` u
    LEFT JOIN \`Upload\` up
      ON up.userId = u.id AND up.createdAt >= ${since}
    WHERE ${filters}
    GROUP BY u.id, u.email, u.name, u.plan, u.country, u.city, u.company
    ORDER BY totalBytes DESC, u.createdAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

    const countRows = await this.prisma.$queryRaw<[{ total: bigint }]>`
    SELECT COUNT(*) AS total FROM \`User\` u WHERE ${filters}
  `;

    const tookMs = Math.round(performance.now() - startedAt);

    const responseData = {
      cached: false,
      cacheKey,
      tookMs,
      total: toNumber(countRows[0]?.total ?? 0),
      limit,
      offset,
      rows: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        plan: row.plan,
        country: row.country,
        city: row.city,
        company: row.company,
        uploadsCount: toNumber(row.uploadsCount),
        totalBytes: toNumber(row.totalBytes),
        failedCount: toNumber(row.failedCount),
        avgDurationMs:
          row.avgDurationMs === null ? null : Math.round(row.avgDurationMs),
        lastUploadAt: row.lastUploadAt,
      })),
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60 * 5);
    } catch (err) {
      this.log.error({ err, cacheKey }, 'failed to write report cache');
    }

    return responseData;
  }
}
