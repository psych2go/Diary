import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await fs.readFile(path.join(root, "public", "icon.svg"), "utf8");

async function render(relativePath, size) {
  const image = new Resvg(source, {
    fitTo: {
      mode: "width",
      value: size
    }
  }).render();

  await fs.writeFile(path.join(root, relativePath), image.asPng());
}

await Promise.all([
  render("public/icon-192.png", 192),
  render("public/icon-32.png", 32),
  render("public/icon-512.png", 512),
  render("public/icon-maskable-512.png", 512),
  render("android/store_icon.png", 512),
  render("android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48),
  render("android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72),
  render("android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96),
  render("android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144),
  render("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192),
  render("android/app/src/main/res/mipmap-mdpi/ic_maskable.png", 82),
  render("android/app/src/main/res/mipmap-hdpi/ic_maskable.png", 123),
  render("android/app/src/main/res/mipmap-xhdpi/ic_maskable.png", 164),
  render("android/app/src/main/res/mipmap-xxhdpi/ic_maskable.png", 246),
  render("android/app/src/main/res/mipmap-xxxhdpi/ic_maskable.png", 328),
  render("android/app/src/main/res/drawable-mdpi/splash.png", 300),
  render("android/app/src/main/res/drawable-hdpi/splash.png", 450),
  render("android/app/src/main/res/drawable-xhdpi/splash.png", 600),
  render("android/app/src/main/res/drawable-xxhdpi/splash.png", 900),
  render("android/app/src/main/res/drawable-xxxhdpi/splash.png", 1200)
]);

console.log("Generated Android launcher, splash, store, and PWA icons.");
