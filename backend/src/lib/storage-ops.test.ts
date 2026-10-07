import assert from "node:assert/strict";
import { test } from "node:test";
import { writeOpsKey } from "./storage-ops.js";

test("writeOpsKey: one counter per UTC month", () => {
  assert.equal(
    writeOpsKey(new Date("2026-10-07T12:00:00Z")),
    "s3ops:write:2026-10",
  );
  assert.equal(
    writeOpsKey(new Date("2026-01-31T23:59:59Z")),
    "s3ops:write:2026-01",
  );
});

test("writeOpsKey: month rolls over at UTC midnight, not local", () => {
  assert.equal(
    writeOpsKey(new Date("2026-10-31T23:30:00-03:00")),
    "s3ops:write:2026-11",
  );
});
