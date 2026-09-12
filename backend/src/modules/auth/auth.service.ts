/**
 * ГАЙДЛАЙН. Здесь пока нет кода — только то, что нужно написать.
 * Образец рядом: src/modules/users/users.service.ts (класс, инъекция в
 * конструктор, AppError прямо из сервиса, P2002 → 409).
 *
 * Это самый содержательный файл этапа. Всё остальное — обвязка.
 *
 * ── Форма класса ─────────────────────────────────────────────────────────────
 *
 *   import { hash, verify } from '@node-rs/argon2';
 *   import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
 *   import { AppError } from '../../middleware/error.js';
 *   import { logger } from '../../lib/logger.js';
 *   import type { TokenHelper } from '../../lib/tokens.js';
 *   import type { LoginInput, RegisterInput } from './auth.schema.js';
 *
 *   export class AuthService {
 *     private readonly log = logger.child({ service: 'auth' });
 *
 *     constructor(
 *       private readonly prisma: PrismaClient,
 *       private readonly tokens: TokenHelper,
 *     ) {}
 *   }
 *
 * Сервис не знает про Request и Response. Он принимает данные и возвращает
 * данные; куки ставит роут, вызывая tokens.setAuthCookies. Единственное
 * исключение — userAgent и ip: их роут достаёт из запроса и передаёт
 * аргументом, потому что они пишутся в строку RefreshToken.
 *
 * ── Общий приём: выдача пары ─────────────────────────────────────────────────
 *
 * Заведи приватный метод issueSession(userId, role, familyId?, meta?), он нужен
 * трём публичным методам сразу:
 *
 *   1. tokens.issueRefresh(userId, familyId) — familyId передаётся только при
 *      ротации, при входе и регистрации его нет и цепочка начинается новая.
 *   2. prisma.refreshToken.create({ tokenHash, familyId, userId, expiresAt,
 *      userAgent, ip }).
 *   3. tokens.signAccess({ sub: userId, role }).
 *   4. Вернуть { accessToken, refreshToken, rowId }.
 *
 * В базу кладётся tokenHash, а не token. Сам токен нигде не сохраняется —
 * он существует только в куке браузера.
 *
 * ── register(input: RegisterInput, meta) ─────────────────────────────────────
 *
 *   1. passwordHash = await hash(input.password)  — параметры argon2 по
 *      умолчанию у @node-rs/argon2 уже соответствуют рекомендациям OWASP,
 *      подбирать их руками не нужно.
 *   2. prisma.user.create. Почту на занятость ЗАРАНЕЕ не проверять: между
 *      SELECT и INSERT успевает вклиниться второй такой же запрос. Ловить
 *      Prisma.PrismaClientKnownRequestError с code === 'P2002' и бросать
 *      AppError(409, 'EMAIL_TAKEN', 'Такая почта уже зарегистрирована').
 *      Готовый образец — users.service.ts:48-58.
 *   3. Сразу выдать сессию: после регистрации человек должен оказаться
 *      внутри, а не на форме входа.
 *   4. Вернуть публичный профиль (id, email, name, role) и пару токенов.
 *      passwordHash наружу не отдавать никогда — ни здесь, ни в me().
 *      Prisma по умолчанию возвращает ВСЕ поля, поэтому либо select,
 *      либо ручной маппинг. Забыть про это легко, и утечка будет тихой.
 *
 * ── login(input: LoginInput, meta) ───────────────────────────────────────────
 *
 *   1. Найти пользователя по email.
 *   2. Если не найден — всё равно вызвать verify() с заранее заготовленной
 *      строкой-хешем (const DUMMY_HASH = await hash('...') один раз при
 *      старте модуля) и только потом бросить ошибку. Без этого «нет такого
 *      пользователя» отвечает за миллисекунду, а «неверный пароль» — за
 *      сотню, и по времени ответа перебираются существующие адреса.
 *   3. verify() ОБЯЗАТЕЛЬНО в try/catch. На непригодном хеше он не
 *      возвращает false, а бросает — а непригодные хеши в базе есть прямо
 *      сейчас: миграция проставила сидовым пользователям заглушку, которая
 *      хешем argon2 не является. Без catch попытка войти под сидовым
 *      адресом даст 500 вместо 401. Брошенное исключение = «пароль не
 *      подошёл», а не пятисотка.
 *   4. Ошибка одна и та же во всех случаях:
 *      AppError(401, 'INVALID_CREDENTIALS', 'Неверная почта или пароль').
 *      Не «пользователь не найден» и не «неверный пароль» по отдельности.
 *   5. Обнови lastLoginAt — поле уже есть в модели User.
 *   6. Выдать сессию.
 *
 * ── refresh(token: string | null, meta) ──────────────────────────────────────
 *
 * Тот самый метод, который легко написать так, что он «работает», а на деле
 * даёт либо вечную сессию, либо разлогин на каждой второй вкладке.
 * Порядок шагов менять нельзя — каждый следующий опирается на предыдущий.
 *
 *   1. token пустой → AppError(401, 'UNAUTHORIZED', 'Нужен вход').
 *
 *   2. payload = tokens.verifyRefresh(token). Метод сам бросит 401
 *      TOKEN_EXPIRED или TOKEN_INVALID. Подпись проверяем ДО похода в базу:
 *      это отсекает мусор без единого запроса к MySQL.
 *
 *   3. Открыть транзакцию и найти строку по tokens.hash(token) — но НЕ через
 *      findUnique. Нужен блокирующий чтение запрос:
 *
 *        SELECT * FROM `RefreshToken` WHERE `tokenHash` = ? FOR UPDATE
 *
 *      через tx.$queryRaw. Причина в уровне изоляции: у MySQL по умолчанию
 *      REPEATABLE READ, и обычный SELECT внутри транзакции читает снимок,
 *      сделанный на её старте. Вторая вкладка, начавшая транзакцию раньше,
 *      коммита первой попросту не увидит — обе решат, что токен живой, обе
 *      ротируют, и одна из двух сессий тут же умрёт. FOR UPDATE читает
 *      текущее состояние и ждёт на блокировке соседа.
 *
 *      Вся оставшаяся работа — внутри этой же транзакции. Внутрь не должно
 *      попасть ничего медленного: ни argon2, ни походов по сети. Транзакция
 *      держит блокировку строки, и на ней стоит вторая вкладка.
 *
 *      Строки нет → токен подписан нашим ключом, но базе неизвестен.
 *      Это либо очень старая запись, вычищенная уборщиком, либо подделка.
 *      AppError(401, 'TOKEN_INVALID', 'Сессия недействительна').
 *
 *   4. Строка есть, но revokedAt уже стоит — ПЕРЕИСПОЛЬЗОВАНИЕ.
 *      Здесь разветвление, и вот тут чаще всего ошибаются:
 *
 *      а) Окно идемпотентности. Если revokedAt моложе REUSE_WINDOW_MS
 *         (возьми 10 секунд), это не кража. Это вторая вкладка или
 *         React StrictMode, который в разработке монтирует компонент
 *         дважды: оба запроса ушли с одним и тем же старым токеном,
 *         первый успел ротировать. Верни преемника по replacedById —
 *         для этого при ротации и заполняется это поле. Цепочку НЕ гасить.
 *         Если преемник сам уже отозван — иди по ветке (б).
 *
 *      б) Старше окна — настоящее переиспользование. Токен, который мы
 *         давно заменили, кто-то предъявляет снова: значит, копия утекла.
 *         Погасить всю цепочку: updateMany({ where: { familyId, revokedAt: null },
 *         data: { revokedAt: new Date() } }). Бросить
 *         AppError(401, 'TOKEN_REUSED', 'Сессия отозвана, войдите заново').
 *         Залогировать через this.log.warn({ userId, familyId },
 *         'refresh token reuse detected') — это единственное место во всём
 *         модуле, где лог реально понадобится при разборе инцидента.
 *
 *   5. expiresAt в прошлом → AppError(401, 'TOKEN_EXPIRED', ...).
 *      Формально до сюда не дойдёт, потому что шаг 2 уже проверил exp
 *      внутри JWT. Проверка всё равно нужна: exp живёт в токене, а
 *      expiresAt — в базе, и если однажды разойдутся, верить надо базе.
 *
 *   6. Прочитать пользователя по id — это единственный поход в базу за
 *      пользователем на всю схему, и именно он ограничивает «сколько живёт
 *      заблокированная учётка» пятнадцатью минутами. Нет пользователя →
 *      401. isActive === false → погасить цепочку и 403 USER_INACTIVE.
 *
 *   7. Ротация, в той же транзакции:
 *        - создать новую строку (tokens.issueRefresh(userId, СТАРЫЙ familyId));
 *        - пометить старую revokedAt = now() и replacedById = id новой.
 *      Порядок именно такой, и не только потому, что replacedById нельзя
 *      проставить до создания новой строки: если процесс умрёт между двумя
 *      операциями, при таком порядке старый токен останется рабочим, а при
 *      обратном цепочка останется без головы и человек вылетит на форму
 *      входа на ровном месте.
 *
 *   8. Новый access подписывается с АКТУАЛЬНОЙ ролью из базы, а не из
 *      старого токена. Иначе разжалованный админ остаётся админом до конца
 *      срока refresh-а, то есть месяц.
 *
 * ── logout(token: string | null) ─────────────────────────────────────────────
 *
 *   Погасить одну строку по хешу (revokedAt = now()), если она есть.
 *   Метод идемпотентный: нет куки, нет строки, строка уже погашена — всё
 *   это успех, 200 и очистка кук. Кнопка «Выйти» не должна уметь падать.
 *
 *   Строки НЕ удалять, а помечать. Удалённую строку не отличить от
 *   никогда не существовавшей, а на этой разнице стоит весь шаг 4.
 *
 *   Отдельным методом logoutAll(userId) — updateMany по userId. Пригодится
 *   на экране «выйти на всех устройствах» и после смены пароля.
 *
 * ── me(userId: string) ───────────────────────────────────────────────────────
 *
 *   Один findUnique с select по публичным полям. Если пользователя нет
 *   (удалён, а токен ещё живой) — AppError(401, 'UNAUTHORIZED', ...),
 *   а не 404: с точки зрения клиента это «вы не вошли».
 *
 * ── Чистка ───────────────────────────────────────────────────────────────────
 *
 * Просроченные и погашенные строки копятся. Плановый чистильщик — задача
 * M5 по README §14, сейчас отдельный метод deleteExpired() и вызов руками
 * из скрипта достаточно. Удалять можно только то, что старше окна
 * переиспользования с большим запасом (скажем, expiresAt < now - 30 дней),
 * иначе сам же сломаешь детект из шага 4.
 */

