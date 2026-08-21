#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function cleanSegment(value, fallback) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

export function prepareUpload(input, providedAlt, environment = process.env) {
  if (!input) {
    throw new Error("Usage: npm run image:upload -- <image-path> [alt text]");
  }

  const filePath = path.resolve(input);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new Error(`Image does not exist: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Image path is not a file: ${filePath}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension);
  if (!contentType) {
    throw new Error(`Unsupported image type: ${extension || "<none>"}`);
  }

  const date = environment.R2_IMAGE_DATE || currentDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("R2_IMAGE_DATE must use YYYY-MM-DD format");
  }

  const bucket = environment.R2_IMAGE_BUCKET || "zhuying-blog-images";
  const baseUrl = (environment.R2_IMAGE_BASE_URL || "https://image.zhuying.fun").replace(
    /\/+$/,
    ""
  );
  const prefix = (environment.R2_IMAGE_PREFIX || "images").replace(/^\/+|\/+$/g, "");
  const originalStem = path.basename(filePath, extension);
  const stem = cleanSegment(originalStem, "image");
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")
    .slice(0, 12);
  const [year, month] = date.split("-");
  const key = [prefix, year, month, `${stem}-${hash}${extension}`]
    .filter(Boolean)
    .join("/");
  const url = `${baseUrl}/${key}`;
  const alt = (providedAlt || originalStem).replaceAll("\\", "\\\\").replaceAll("]", "\\]");

  return {
    bucket,
    key,
    url,
    markdown: `![${alt}](${url})`,
    wranglerArguments: [
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      filePath,
      "--content-type",
      contentType,
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--remote"
    ]
  };
}

function main() {
  let upload;
  try {
    upload = prepareUpload(...process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  const wrangler = process.env.WRANGLER_BIN || "wrangler";
  const result = spawnSync(wrangler, upload.wranglerArguments, {
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH:
        process.env.WRANGLER_LOG_PATH || "/tmp/wrangler-image-upload.log"
    }
  });

  if (result.error) {
    fail(`Could not run Wrangler: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  process.stdout.write(
    [
      `Uploaded: ${upload.bucket}/${upload.key}`,
      `URL: ${upload.url}`,
      `Markdown: ${upload.markdown}`,
      ""
    ].join("\n")
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
