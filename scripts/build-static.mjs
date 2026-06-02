import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(rootDir, "dist");
const staticFiles = [
  "index.html",
  "grab.html",
  "styles.css",
  "app.js",
  "data.js",
  "generated-flagships.js",
  "generated-news.js",
  "generated-daily.js"
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of staticFiles) {
  await copyFile(resolve(rootDir, file), resolve(outputDir, file));
}

console.log(`Built ${staticFiles.length} files to ${outputDir}`);
