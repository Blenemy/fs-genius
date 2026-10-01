import assert from "node:assert/strict";
import { test } from "node:test";
import { isTelegramImageKind, pickTelegramImage } from "./message.js";

test("pickTelegramImage: video stills, never mp4", () => {
  const picked = pickTelegramImage([
    { kind: "VIDEO_720P" as const, id: "v" },
    { kind: "AUDIO_MP3" as const, id: "a" },
    { kind: "POSTER" as const, id: "p" },
    { kind: "THUMBNAIL" as const, id: "t" },
  ]);
  assert.equal(picked?.id, "p");
});

test("pickTelegramImage: prefers preview over thumb", () => {
  const picked = pickTelegramImage([
    { kind: "THUMBNAIL" as const, id: "t" },
    { kind: "PREVIEW" as const, id: "pr" },
  ]);
  assert.equal(picked?.id, "pr");
});

test("isTelegramImageKind: video file is out", () => {
  assert.equal(isTelegramImageKind("VIDEO_720P"), false);
  assert.equal(isTelegramImageKind("POSTER"), true);
});
