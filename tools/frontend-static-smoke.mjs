#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const dist = args.get("--dist");
const appName = args.get("--app-name");
const expectedCopy = args.get("--contains");

if (!dist || !appName || !expectedCopy) {
  console.error(
    "Usage: node tools/frontend-static-smoke.mjs --dist <dist-dir> --app-name <name> --contains <copy>",
  );
  process.exit(2);
}

const indexPath = join(dist, "index.html");
if (!existsSync(indexPath)) {
  console.error(`[${appName}] missing index.html at ${indexPath}`);
  process.exit(1);
}

const indexHtml = readFileSync(indexPath, "utf8");
if (!indexHtml.includes('<div id="root"></div>')) {
  console.error(
    `[${appName}] index.html does not contain the React root mount`,
  );
  process.exit(1);
}

const assetReferences = [
  ...indexHtml.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g),
].map((match) => match[1]);

if (assetReferences.length === 0) {
  console.error(`[${appName}] index.html does not reference built assets`);
  process.exit(1);
}

const missingAssets = assetReferences.filter(
  (assetPath) => !existsSync(join(dirname(indexPath), assetPath)),
);

if (missingAssets.length > 0) {
  console.error(
    `[${appName}] missing built assets: ${missingAssets.join(", ")}`,
  );
  process.exit(1);
}

const searchable = [indexHtml]
  .concat(
    assetReferences
      .filter(
        (assetPath) => assetPath.endsWith(".js") || assetPath.endsWith(".css"),
      )
      .map((assetPath) =>
        readFileSync(join(dirname(indexPath), assetPath), "utf8"),
      ),
  )
  .join("\n");

if (!searchable.includes(expectedCopy)) {
  console.error(
    `[${appName}] expected copy not found in built artifacts: ${expectedCopy}`,
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    appName,
    indexPath,
    assetCount: assetReferences.length,
    expectedCopy,
    status: "ok",
  }),
);
