import assert from "node:assert/strict";
import { test } from "node:test";
import { storageEndpointReachableFromTelegram } from "./storage-links.js";

test("localhost MinIO is not a Telegram download URL", () => {
  assert.equal(
    storageEndpointReachableFromTelegram("http://localhost:9000"),
    false,
  );
});

test("https public S3 is reachable", () => {
  assert.equal(
    storageEndpointReachableFromTelegram("https://s3.eu-central-1.amazonaws.com"),
    true,
  );
});

test("https LAN is not reachable from Telegram", () => {
  assert.equal(
    storageEndpointReachableFromTelegram("https://192.168.1.10:9000"),
    false,
  );
});
