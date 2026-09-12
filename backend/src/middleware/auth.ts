/**
 * ГАЙДЛАЙН. Здесь пока нет кода — только то, что нужно написать.
 * Образец рядом: src/middleware/error.ts (middleware — функции, не классы,
 * CONVENTIONS.md:85).
 *
 * Два предмета в этом файле: requireAuth и проверка Origin.
 *
 * ── 1. Типизация req.user ────────────────────────────────────────────────────
 *
 * Express не знает про поле user, и просто присвоить req.user не выйдет —
 * strict не пустит. Нужно расширить его интерфейс. В этом файле, наверху:
 *
 *   declare global {
 *     namespace Express {
 *       interface Request {
 *         user?: { id: string; role: UserRole };
 *       }
 *     }
 *   }
 *
 * Именно опциональным (user?), потому что на публичных маршрутах его нет.
 * Соблазн объявить обязательным понятен — тогда в защищённых хендлерах
 * не придётся писать проверку, — но тогда TypeScript будет врать про
 * каждый маршрут без requireAuth.
 *
 * Чтобы блок declare global заработал, файл должен быть модулем: где-то
 * в нём нужен хотя бы один import или export. Здесь они и так будут.
 *
 * ── 2. requireAuth ───────────────────────────────────────────────────────────
 *
 *   export const requireAuth: RequestHandler = (req, _res, next) => { … }
 *
 * Шаги:
 *   1. token = tokenHelper.readAccess(req);
 *   2. Нет токена → next(new AppError(401, 'UNAUTHORIZED', 'Нужен вход')).
 *   3. payload = tokenHelper.verifyAccess(token) — сам бросит 401
 *      TOKEN_EXPIRED или TOKEN_INVALID. Эти коды фронт различает: на
 *      TOKEN_EXPIRED он молча идёт в /auth/refresh, на TOKEN_INVALID —
 *      выкидывает на форму входа. Не схлопывай их в один код.
 *   4. req.user = { id: payload.sub, role: payload.role }; next();
 *
 * Важно: verifyAccess бросает синхронно, а middleware синхронная — значит
 * Express 5 поймает исключение сам, и оборачивать в try/catch не нужно.
 * Но если решишь сходить в базу за пользователем (не надо — access-токен
 * на то и самодостаточен), функция станет async, и вот тогда нужен
 * next(err) или try/catch.
 *
 * В базу за пользователем здесь НЕ ходим. 15 минут неактуальной роли —
 * приемлемая цена; лишний SELECT на каждый запрос к API — нет.
 *
 * Рядом может пригодиться requireRole('ADMIN') — функция, возвращающая
 * middleware. Сейчас не нужна, ролями ничего не закрыто.
 *
 * ── 3. checkOrigin ───────────────────────────────────────────────────────────
 *
 * Раз оба токена стали куками, браузер шлёт их и по запросу, который
 * инициировал чужой сайт. SameSite=Lax режет кросс-сайтовые POST, и этого
 * почти достаточно — но «почти» здесь стоит десяти строк:
 *
 *   export const checkOrigin: RequestHandler = (req, _res, next) => { … }
 *
 *   - Безопасные методы (GET, HEAD, OPTIONS) пропускать сразу.
 *   - Origin отсутствует — пропускать. Его нет у curl и у серверных
 *     клиентов; браузер его проставляет всегда, а мы защищаемся именно
 *     от браузера жертвы.
 *   - Origin есть и его нет в corsOrigins (уже экспортирован из
 *     config/env.ts) → AppError(403, 'BAD_ORIGIN', 'Запрос с чужого сайта').
 *
 * Вешать глобально в app.ts, сразу после cookieParser() и до роутеров.
 * Проверь, что CORS_ORIGIN на проде содержит боевой домен, иначе положишь
 * себе все POST-запросы разом.
 */

import type { RequestHandler } from "express";
import { tokenHelper, type UserRole } from "../lib/tokens.js";
import { AppError } from "./error.js";

declare global {
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
