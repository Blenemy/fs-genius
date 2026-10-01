import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, splitTelegramText } from "./html.js";

test("escapeHtml: three characters", () => {
  assert.equal(escapeHtml("a <b> & c"), "a &lt;b&gt; &amp; c");
});

test("splitTelegramText: prefers newline before hard cut", () => {
  const text = `${"a".repeat(20)}\n${"b".repeat(20)}`;
  const parts = splitTelegramText(text, 25);
  assert.equal(parts.length, 2);
  assert.equal(parts[0], "a".repeat(20));
  assert.equal(parts[1], "b".repeat(20));
});

test("splitTelegramText: short text stays one chunk", () => {
  assert.deepEqual(splitTelegramText("ok"), ["ok"]);
});
