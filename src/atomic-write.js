import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

export async function syncDirectory(directory) {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// A successful return means both the file and its directory entry were synced.
export async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
    await syncDirectory(path.dirname(filePath));
  } finally {
    try {
      if (handle) await handle.close();
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}
