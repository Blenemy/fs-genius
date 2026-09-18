import {
  publicUserSelect,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type SessionMeta,
} from "./auth.schema.js";
import { hash, verify } from "@node-rs/argon2";
import { type PrismaClient } from "../../generated/prisma/client.js";
import { isUniqueViolation } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { logger } from "../../lib/logger.js";
import type { TokenHelper } from "../../lib/tokens.js";

const DUMMY_HASH = await hash("нет-такого-пользователя");

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

/**
 * Исход попытки обновления. Отказ ВОЗВРАЩАЕТСЯ данными, а не бросается.
 *
 * Ветки TOKEN_REUSED и USER_INACTIVE перед отказом гасят цепочку, а
 * prisma.$transaction откатывает колбэк на любом исключении: брошенный
 * внутри AppError отменил бы и гашение. Снаружи выглядело бы правильно —
 * клиент получает 401 — но украденная цепочка осталась бы рабочей.
 * Поэтому решение принимается внутри транзакции, а бросается после коммита.
 *
 * По той же причине каждое гашение обязано быть с await: PrismaPromise
 * ленивый, без await запрос не уходит вовсе, а транзакция коммитится.
 */
type RefreshOutcome =
  | { kind: "session"; session: IssuedSession }
  | { kind: "replay"; session: IssuedSession }
  | {
      kind: "reject";
      status: number;
      code: string;
      message: string;
      logReuse?: { userId: string; familyId: string };
    };

type RejectOutcome = Extract<RefreshOutcome, { kind: "reject" }>;

function reject(
  status: number,
  code: string,
  message: string,
  logReuse?: RejectOutcome["logReuse"],
): RejectOutcome {
  // Спред, а не logReuse: undefined — форма переживёт exactOptionalPropertyTypes.
  return {
    kind: "reject",
    status,
    code,
    message,
    ...(logReuse && { logReuse }),
  };
}

/** Структурный тип: подходит и prisma, и tx внутри $transaction. */
type RefreshDb = { refreshToken: PrismaClient["refreshToken"] };

/**
 * Гасит ВСЮ цепочку ротаций, а не одну строку.
 *
 * async с внутренним await намеренно: возвращается настоящий Promise, а не
 * ленивый PrismaPromise. Забытый await у вызова тогда хотя бы отправит
 * запрос и громко упадёт на закрытой транзакции, а не промолчит.
 */
async function revokeFamily(
  tx: RefreshDb,
  row: LockedRefreshRow,
): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

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
    db: RefreshDb,
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
      if (isUniqueViolation(err)) {
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

  /**
   * Строка уже отозвана. Два разных случая:
   *
   * а) revokedAt моложе REUSE_WINDOW_MS — это не кража, а вторая вкладка или
   *    StrictMode: оба запроса ушли с одним токеном, первый успел ротировать.
   *    Отдаём преемника по replacedById, цепочку НЕ гасим.
   * б) старше окна — настоящее переиспользование: копия токена утекла.
   *    Гасим всю цепочку.
   *
   * Не бросает, только возвращает: см. комментарий к RefreshOutcome.
   * revokedAt отдельным аргументом, чтобы сужение типа с места вызова
   * не потерялось и не пришлось писать row.revokedAt!.
   */
  private async resolveRevoked(
    tx: RefreshDb,
    row: LockedRefreshRow,
    revokedAt: Date | string,
  ): Promise<RefreshOutcome> {
    const ageMs = Date.now() - asTime(revokedAt);

    if (ageMs <= REUSE_WINDOW_MS && row.replacedById) {
      const successor = await tx.refreshToken.findUnique({
        where: { id: row.replacedById },
      });

      if (successor && !successor.revokedAt) {
        const replay = replayIssued(successor.id);
        if (replay) return { kind: "replay", session: replay };
      }
    }

    await revokeFamily(tx, row);

    return reject(401, "TOKEN_REUSED", "Сессия отозвана, войдите заново", {
      userId: row.userId,
      familyId: row.familyId,
    });
  }

  /**
   * Ротация: создать новую строку, старую пометить преемником.
   *
   * Порядок менять нельзя, и дело не только в том, что replacedById нечем
   * заполнить до создания новой строки. Если процесс умрёт между двумя
   * запросами, при таком порядке старый токен останется рабочим; при
   * обратном цепочка останется без головы и человека выбросит на вход.
   *
   * Access подписывается АКТУАЛЬНОЙ ролью из базы, а не из старого токена:
   * иначе разжалованный админ останется админом до конца срока refresh-а.
   */
  private async rotate(
    tx: RefreshDb,
    row: LockedRefreshRow,
    user: PublicUser,
    meta: SessionMeta,
  ): Promise<IssuedSession> {
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
      accessToken: this.tokens.signAccess({ sub: user.id, role: user.role }),
      refreshToken: issued.token,
    };

    // До commit: второй запрос стоит на FOR UPDATE и сразу читает кэш.
    rememberIssued(rowId, session);

    return session;
  }

  async refresh(token: string | null, meta: SessionMeta) {
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Нужен вход");
    }

    // Подпись проверяется ДО похода в базу: отсекает мусор без запроса к MySQL.
    const payload = this.tokens.verifyRefresh(token);
    const tokenHash = this.tokens.hash(token);

    const outcome = await this.prisma.$transaction(async (tx) => {
      /**
       * FOR UPDATE, а не findUnique: у MySQL по умолчанию REPEATABLE READ,
       * и обычный SELECT внутри транзакции читает снимок на её старте.
       * Вторая вкладка, начавшая транзакцию раньше, коммита первой не увидит —
       * обе решат, что токен живой, обе ротируют, одна из сессий тут же умрёт.
       * FOR UPDATE читает текущее состояние и ждёт на блокировке соседа.
       *
       * Поэтому внутрь транзакции не должно попадать ничего медленного:
       * ни argon2, ни походов по сети — на блокировке стоит вторая вкладка.
       */
      const rows = await tx.$queryRaw<LockedRefreshRow[]>`
        SELECT id, userId, familyId, expiresAt, revokedAt, replacedById
        FROM \`RefreshToken\`
        WHERE \`tokenHash\` = ${tokenHash}
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) {
        return reject(401, "TOKEN_INVALID", "Сессия недействительна");
      }

      if (payload.sub !== row.userId || payload.fid !== row.familyId) {
        return reject(401, "TOKEN_INVALID", "Сессия недействительна");
      }

      if (row.revokedAt) {
        return this.resolveRevoked(tx, row, row.revokedAt);
      }

      /**
       * exp живёт в токене, expiresAt — в базе. Формально сюда не дойти:
       * verifyRefresh уже проверил exp. Если однажды разойдутся — верим базе.
       */
      if (asTime(row.expiresAt) < Date.now()) {
        return reject(401, "TOKEN_EXPIRED", "Срок действия токена истёк");
      }

      const found = await tx.user.findUnique({
        where: { id: row.userId },
        select: { ...publicUserSelect, isActive: true },
      });

      if (!found) {
        return reject(401, "UNAUTHORIZED", "Нужен вход");
      }

      if (!found.isActive) {
        await revokeFamily(tx, row);

        return reject(403, "USER_INACTIVE", "Учётная запись отключена");
      }

      const { isActive: _isActive, ...user } = found;
      const session = await this.rotate(tx, row, user, meta);

      return { kind: "session", session } as const;
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
