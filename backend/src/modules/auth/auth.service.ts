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
