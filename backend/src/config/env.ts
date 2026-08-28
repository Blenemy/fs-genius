import 'dotenv/config';
import { z } from 'zod';

/**
 * Схема окружения. Всё, что нужно api и воркеру, объявляется здесь и только здесь.
 * Процесс падает на старте с внятным списком проблем, а не через полчаса
 * на первом обращении к undefined.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  // Список источников через запятую — фронт в разработке и домен в проде.
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'нужна строка подключения к MySQL'),
  REDIS_URL: z.string().min(1, 'нужна строка подключения к Redis'),

  // Хранилище пока не подключено ни одной строкой кода, поэтому переменные
  // необязательные — иначе приложение не поднимется на сервере без S3.
  // Сделать обязательными на этапе M1, когда появится выдача временных ссылок.
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  // MinIO работает по path-style, реальный S3 — по virtual-hosted.
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(корень)'}: ${issue.message}`)
      .join('\n');

    console.error(`Некорректное окружение:\n${problems}\n\nСверься с .env.example`);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
