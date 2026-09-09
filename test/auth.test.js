import assert from "node:assert/strict";
import test from "node:test";
import {
  createPasswordHash,
  createPasswordVerifier,
  createSession,
  clearLegacySessionCookie,
  clearSessionCookie,
  isPasswordHash,
  passwordMatches,
  readCookie,
  verifySession
} from "../src/auth.js";

test("creates expiring signed sessions", () => {
  const now = Date.now();
  const token = createSession("test-secret", now);

  assert.equal(verifySession(token, "test-secret", now + 1000), true);
  assert.equal(verifySession(token, "wrong-secret", now + 1000), false);
  assert.equal(verifySession(`${token}x`, "test-secret", now + 1000), false);
  assert.equal(verifySession(token, "test-secret", now + 31 * 24 * 60 * 60 * 1000), false);
});

test("compares passwords and reads cookies", () => {
  assert.equal(passwordMatches("same", "same"), true);
  assert.equal(passwordMatches("wrong", "same"), false);
  assert.equal(readCookie("first=1; diary_session=abc.def; last=2", "diary_session"), "abc.def");
});

test("stores production passwords as salted scrypt hashes", () => {
  const hash = createPasswordHash("correct horse battery staple", Buffer.alloc(16, 7));

  assert.match(hash, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(isPasswordHash(hash), true);
  assert.equal(isPasswordHash("run-npm-run-password-hash"), false);
  assert.equal(passwordMatches("correct horse battery staple", hash), true);
  assert.equal(passwordMatches("wrong password", hash), false);
  assert.equal(passwordMatches("correct horse battery staple", "scrypt$broken"), false);
});

test("async password verification is bounded and releases slots after success and failure", async () => {
  const verify = createPasswordVerifier({ maxConcurrent: 1 });
  const hash = createPasswordHash("correct-password");
  const pending = verify("correct-password", hash);
  await assert.rejects(verify("another", hash), { code: "AUTH_BUSY" });
  assert.equal(await pending, true);
  assert.equal(await verify("wrong", hash), false);
  await assert.rejects(verify({}, hash));
  assert.equal(await verify("correct-password", hash), true);
  assert.equal(await verify("plain", "plain"), true);
});

test("uses host-prefixed cookies in production and clears legacy cookies", () => {
  assert.match(
    clearSessionCookie(true),
    /^__Host-diary_session=.*; Secure$/
  );
  assert.match(
    clearLegacySessionCookie(true),
    /^diary_session=.*; Secure$/
  );
});
