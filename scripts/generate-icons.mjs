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
  render("public/icon-maskable-512.png", 512)
]);

console.log("Generated browser and PWA icons.");
