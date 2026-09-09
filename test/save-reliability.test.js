import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import { appendEntry, readEntry, listEntries } from "../src/diary-store.js";
import { atomicWrite } from "../src/atomic-write.js";

async function temporaryRoot(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diary-reliability-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("concurrent retries and next-day retries append once, including with fresh module state", async (context) => {
  const root = await temporaryRoot(context);
  const entry = { date: "2026-08-09", time: "23:59", text: "只记下一次", requestId: crypto.randomUUID() };
  const results = await Promise.all(Array.from({ length: 5 }, () => appendEntry(root, entry)));
  for (const result of results) assert.deepEqual(result, { date: entry.date, time: entry.time });
  const freshStore = await import(`../src/diary-store.js?fresh=${crypto.randomUUID()}`);
  assert.deepEqual(await freshStore.appendEntry(root, { ...entry, date: "2026-08-10", time: "00:01" }), results[0]);
  assert.deepEqual(await listEntries(root), [entry.date]);
  const { content } = await readEntry(root, entry.date);
  assert.equal(content.split(entry.text).length - 1, 1);
  await assert.rejects(appendEntry(root, { ...entry, text: "不同内容" }), /request ID reuse/);
  assert.equal((await readEntry(root, entry.date)).content, content);
  assert.equal((await fs.stat(path.join(root, "2026", "20260809.md"))).mode & 0o777, 0o600);
});

test("request IDs are validated and separate IDs allow intentionally repeated text", async (context) => {
  const root = await temporaryRoot(context);
  const entry = { date: "2026-08-09", time: "12:00", text: "相同内容" };
  for (const requestId of [null, "", "../bad", 123, {}]) {
    await assert.rejects(appendEntry(root, { ...entry, requestId }), /Invalid diary request ID/);
  }
  assert.deepEqual(await fs.readdir(root), []);
  await appendEntry(root, { ...entry, requestId: crypto.randomUUID() });
  await appendEntry(root, { ...entry, requestId: crypto.randomUUID() });
  assert.equal((await readEntry(root, entry.date)).content.split(entry.text).length - 1, 2);
});

test("atomic writes replace files privately and remove temporary files when rename fails", async (context) => {
  const root = await temporaryRoot(context);
  const file = path.join(root, "entry.md");
  await atomicWrite(file, "original");
  await atomicWrite(file, "updated");
  assert.equal(await fs.readFile(file, "utf8"), "updated");
  const directory = path.join(root, "directory");
  await fs.mkdir(directory);
  await assert.rejects(atomicWrite(directory, "cannot replace a directory"));
  assert.deepEqual((await fs.readdir(root)).sort(), ["directory", "entry.md"]);
});
