import assert from "node:assert/strict";
import { test } from "node:test";
import { videoEditArgs } from "./ffmpeg.js";

test("speed2x uses fixed picture and audio filters", () => {
  const args = videoEditArgs({ preset: "speed2x" }, "in.mp4", "out.mp4", true);
  assert.ok(args.includes("setpts=0.5*PTS"));
  assert.ok(args.includes("atempo=2.0"));
  assert.equal(args.includes("-ss"), false);
});

test("trim prints checked seconds and drops audio when asked", () => {
  const args = videoEditArgs(
    { preset: "trim", startMs: 1500, endMs: 4000 },
    "in.mp4",
    "out.mp4",
    false,
  );
  assert.equal(args[args.indexOf("-ss") + 1], "1.500");
  assert.equal(args[args.indexOf("-to") + 1], "4.000");
  assert.ok(args.includes("-an"));
});

test("mute copies the picture and strips audio", () => {
  const args = videoEditArgs({ preset: "mute" }, "in.mp4", "out.mp4", true);
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-an"));
  assert.equal(args.includes("-vf"), false);
});

test("grayscale and contrast are fixed filters", () => {
  const gray = videoEditArgs({ preset: "grayscale" }, "a", "b", true);
  const contrast = videoEditArgs({ preset: "contrast" }, "a", "b", false);
  assert.ok(gray.includes("hue=s=0"));
  assert.ok(contrast.includes("eq=contrast=1.3:brightness=0.02"));
});
