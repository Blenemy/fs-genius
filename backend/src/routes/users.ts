import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../middleware/error.js";
import { getRedis } from "../redis.js";
import { logger } from "../logger.js";
import { RequestCoalescerInstance } from "../utils/RequestCoalescing.js";

export const usersRouter: Router = Router();
const redis = getRedis();

const createUserSchema = z.object({
  name: z.string().trim().min(1, "имя не может быть пустым").max(100),
  email: z.email("нужен корректный адрес почты"),
  country: z.string().trim().length(2).default("UA"),
  city: z.string().trim().min(1).max(80).default("Kyiv"),
});

usersRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ users });
});

usersRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_FAILED", "Проверь заполненные поля", {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }

  try {
    const user = await prisma.user.create({ data: parsed.data });
    res.status(201).json({ user });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError(
        409,
        "EMAIL_TAKEN",
        "Такая почта уже зарегистрирована",
      );
    }
    throw err;
  }
});

const reportQuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
  country: z.string().trim().length(2).optional(),
  plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  days: z.coerce.number().int().min(1).max(3650).default(365),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

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

let cacheHitCount = 0;

usersRouter.get("/users/report", async (req, res) => {
  const parsed = reportQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(
      400,
      "VALIDATION_FAILED",
      "Некорректные параметры отчёта",
      {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
    );
  }

  const { q, country, plan, days, limit, offset } = parsed.data;

  const cacheKey = `users:report:${q}:${country ?? "*"}:${plan ?? "*"}:${days}:${limit}:${offset}`;

  try {
    const getUserReportFromRedis = await redis.get(cacheKey);

    if (getUserReportFromRedis) {
      const parsedData = JSON.parse(getUserReportFromRedis);
      return res.json({ ...parsedData, cached: true, cacheKey });
    }
  } catch (err) {
    console.error("Ошибка при разборе данных из Redis:", err);
  }

  const response = await RequestCoalescerInstance.execute(
    cacheKey,
    async () => {
      cacheHitCount = cacheHitCount + 1;

      logger.info(
        { cacheHitCount, cacheKey },
        "кеш отчёта пользователей не найден, делаю SQL-запрос",
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
        " AND ",
      );

      const rows = await prisma.$queryRaw<ReportRow[]>`
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

      const [{ total }] = await prisma.$queryRaw<[{ total: bigint }]>`
    SELECT COUNT(*) AS total FROM \`User\` u WHERE ${filters}
  `;

      const tookMs = Math.round(performance.now() - startedAt);

      const responseData = {
        cached: false,
        cacheKey,
        tookMs,
        total: toNumber(total),
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
        await redis.set(cacheKey, JSON.stringify(responseData), "EX", 60 * 5); // кеш на 5 минут
      } catch (err) {
        logger.error({ err, cacheKey }, "ошибка при сохранении в Redis");
      }

      return responseData;
    },
  );

  res.json(response);
});
