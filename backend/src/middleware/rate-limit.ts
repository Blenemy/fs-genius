import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AppError } from "./error.js";

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

/**
 * Счётчик в памяти процесса api. На один контейнер этого хватает:
 * рестарт обнуляет окно, горизонтальное масштабирование api — нет.
 * Ключ входа и регистрации — IP (за прокси это req.ip, trust proxy = 1).
 * Успешный вход не ест бюджет, иначе NAT офиса запрёт всех после пары людей.
 */
export const loginRateLimit = createIpRateLimit(
  20,
  FIFTEEN_MIN_MS,
  "Слишком много попыток входа. Попробуй через несколько минут.",
  true,
);

/** Пять аккаунтов в час с одного адреса. Дальше это уже не человек. */
export const registerRateLimit = createIpRateLimit(
  5,
  HOUR_MS,
  "Слишком много регистраций с этого адреса. Попробуй позже.",
);

/**
 * Черновик на каждый presign садится в квоту. Тридцать за десять минут
 * хватает пачке файлов и не даёт наплодить тысячи строк.
 */
export const presignRateLimit = createUserRateLimit(
  30,
  TEN_MIN_MS,
  "Слишком много ссылок на загрузку. Попробуй через несколько минут.",
);

export function createIpRateLimit(
  limit: number,
  windowMs: number,
  message: string,
  skipSuccessfulRequests = false,
) {
  return createRateLimit(limit, windowMs, message, clientIp, skipSuccessfulRequests);
}

export function createUserRateLimit(
  limit: number,
  windowMs: number,
  message: string,
) {
  return createRateLimit(limit, windowMs, message, (req) => {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${clientIp(req)}`;
  });
}

function createRateLimit(
  limit: number,
  windowMs: number,
  message: string,
  keyGenerator: (req: Request) => string,
  skipSuccessfulRequests = false,
) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator,
    handler: (_req, _res, next) => {
      next(new AppError(429, "RATE_LIMITED", message));
    },
  });
}

function clientIp(req: Request): string {
  const ip = req.ip;
  if (!ip) return "unknown";
  return ipKeyGenerator(ip);
}
