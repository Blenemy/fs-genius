import assert from "node:assert/strict";
import { test } from "node:test";
import {
  editReserveBytes,
  normalizeEdit,
  videoExportFrame,
} from "./edits.js";

test("normalizeEdit: image preset stays on image", () => {
  const result = normalizeEdit("IMAGE", { preset: "grayscale" }, null);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.edit, { kind: "image", preset: "grayscale" });
});

test("normalizeEdit: video preset rejected for image", () => {
  const result = normalizeEdit("IMAGE", { preset: "speed2x" }, null);
  assert.equal(result.ok, false);
});

test("normalizeEdit: trim needs a range inside the clip", () => {
  const missing = normalizeEdit("VIDEO", { preset: "trim" }, 10_000);
  assert.equal(missing.ok, false);

  const short = normalizeEdit(
    "VIDEO",
    { preset: "trim", startMs: 0, endMs: 200 },
    10_000,
  );
  assert.equal(short.ok, false);

  const past = normalizeEdit(
    "VIDEO",
    { preset: "trim", startMs: 0, endMs: 12_000 },
    10_000,
  );
  assert.equal(past.ok, false);

  const ok = normalizeEdit(
    "VIDEO",
    { preset: "trim", startMs: 1_000, endMs: 4_000 },
    10_000,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.edit.kind, "video");
    if (ok.edit.kind === "video" && ok.edit.preset === "trim") {
      assert.equal(ok.edit.startMs, 1_000);
      assert.equal(ok.edit.endMs, 4_000);
    }
  }
});

test("normalizeEdit: timecode only on trim", () => {
  const result = normalizeEdit(
    "VIDEO",
    { preset: "mute", startMs: 0, endMs: 1000 },
    10_000,
  );
  assert.equal(result.ok, false);
});

test("editReserveBytes: same key credits the previous export", () => {
  const reserve = editReserveBytes(
    2_000n,
    { sizeBytes: 1_500n, storageKey: "a/export.mp4" },
    "a/export.mp4",
  );
  assert.equal(reserve, 500n);
});

test("editReserveBytes: a different key reserves the whole source", () => {
  const reserve = editReserveBytes(
    2_000n,
    { sizeBytes: 1_500n, storageKey: "a/export.webp" },
    "a/export.jpg",
  );
  assert.equal(reserve, 2_000n);
});

test("videoExportFrame: square and compress stay even and bounded", () => {
  assert.deepEqual(videoExportFrame("square", 1920, 1080), {
    width: 720,
    height: 720,
  });
  assert.deepEqual(videoExportFrame("compress", 1920, 1080), {
    width: 852,
    height: 480,
  });
});
