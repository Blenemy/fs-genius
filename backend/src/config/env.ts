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

  // Формально необязательные, потому что в разработке приложение должно
  // подниматься и без MinIO. В production их отсутствие — ошибка старта,
  // см. requireStorageInProduction ниже.
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

  // Сколько прокси-хопов перед приложением. Влияет на req.ip: он пишется в
  // строку RefreshToken и будет ключом для rate-limit. Значение больше
  // реального числа хопов = клиент может подделать свой адрес через
  // X-Forwarded-For, меньше = все клиенты выглядят одним адресом.
  // На проде перед api два nginx: хостовый и тот, что в образе web.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
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

  requireStorageInProduction(parsed.data);

  return parsed.data;
}

/**
 * Без S3 приложение поднимется и будет выглядеть здоровым: /health отдаёт
 * storage.skipped, а загрузка отвечает 503 STORAGE_UNAVAILABLE. На проде это
 * худший вид поломки — тихий. Поэтому там отсутствие настроек валит старт.
 */
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
