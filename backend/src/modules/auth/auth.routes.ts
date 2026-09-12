/**
 * ГАЙДЛАЙН. Здесь пока нет кода — только то, что нужно написать.
 * Образец рядом: src/modules/users/users.routes.ts и uploads/uploads.routes.ts.
 *
 * Роут тонкий (CONVENTIONS.md:89): Zod → сервис → res.json. Ни одного
 * обращения к Prisma, ни одного res.status(500). Express 5 сам передаёт
 * реджект из async-хендлера в errorHandler — try/catch и next(err) не нужны.
 *
 * ── Каркас ───────────────────────────────────────────────────────────────────
 *
 *   export const authRouter: Router = Router();
 *
 * Аннотация `: Router` обязательна — без неё tsc не соберёт декларации.
 * Пути пишутся полностью ('/auth/login'), потому что в app.ts все роутеры
 * монтируются на голый '/api'. Так устроены все существующие модули.
 *
 * ── Ограничение частоты ──────────────────────────────────────────────────────
 *
 * express-rate-limit уже в зависимостях и нигде не используется. Заведи
 * ДВА лимитера прямо в этом файле:
 *
 *   authLimiter     — на /auth/login и /auth/register. Что-то вроде
 *                     windowMs: 15 минут, limit: 10. Форма входа без лимита —
 *                     это приглашение перебирать пароли, а argon2 на каждую
 *                     попытку ещё и занимает процессор, так что перебор
 *                     заодно кладёт сервер.
 *   refreshLimiter  — на /auth/refresh, заметно свободнее (скажем, 60 за
 *                     15 минут): сюда законно ходит каждая вкладка.
 *
 * Лимитер обязан считать по IP, а `trust proxy` уже выставлен в 1 (app.ts:18),
 * так что req.ip — это реальный адрес из X-Forwarded-For, а не адрес nginx.
 * Ответ при срабатывании должен идти в общем формате ошибок: передай
 * handler, который бросает AppError(429, 'TOO_MANY_REQUESTS', '…').
 *
 * ── Маршруты ─────────────────────────────────────────────────────────────────
 *
 *   POST /auth/register   authLimiter
 *     safeParse(registerSchema) → на неуспехе AppError(400,'VALIDATION_FAILED',
 *     'Проверь заполненные поля', { issues: … }) — блок issues скопируй из
 *     users.routes.ts дословно, фронт рассчитывает именно на него.
 *     Дальше authService.register(parsed.data, meta(req)),
 *     tokens.setAuthCookies(res, …), res.status(201).json({ user }).
 *     Токены в теле НЕ отдаём — весь смысл в том, что их не видит JS.
 *
 *   POST /auth/login      authLimiter      → 200 { user }
 *   POST /auth/refresh    refreshLimiter   → 200 { user } (или { ok: true })
 *   POST /auth/logout                      → 200 { ok: true }, всегда
 *   GET  /auth/me         requireAuth      → 200 { user }
 *
 * meta(req) — маленький хелпер в этом же файле:
 *   { userAgent: req.get('user-agent')?.slice(0, 255), ip: req.ip }
 * Обрезка по 255 не косметическая: столько в @db.VarChar(255), а более
 * длинный заголовок положит INSERT.
 *
 * ── Куки на ошибках ──────────────────────────────────────────────────────────
 *
 * Когда refresh не прошёл, куки надо погасить: иначе браузер будет бесконечно
 * слать мёртвый токен, а фронт — получать 401 и снова дёргать refresh.
 * Сервис бросает AppError и до res уже не доберётся, поэтому чистить куки
 * нужно в самом роуте: оберни вызов в try/catch, в catch вызови
 * tokens.clearAuthCookies(res) и брось ошибку дальше (throw err).
 * Это единственное место во всём модуле, где try/catch оправдан.
 *
 * ── Порядок в app.ts ─────────────────────────────────────────────────────────
 *
 * app.use('/api', authRouter) — до остальных роутеров не обязательно,
 * пути не пересекаются. Важно другое: строка должна стоять ВЫШЕ
 * notFoundHandler, иначе все /auth/* будут отдавать 404.
 */

import { Router, type Request } from "express";
import { authService } from "../../lib/container.js";
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
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_FAILED", "Проверь заполненные поля", {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const { user, accessToken, refreshToken } = await authService.login(
    parsed.data,
    sessionMeta(req),
  );

  tokenHelper.setAuthCookies(res, accessToken, refreshToken);
  res.status(200).json({ user });
});

authRouter.post("/auth/register", async (_req, res) => {
  const parsed = registerSchema.safeParse(_req.body);

  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_FAILED", "Проверь заполненные поля", {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const { user, accessToken, refreshToken } = await authService.register(
    parsed.data,
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
