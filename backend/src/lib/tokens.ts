import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

const ACCESS_PATH = "/api";
const REFRESH_PATH = "/api/auth";

export type UserRole = "USER" | "ADMIN";

export interface AccessPayload {
  sub: string;
  role: UserRole;
}

export interface RefreshPayload {
  sub: string;
  fid: string;
  jti: string;
}

export interface IssuedRefresh {
  token: string;
  tokenHash: string;
  familyId: string;
  jti: string;
  expiresAt: Date;
}

export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: number;
  refreshTtl: number;
  secureCookies: boolean;
}

export class TokenHelper {
  constructor(private readonly config: TokenConfig) {}

  signAccess(payload: AccessPayload): string {
    return jwt.sign(payload, this.config.accessSecret, {
      expiresIn: this.config.accessTtl,
    });
  }

  issueRefresh(userId: string, familyId?: string): IssuedRefresh {
    const fid = familyId ?? randomUUID();
    const jti = randomUUID();

    const payload: RefreshPayload = { sub: userId, fid, jti };
    const token = jwt.sign(payload, this.config.refreshSecret, {
      expiresIn: this.config.refreshTtl,
    });

    return {
      token,
      tokenHash: this.hash(token),
      familyId: fid,
      jti,
      expiresAt: new Date(Date.now() + this.config.refreshTtl * 1000),
    };
  }

  verifyAccess(token: string): AccessPayload {
    const payload = this.verify(token, this.config.accessSecret);

    const sub = payload["sub"];
    const role = payload["role"];
    if (typeof sub !== "string" || !isUserRole(role)) {
      throw new AppError(401, "TOKEN_INVALID", "Токен доступа повреждён");
    }

    return { sub, role };
  }

  verifyRefresh(token: string): RefreshPayload {
    const payload = this.verify(token, this.config.refreshSecret);

    const sub = payload["sub"];
    const fid = payload["fid"];
    const jti = payload["jti"];
    if (
      typeof sub !== "string" ||
      typeof fid !== "string" ||
      typeof jti !== "string"
    ) {
      throw new AppError(401, "TOKEN_INVALID", "Токен обновления повреждён");
    }

    return { sub, fid, jti };
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie(
      ACCESS_COOKIE,
      accessToken,
      this.cookieOptions(ACCESS_PATH, this.config.accessTtl),
    );
    res.cookie(
      REFRESH_COOKIE,
      refreshToken,
      this.cookieOptions(REFRESH_PATH, this.config.refreshTtl),
    );
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions(ACCESS_PATH));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions(REFRESH_PATH));
  }

  readAccess(req: Request): string | null {
    return readCookie(req, ACCESS_COOKIE);
  }

  readRefresh(req: Request): string | null {
    return readCookie(req, REFRESH_COOKIE);
  }

  private cookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: "lax",
      path,
      ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
    };
  }

  private verify(token: string, secret: string): jwt.JwtPayload {
    try {
      const payload = jwt.verify(token, secret);
      if (typeof payload === "string") {
        throw new AppError(401, "TOKEN_INVALID", "Токен повреждён");
      }
      return payload;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "TOKEN_EXPIRED", "Срок действия токена истёк");
      }
      throw new AppError(401, "TOKEN_INVALID", "Токен повреждён");
    }
  }
}

function isUserRole(value: unknown): value is UserRole {
  return value === "USER" || value === "ADMIN";
}

function readCookie(req: Request, name: string): string | null {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== "object" || cookies === null) return null;

  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const tokenHelper = new TokenHelper({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessTtl: env.JWT_ACCESS_TTL,
  refreshTtl: env.JWT_REFRESH_TTL,
  secureCookies: env.COOKIE_SECURE,
});