import {
  publicUserSelect,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type SessionMeta,
} from "./auth.schema.js";
import { hash, verify } from "@node-rs/argon2";
import { type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error.js";
import { logger } from "../../lib/logger.js";
import type { TokenHelper } from "../../lib/tokens.js";

const DUMMY_HASH = await hash("нет-такого-пользователя");

/** Две вкладки / StrictMode: второй запрос с тем же токеном — не кража. */
const REUSE_WINDOW_MS = 10_000;

type IssuedSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

type LockedRefreshRow = {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  replacedById: string | null;
};

type RefreshOutcome =
  | { kind: "session"; session: IssuedSession; cacheRowId: string }
  | { kind: "replay"; session: IssuedSession }
  | {
      kind: "reject";
      status: number;
      code: string;
      message: string;
      logReuse?: { userId: string; familyId: string };
    };

/**
 * JWT преемника в базе нет (там только sha256), а второй параллельный
 * refresh должен вернуть ту же куку — иначе catch в роуте снесёт сессию.
 * Окно = REUSE_WINDOW_MS, один процесс api.
 */
const recentlyIssued = new Map<
  string,
  { session: IssuedSession; storedAt: number }
>();

function rememberIssued(rowId: string, session: IssuedSession): void {
  const now = Date.now();
  for (const [id, entry] of recentlyIssued) {
    if (now - entry.storedAt > REUSE_WINDOW_MS) recentlyIssued.delete(id);
  }
  recentlyIssued.set(rowId, { session, storedAt: now });
}

function replayIssued(rowId: string): IssuedSession | null {
  const entry = recentlyIssued.get(rowId);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > REUSE_WINDOW_MS) {
    recentlyIssued.delete(rowId);
    return null;
  }
  return entry.session;
}

