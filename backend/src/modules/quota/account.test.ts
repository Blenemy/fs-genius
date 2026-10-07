import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeVideoCount,
  countsOriginalObject,
  exceedsQuota,
  usedBytesOf,
} from "./account.js";
import { formatQuotaBytes, GLOBAL_QUOTA_BYTES } from "./limits.js";

test("usedBytes: pending reserves declared size", () => {
  const used = usedBytesOf([
    {
      id: "p",
      sizeBytes: 100n,
      status: "PENDING",
      kind: null,
      contentType: "video/mp4",
      derivatives: [{ sizeBytes: 999n }],
    },
  ]);
  assert.equal(used, 100n);
});

test("usedBytes: ready video counts derivatives only", () => {
  const used = usedBytesOf([
    {
      id: "v",
      sizeBytes: 1_000n,
      status: "READY",
      kind: "VIDEO",
      contentType: "video/mp4",
      derivatives: [{ sizeBytes: 200n }, { sizeBytes: 50n }],
    },
  ]);
  assert.equal(used, 250n);
});

test("usedBytes: ready image counts original plus variants", () => {
  const used = usedBytesOf([
    {
      id: "i",
      sizeBytes: 80n,
      status: "READY",
      kind: "IMAGE",
      contentType: "image/jpeg",
      derivatives: [{ sizeBytes: 20n }],
    },
  ]);
  assert.equal(used, 100n);
});

test("usedBytes: failed video still counts original", () => {
  const used = usedBytesOf([
    {
      id: "f",
      sizeBytes: 400n,
      status: "FAILED",
      kind: "VIDEO",
      contentType: "video/mp4",
      derivatives: [{ sizeBytes: 10n }],
    },
  ]);
  assert.equal(used, 410n);
});

test("countsOriginalObject: processing video still on disk", () => {
  assert.equal(countsOriginalObject("PROCESSING", "VIDEO"), true);
  assert.equal(countsOriginalObject("READY", "VIDEO"), false);
});

test("usedBytes: processing video with 720p skips the deleted original", () => {
  const used = usedBytesOf([
    {
      id: "e",
      sizeBytes: 50_000n,
      status: "PROCESSING",
      kind: "VIDEO",
      contentType: "video/mp4",
      derivatives: [
        { sizeBytes: 2_000n, kind: "VIDEO_720P" },
        { sizeBytes: 100n, kind: "POSTER" },
      ],
    },
  ]);
  assert.equal(used, 2_100n);
});

test("activeVideoCount: one processing video", () => {
  const n = activeVideoCount([
    {
      id: "a",
      sizeBytes: 1n,
      status: "PROCESSING",
      kind: null,
      contentType: "video/mp4",
      derivatives: [],
    },
    {
      id: "b",
      sizeBytes: 1n,
      status: "PROCESSING",
      kind: "IMAGE",
      contentType: "image/jpeg",
      derivatives: [],
    },
  ]);
  assert.equal(n, 1);
});

test("activeVideoCount: restart excludes self", () => {
  const n = activeVideoCount(
    [
      {
        id: "a",
        sizeBytes: 1n,
        status: "PROCESSING",
        kind: "VIDEO",
        contentType: "video/mp4",
        derivatives: [],
      },
    ],
    "a",
  );
  assert.equal(n, 0);
});

test("activeVideoCount: uploaded video occupies slot", () => {
  const n = activeVideoCount([
    {
      id: "u",
      sizeBytes: 1n,
      status: "UPLOADED",
      kind: "VIDEO",
      contentType: "video/mp4",
      derivatives: [],
    },
  ]);
  assert.equal(n, 1);
});

test("formatQuotaBytes: 500 MB", () => {
  assert.equal(formatQuotaBytes(500 * 1024 * 1024), "500 МБ");
});

test("formatQuotaBytes: 7 GB shared cap", () => {
  assert.equal(formatQuotaBytes(GLOBAL_QUOTA_BYTES), "7 ГБ");
});

test("exceedsQuota: shared cap blocks the byte past 7 GB", () => {
  const cap = BigInt(GLOBAL_QUOTA_BYTES);
  assert.equal(exceedsQuota(cap - 1n, 1n, cap), false);
  assert.equal(exceedsQuota(cap, 1n, cap), true);
});
