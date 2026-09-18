import type { RequestHandler } from "express";
import { corsOrigins } from "../config/env.js";
import { tokenHelper, type UserRole } from "../lib/tokens.js";
import { AppError } from "./error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = tokenHelper.readAccess(req);

  if (!token) {
    return next(new AppError(401, "UNAUTHORIZED", "Нужен вход"));
  }

  const payload = tokenHelper.verifyAccess(token);
  req.user = { id: payload.sub, role: payload.role };
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Нужен вход"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "FORBIDDEN", "Недостаточно прав"));
    }

    next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const checkOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (!origin) return next();

  if (!corsOrigins.includes(origin)) {
    return next(new AppError(403, "BAD_ORIGIN", "Запрос с чужого сайта"));
  }

  next();
};
