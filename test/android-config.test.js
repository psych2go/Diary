import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("Android TWA targets the production diary domain", async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "android", "twa-manifest.json"), "utf8")
  );
  const gradle = await fs.readFile(
    path.join(root, "android", "app", "build.gradle"),
    "utf8"
  );
  const rootGradle = await fs.readFile(
    path.join(root, "android", "build.gradle"),
    "utf8"
  );
  const androidManifest = await fs.readFile(
    path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"),
    "utf8"
  );
  const wrapperProperties = await fs.readFile(
    path.join(root, "android", "gradle", "wrapper", "gradle-wrapper.properties"),
    "utf8"
  );
  const index = await fs.readFile(
    path.join(root, "public", "index.html"),
    "utf8"
  );
  const serviceWorker = await fs.readFile(
    path.join(root, "public", "sw.js"),
    "utf8"
  );

  assert.equal(manifest.packageId, "fun.zhuying.diary");
  assert.equal(manifest.host, "diary.zhuying.fun");
  assert.equal(manifest.startUrl, "/");
  assert.equal(manifest.fallbackType, "webview");
  assert.equal(manifest.appVersionCode, 4);
  assert.equal(manifest.appVersionName, "1.0.3");
  assert.equal(
    manifest.webManifestUrl,
    "https://diary.zhuying.fun/manifest.webmanifest"
  );
  assert.match(gradle, /fallbackType:\s*'webview'/);
  assert.match(gradle, /versionCode 4/);
  assert.match(gradle, /versionName "1\.0\.3"/);
  assert.doesNotMatch(gradle, /localhost|127\.0\.0\.1/);
  assert.doesNotMatch(rootGradle, /jcenter\(\)/);
  assert.match(rootGradle, /mavenCentral\(\)/);
  assert.match(androidManifest, /android:allowBackup="false"/);
  assert.match(
    androidManifest,
    /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/
  );
  assert.match(
    wrapperProperties,
    /distributionSha256Sum=f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6/
  );
  assert.match(index, /icon\.svg\?v=2/);
  assert.match(index, /apple-touch-icon/);
  assert.match(serviceWorker, /my-diary-v8/);
});

test("PWA provides required Android icon sizes", async () => {
  const icon192 = await fs.readFile(path.join(root, "public", "icon-192.png"));
  const icon32 = await fs.readFile(path.join(root, "public", "icon-32.png"));
  const icon512 = await fs.readFile(path.join(root, "public", "icon-512.png"));
  const maskable = await fs.readFile(
    path.join(root, "public", "icon-maskable-512.png")
  );

  assert.deepEqual(pngSize(icon32), { width: 32, height: 32 });
  assert.deepEqual(pngSize(icon192), { width: 192, height: 192 });
  assert.deepEqual(pngSize(icon512), { width: 512, height: 512 });
  assert.deepEqual(pngSize(maskable), { width: 512, height: 512 });

  const iconSource = await fs.readFile(
    path.join(root, "public", "icon.svg"),
    "utf8"
  );
  assert.doesNotMatch(iconSource, /#c43f36|<circle|96-108/i);
});