function asTime(value: Date | string): number {
  return new Date(value).getTime();
}

/** verify, который на непригодном хеше отвечает «не подошёл», а не падает. */
async function safeVerify(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

export class AuthService {
  private readonly log = logger.child({ service: "auth" });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenHelper,
  ) {}

  async login(input: LoginInput, meta: SessionMeta) {
    const { email, password } = input;

    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });

    const isPasswordValid = await safeVerify(
      found?.passwordHash ?? DUMMY_HASH,
      password,
    );

    if (!found || !isPasswordValid) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Неверная почта или пароль",
      );
    }

    const { passwordHash: _passwordHash, ...user } = found;

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (err) {
      this.log.warn({ err, userId: user.id }, "failed to update lastLoginAt");
    }

    return this.issueSession(user, meta);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
    }

    return { user };
  }

  private async insertRefresh(
    db: { refreshToken: PrismaClient["refreshToken"] },
    userId: string,
    meta: SessionMeta,
    familyId?: string,
  ) {
    const issued = this.tokens.issueRefresh(userId, familyId);
    const row = await db.refreshToken.create({
      data: {
        userId,
        tokenHash: issued.tokenHash,
        familyId: issued.familyId,
        expiresAt: issued.expiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    return { issued, rowId: row.id };
  }

  private async issueSession(
    user: PublicUser,
    meta: SessionMeta,
    familyId?: string,
  ) {
    const { issued } = await this.insertRefresh(
      this.prisma,
      user.id,
      meta,
      familyId,
    );

    return {
      user,
      accessToken: this.tokens.signAccess({ sub: user.id, role: user.role }),
      refreshToken: issued.token,
    };
  }

  async register(input: RegisterInput, meta: SessionMeta) {
    const passwordHash = await hash(input.password);

    let user;

    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
        },
        select: publicUserSelect,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        throw new AppError(
          409,
          "EMAIL_TAKEN",
          "Такая почта уже зарегистрирована",
        );
      }
      throw err;
    }

    return this.issueSession(user, meta);
  }

  async refresh(token: string | null, meta: SessionMeta) {
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
    }

    const payload = this.tokens.verifyRefresh(token);
    const tokenHash = this.tokens.hash(token);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRefreshRow[]>`
        SELECT id, userId, familyId, expiresAt, revokedAt, replacedById
        FROM \`RefreshToken\`
        WHERE \`tokenHash\` = ${tokenHash}
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) {
        return {
          kind: "reject",
          status: 401,
          code: "TOKEN_INVALID",
          message: "Сессия недействительна",
        } satisfies RefreshOutcome;
      }

      if (payload.sub !== row.userId || payload.fid !== row.familyId) {
        return {
          kind: "reject",
          status: 401,
          code: "TOKEN_INVALID",
          message: "Сессия недействительна",
        } satisfies RefreshOutcome;
      }

      if (row.revokedAt) {
        const ageMs = Date.now() - asTime(row.revokedAt);
        if (ageMs <= REUSE_WINDOW_MS && row.replacedById) {
          const successor = await tx.refreshToken.findUnique({
            where: { id: row.replacedById },
          });
          if (successor && !successor.revokedAt) {
            const replay = replayIssued(successor.id);
            if (replay) return { kind: "replay", session: replay } as const;
          }
        }

        await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        return {
          kind: "reject",
          status: 401,
          code: "TOKEN_REUSED",
          message: "Сессия отозвана, войдите заново",
          logReuse: { userId: row.userId, familyId: row.familyId },
        } satisfies RefreshOutcome;
      }

      if (asTime(row.expiresAt) < Date.now()) {
        return {
          kind: "reject",
          status: 401,
          code: "TOKEN_EXPIRED",
          message: "Срок действия токена истёк",
        } satisfies RefreshOutcome;
      }

      const found = await tx.user.findUnique({
        where: { id: row.userId },
        select: { ...publicUserSelect, isActive: true },
      });

      if (!found) {
        return {
          kind: "reject",
          status: 401,
          code: "UNAUTHORIZED",
          message: "Нужен вход",
        } satisfies RefreshOutcome;
      }

      if (!found.isActive) {
        await tx.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return {
          kind: "reject",
          status: 403,
          code: "USER_INACTIVE",
          message: "Учётная запись отключена",
        } satisfies RefreshOutcome;
      }

      const { isActive: _isActive, ...user } = found;
      const { issued, rowId } = await this.insertRefresh(
        tx,
        user.id,
        meta,
        row.familyId,
      );

      await tx.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date(), replacedById: rowId },
      });

      const session: IssuedSession = {
        user,
        accessToken: this.tokens.signAccess({
          sub: user.id,
          role: user.role,
        }),
        refreshToken: issued.token,
      };

      // До commit: второй запрос ждёт FOR UPDATE и сразу читает кэш.
      rememberIssued(rowId, session);

      return { kind: "session", session, cacheRowId: rowId } as const;
    });

    if (outcome.kind === "session" || outcome.kind === "replay") {
      return outcome.session;
    }

    if (outcome.logReuse) {
      this.log.warn(outcome.logReuse, "refresh token reuse detected");
    }

    throw new AppError(outcome.status, outcome.code, outcome.message);
  }

  async logout(token: string | null) {
    if (!token) return;

    const tokenHash = this.tokens.hash(token);

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
