import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTelegramForbidden,
  telegramRetryAfterSec,
} from "./errors.js";

test("telegramRetryAfterSec: uses retry_after from 429", () => {
  assert.equal(
    telegramRetryAfterSec({
      error_code: 429,
      parameters: { retry_after: 12 },
    }),
    12,
  );
});

test("telegramRetryAfterSec: ignores other codes", () => {
  assert.equal(telegramRetryAfterSec({ error_code: 400 }), undefined);
});

test("isTelegramForbidden: 403", () => {
  assert.equal(isTelegramForbidden({ error_code: 403 }), true);
});

test("isTelegramForbidden: blocked description", () => {
  assert.equal(
    isTelegramForbidden({
      error_code: 400,
      description: "Forbidden: bot was blocked by the user",
    }),
    true,
  );
});

test("isTelegramForbidden: network blip is not final", () => {
  assert.equal(isTelegramForbidden(new Error("fetch failed")), false);
});
