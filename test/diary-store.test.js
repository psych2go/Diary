import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEntry, listEntries, readEntry, validateDate, validateTime } from "../src/diary-store.js";

test("validates real dates and times", () => {
  assert.equal(validateDate("2026-08-09"), true);
  assert.equal(validateDate("2026-02-30"), false);
  assert.equal(validateDate("../../secret"), false);
  assert.equal(validateTime("23:59"), true);
  assert.equal(validateTime("24:00"), false);
});

test("creates and appends Markdown entries without rewriting text", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  await appendEntry(root, {
    date: "2026-08-09",
    time: "09:30",
    text: "第一段，保持原样。"
  });
  await appendEntry(root, {
    date: "2026-08-09",
    time: "10:05",
    text: "第二段\n有两行。"
  });

  const { content } = await readEntry(root, "2026-08-09");
  assert.equal(
    content,
    "# 2026-08-09\n\n## 09:30\n\n第一段，保持原样。\n\n## 10:05\n\n第二段\n有两行。\n"
  );
  assert.deepEqual(await listEntries(root), ["2026-08-09"]);
});

test("serializes concurrent writes to the same day", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  await Promise.all([
    appendEntry(root, { date: "2026-08-09", time: "10:10", text: "第一条" }),
    appendEntry(root, { date: "2026-08-09", time: "10:11", text: "第二条" })
  ]);

  const { content } = await readEntry(root, "2026-08-09");
  assert.match(content, /第一条/);
  assert.match(content, /第二条/);
});
