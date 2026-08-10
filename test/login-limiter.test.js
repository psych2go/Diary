import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  LoginLimiter,
  loginClientKey
} from "../src/login-limiter.js";

test("failed logins are limited per client instead of globally", () => {
  const limiter = new LoginLimiter({ maximumFailures: 2, windowMs: 1_000 });

  limiter.recordFailure("198.51.100.10", 0);
  limiter.recordFailure("198.51.100.10", 1);

  assert.equal(limiter.canAttempt("198.51.100.10", 2), false);
  assert.equal(limiter.canAttempt("198.51.100.11", 2), true);

  limiter.clear("198.51.100.10");
  assert.equal(limiter.canAttempt("198.51.100.10", 2), true);
});

test("expired login failures are removed", () => {
  const limiter = new LoginLimiter({ maximumFailures: 1, windowMs: 1_000 });
  limiter.recordFailure("198.51.100.10", 0);

  assert.equal(limiter.canAttempt("198.51.100.10", 999), false);
  assert.equal(limiter.canAttempt("198.51.100.10", 1_000), true);
});

test("proxy client headers are trusted only when explicitly enabled", () => {
  assert.equal(
    loginClientKey({
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-real-ip": "198.51.100.20" }
    }, { trustProxy: true }),
    "198.51.100.20"
  );
  assert.equal(
    loginClientKey({
      socket: { remoteAddress: "203.0.113.5" },
      headers: { "x-real-ip": "198.51.100.20" }
    }),
    "203.0.113.5"
  );
  assert.equal(
    loginClientKey({
      socket: { remoteAddress: "172.18.0.1" },
      headers: { "x-forwarded-for": "192.0.2.1, 198.51.100.21" }
    }, { trustProxy: true }),
    "198.51.100.21"
  );
});

test("development script does not embed a default password", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const packageJson = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8")
  );

  assert.doesNotMatch(packageJson.scripts.dev, /DIARY_PASSWORD=/);
});
