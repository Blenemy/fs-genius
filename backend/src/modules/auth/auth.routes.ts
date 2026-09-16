import { Router, type Request } from "express";
import { authService } from "../../lib/container.js";
import { parseOrThrow } from "../../lib/parse.js";
import { tokenHelper } from "../../lib/tokens.js";
import { AppError } from "../../middleware/error.js";
import {
  loginSchema,
  registerSchema,
  type SessionMeta,
} from "./auth.schema.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter: Router = Router();

function sessionMeta(req: Request): SessionMeta {
  return {
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
  };
}

authRouter.post("/auth/login", async (req, res) => {
  const data = parseOrThrow(loginSchema, req.body, "Проверь заполненные поля");

  const { user, accessToken, refreshToken } = await authService.login(
    data,
    sessionMeta(req),
  );

  tokenHelper.setAuthCookies(res, accessToken, refreshToken);
  res.status(200).json({ user });
});

authRouter.post("/auth/register", async (_req, res) => {
  const data = parseOrThrow(
    registerSchema,
    _req.body,
    "Проверь заполненные поля",
  );

  const { user, accessToken, refreshToken } = await authService.register(
    data,
    sessionMeta(_req),
  );

  tokenHelper.setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({ user });
});

authRouter.post("/auth/refresh", async (_req, res) => {
  const refreshToken = tokenHelper.readRefresh(_req);

  if (!refreshToken) {
    tokenHelper.clearAuthCookies(res);
    throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
  }

  try {
    const {
      user,
      accessToken,
      refreshToken: newRefreshToken,
    } = await authService.refresh(refreshToken, sessionMeta(_req));

    tokenHelper.setAuthCookies(res, accessToken, newRefreshToken);

    res.status(200).json({ user });
  } catch (err) {
    tokenHelper.clearAuthCookies(res);
    throw err;
  }
});

authRouter.post("/auth/logout", async (_req, res) => {
  const refreshToken = tokenHelper.readRefresh(_req);

  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  tokenHelper.clearAuthCookies(res);
  res.status(200).json({ ok: true });
});

authRouter.get("/auth/me", requireAuth, async (_req, res) => {
  const { user } = await authService.me(_req.user!.id);
  res.status(200).json({ user });
});
