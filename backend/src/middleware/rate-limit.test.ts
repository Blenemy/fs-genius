import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error.js";
import { createIpRateLimit, createUserRateLimit } from "./rate-limit.js";

function hit(
  limiter: ReturnType<typeof createIpRateLimit>,
  init: { ip: string; userId?: string },
): Promise<AppError | null> {
  const req = {
    ip: init.ip,
    user: init.userId ? { id: init.userId, role: "USER" as const } : undefined,
    headers: {},
    method: "POST",
    originalUrl: "/x",
    url: "/x",
    path: "/x",
  } as Request;

  const res = {
    headersSent: false,
    setHeader() {
      return this;
    },
    append() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    once() {
      return this;
    },
  } as unknown as Response;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err == null) resolve(null);
      else if (err instanceof AppError) resolve(err);
      else reject(err instanceof Error ? err : new Error(String(err)));
    };

    const pending = limiter(req, res, finish as NextFunction);
    if (pending && typeof (pending as Promise<void>).then === "function") {
      void (pending as Promise<void>).then(
        () => finish(),
        (err: unknown) => finish(err),
      );
    }
  });
}

test("ip limiter blocks the third hit and leaves another address alone", async () => {
  const limiter = createIpRateLimit(2, 60_000, "slow");
  assert.equal(await hit(limiter, { ip: "203.0.113.5" }), null);
  assert.equal(await hit(limiter, { ip: "203.0.113.5" }), null);
  const blocked = await hit(limiter, { ip: "203.0.113.5" });
  assert.ok(blocked);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.code, "RATE_LIMITED");
  assert.equal(blocked.message, "slow");
  assert.equal(await hit(limiter, { ip: "203.0.113.9" }), null);
});

test("presign limiter counts per user, not per shared address", async () => {
  const limiter = createUserRateLimit(1, 60_000, "slow");
  assert.equal(
    await hit(limiter, { ip: "198.51.100.2", userId: "user-a" }),
    null,
  );
  const blocked = await hit(limiter, {
    ip: "198.51.100.8",
    userId: "user-a",
  });
  assert.equal(blocked?.code, "RATE_LIMITED");
  assert.equal(
    await hit(limiter, { ip: "198.51.100.2", userId: "user-b" }),
    null,
  );
});
