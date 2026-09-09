import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWrite, syncDirectory } from "./atomic-write.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FILE_PATTERN = /^\d{8}\.md$/;
const writeQueues = new Map();

export function validateDate(date) {
  const match = DATE_PATTERN.exec(date);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

export function validateTime(time) {
  return TIME_PATTERN.test(time);
}

function pathForDate(root, date) {
  if (!validateDate(date)) {
    throw new Error("Invalid diary date");
  }

  const compactDate = date.replaceAll("-", "");
  return path.join(root, date.slice(0, 4), `${compactDate}.md`);
}

export async function appendEntry(root, { date, time, text, requestId }) {
  root = path.resolve(root);
  if (requestId !== undefined &&
      (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))) {
    throw new Error("Invalid diary request ID");
  }
  if (!validateDate(date) || !validateTime(time)) {
    throw new Error("Invalid diary timestamp");
  }

  if (typeof text !== "string") {
    throw new Error("Invalid diary text");
  }

  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) {
    throw new Error("Diary entry is empty");
  }

  const filePath = pathForDate(root, date);
  const digest = crypto.createHash("sha256").update(cleanText).digest("hex");
  // Serialize all dates so a retry spanning midnight cannot append twice.
  const previousWrite = writeQueues.get(root) || Promise.resolve();
  const currentWrite = previousWrite.catch(() => {}).then(async () => {
    if (requestId) {
      for (const recordedDate of await listEntries(root, Infinity)) {
        const { content } = await readEntry(root, recordedDate);
        const match = content.match(new RegExp(`^<!-- diary-entry:${requestId}:([a-f0-9]{64}):([0-9:]{5}) -->$`, "m"));
        if (match) {
          if (match[1] !== digest) throw new Error("Invalid diary request ID reuse");
          await syncDirectory(path.dirname(pathForDate(root, recordedDate)));
          return { date: recordedDate, time: match[2] };
        }
      }
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await syncDirectory(root);

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const prefix = existing.trimEnd() || `# ${date}`;
    const marker = requestId ? `\n<!-- diary-entry:${requestId}:${digest}:${time} -->\n` : "";
    const nextContent = `${prefix}\n\n## ${time}\n\n${cleanText}\n${marker}`;
    await atomicWrite(filePath, nextContent);
    return { date, time };
  });

  writeQueues.set(root, currentWrite);

  try {
    return await currentWrite;
  } finally {
    if (writeQueues.get(root) === currentWrite) {
      writeQueues.delete(root);
    }
  }
}

export async function readEntry(root, date) {
  const filePath = pathForDate(root, date);

  try {
    const content = await fs.readFile(filePath, "utf8");
    return { date, content };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { date, content: "" };
    }
    throw error;
  }
}

export async function listEntries(root, limit = 60) {
  let rootEntries;
  try {
    rootEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const years = rootEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const dates = [];

  for (const year of years) {
    const files = await fs.readdir(path.join(root, year), { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && FILE_PATTERN.test(file.name)) {
        const compact = file.name.slice(0, 8);
        const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
        if (compact.startsWith(year) && validateDate(date)) {
          dates.push(date);
        }
      }
    }
  }

  return dates.sort().reverse().slice(0, limit);
}
