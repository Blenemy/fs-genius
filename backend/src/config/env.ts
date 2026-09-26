import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "нужна строка подключения к MySQL"),

  REDIS_URL: z.string().min(1, "нужна строка подключения к Redis"),

  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),

  JWT_ACCESS_SECRET: z.string().min(32, "нужен секрет не короче 32 символов"),
  JWT_REFRESH_SECRET: z.string().min(32, "нужен секрет не короче 32 символов"),

  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  COOKIE_SECURE: z.stringbool().default(false),

  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

  FFMPEG_PATH: z.string().min(1).optional(),
  FFPROBE_PATH: z.string().min(1).optional(),

  TELEGRAM_BOT_TOKEN: optionalEnv(z.string().min(1)),
  TELEGRAM_CHAT_ID: optionalEnv(z.string().regex(/^-?\d+$/)),
  TELEGRAM_WEBHOOK_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    })
    .pipe(z.url().optional()),
  TELEGRAM_WEBHOOK_SECRET: optionalEnv(
    z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  ),

  STRIPE_SECRET_KEY: optionalEnv(z.string().min(1)),
  STRIPE_CHECKOUT_SUCCESS_URL: optionalUrl(),
  STRIPE_CHECKOUT_CANCEL_URL: optionalUrl(),
});

function optionalEnv(schema: z.ZodString) {
  return z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    })
    .pipe(schema.optional());
}

function optionalUrl() {
  return z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    })
    .pipe(z.url().optional());
}

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map(
        (issue) => `  ${issue.path.join(".") || "(корень)"}: ${issue.message}`,
      )
      .join("\n");

    console.error(
      `Некорректное окружение:\n${problems}\n\nСверься с .env.example`,
    );
    process.exit(1);
  }

  requireStorageInProduction(parsed.data);

  return parsed.data;
}

function requireStorageInProduction(env: Env): void {
  if (env.NODE_ENV !== "production") return;

  const missing = (
    ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const
  ).filter((key) => !env[key]);

  if (missing.length === 0) return;

  console.error("NODE_ENV=production, но хранилище не настроено.");
  console.error("Не хватает:");
  for (const key of missing) console.error(`  ${key}`);
  console.error("Без них загрузка файлов отвечает 503. Сверься с .env.example");
  process.exit(1);
}

export const env = loadEnv();

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
