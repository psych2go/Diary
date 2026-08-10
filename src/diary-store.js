import fs from "node:fs/promises";
import path from "node:path";

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

export async function appendEntry(root, { date, time, text }) {
  if (!validateDate(date) || !validateTime(time)) {
    throw new Error("Invalid diary timestamp");
  }

  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) {
    throw new Error("Diary entry is empty");
  }

  const filePath = pathForDate(root, date);
  const previousWrite = writeQueues.get(filePath) || Promise.resolve();
  const currentWrite = previousWrite.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const prefix = existing.trimEnd() || `# ${date}`;
    const nextContent = `${prefix}\n\n## ${time}\n\n${cleanText}\n`;
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    await fs.writeFile(temporaryPath, nextContent, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  });

  writeQueues.set(filePath, currentWrite);

  try {
    await currentWrite;
    return { date, time };
  } finally {
    if (writeQueues.get(filePath) === currentWrite) {
      writeQueues.delete(filePath);
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
  const rootEntries = await fs.readdir(root, { withFileTypes: true });
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
        dates.push(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`);
      }
    }
  }

  return dates.sort().reverse().slice(0, limit);
}
