import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const appName = "landing-app";
const distRoot = resolve(
  import.meta.dirname,
  "../../../../dist/apps/frontend/landing",
);
const expectedCopy = "Launch a full-stack Nest and React product foundation.";

const readBuiltTextFiles = (directory) => {
  const entries = readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return readBuiltTextFiles(entryPath);
    }

    if (!/\.(?:css|html|js)$/u.test(entry.name)) {
      return [];
    }

    return [readFileSync(entryPath, "utf8")];
  });
};

const indexPath = join(distRoot, "index.html");

if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  throw new Error(`[${appName}] missing built index.html at ${indexPath}`);
}

const searchable = readBuiltTextFiles(distRoot).join("\n");

if (!searchable.includes(expectedCopy)) {
  throw new Error(
    `[${appName}] expected landing copy not found in Astro build.`,
  );
}

console.log(
  JSON.stringify({
    appName,
    indexPath: relative(process.cwd(), indexPath),
    expectedCopy,
    status: "ok",
  }),
);
