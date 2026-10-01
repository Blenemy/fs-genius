import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBotCommand } from "./command.js";

test("parseBotCommand: /start with token", () => {
  assert.deepEqual(parseBotCommand("/start abc-token"), {
    command: "start",
    arg: "abc-token",
  });
});

test("parseBotCommand: /status@BotName", () => {
  assert.deepEqual(parseBotCommand("/status@fs_genius_bot"), {
    command: "status",
    arg: "",
  });
});

test("parseBotCommand: ignores plain text", () => {
  assert.equal(parseBotCommand("hello"), null);
});
