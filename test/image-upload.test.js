import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareUpload } from "../scripts/upload-image.mjs";

test("image uploader sends immutable image metadata to the configured R2 bucket", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-image-upload-"));
  const imagePath = path.join(root, "Morning Photo.png");
  await fs.writeFile(imagePath, "fake png bytes");
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  const upload = prepareUpload(imagePath, "早晨照片", {
    R2_IMAGE_DATE: "2026-08-10",
    R2_IMAGE_BUCKET: "test-images",
    R2_IMAGE_BASE_URL: "https://img.example.com/",
    R2_IMAGE_PREFIX: "diary"
  });

  assert.match(
    upload.wranglerArguments.join("\n"),
    /^r2\nobject\nput\ntest-images\/diary\/2026\/08\/morning-photo-[a-f0-9]{12}\.png\n/m
  );
  assert.deepEqual(upload.wranglerArguments.slice(-7), [
    "--file",
    imagePath,
    "--content-type",
    "image/png",
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--remote"
  ]);
  assert.match(
    upload.url,
    /^https:\/\/img\.example\.com\/diary\/2026\/08\/morning-photo-[a-f0-9]{12}\.png$/
  );
  assert.equal(upload.markdown, `![早晨照片](${upload.url})`);
});

test("image uploader rejects unsupported file types", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-image-upload-"));
  const filePath = path.join(root, "notes.txt");
  await fs.writeFile(filePath, "not an image");
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.throws(
    () =>
      prepareUpload(filePath, undefined, {
        R2_IMAGE_DATE: "2026-08-10"
      }),
    {
      message: "Unsupported image type: .txt"
    }
  );
});
