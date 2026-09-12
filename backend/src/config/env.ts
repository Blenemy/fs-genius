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
  // Список источников через запятую — фронт в разработке и домен в проде.
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "нужна строка подключения к MySQL"),

  REDIS_URL: z.string().min(1, "нужна строка подключения к Redis"),

  // Хранилище пока не подключено ни одной строкой кода, поэтому переменные
  // необязательные — иначе приложение не поднимется на сервере без S3.
  // Сделать обязательными на этапе M1, когда появится выдача временных ссылок.
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  // MinIO работает по path-style, реальный S3 — по virtual-hosted.
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),

  // Секреты обязательные и разные: одним ключом на оба типа токена access
  // становится валидным refresh-ом. Дефолта здесь быть не должно — молча
  // подписывать общеизвестным ключом хуже, чем не подняться.
  JWT_ACCESS_SECRET: z.string().min(32, 'нужен секрет не короче 32 символов'),
  JWT_REFRESH_SECRET: z.string().min(32, 'нужен секрет не короче 32 символов'),
  // В секундах, а не строкой «15m»: это же число уходит в maxAge куки,
  // а типы jsonwebtoken принимают строку только из своего формата ms.
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  // Флаг Secure у кук. Отдельной переменной, а не через NODE_ENV: профиль app
  // в docker поднимается с NODE_ENV=production, но отдаётся по http на
  // 127.0.0.1:8080 — там Secure надо выключить, иначе браузер молча выбросит
  // Set-Cookie и вход будет «успешным», но нерабочим.
  COOKIE_SECURE: z.stringbool().default(false),
});

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

  return parsed.data;
}

export const env = loadEnv();

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === "production";
