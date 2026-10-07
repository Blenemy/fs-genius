import assert from "node:assert/strict";
import { test } from "node:test";
import { detectMime, matchClaimedType } from "./signature.js";

test("text claimed as mp4 does not match", async () => {
  const detected = await detectMime(Buffer.from("not a video, just text\n"));
  assert.equal(detected, null);
  assert.deepEqual(matchClaimedType("video/mp4", detected), { ok: false });
});

test("jpeg magic matches an image claim and rejects a video claim", async () => {
  const detected = await detectMime(
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  );
  assert.equal(detected, "image/jpeg");
  assert.deepEqual(matchClaimedType("image/jpeg", detected), {
    ok: true,
    contentType: "image/jpeg",
  });
  assert.deepEqual(matchClaimedType("video/mp4", detected), { ok: false });
});

test("mp4 ftyp matches video and replaces a quicktime claim", async () => {
  const mp4 = Buffer.alloc(32);
  mp4.writeUInt32BE(24, 0);
  mp4.write("ftyp", 4);
  mp4.write("mp42", 8);
  const detected = await detectMime(mp4);
  assert.equal(detected, "video/mp4");
  assert.deepEqual(matchClaimedType("video/quicktime", detected), {
    ok: true,
    contentType: "video/mp4",
  });
});

test("png claimed as jpeg stays an image and takes the detected type", () => {
  assert.deepEqual(matchClaimedType("image/jpeg", "image/png"), {
    ok: true,
    contentType: "image/png",
  });
});

test("heic is rejected even when claimed as jpeg", () => {
  assert.deepEqual(matchClaimedType("image/jpeg", "image/heic"), { ok: false });
});
