#!/usr/bin/env node
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function compareTrees(expectedRoot, actualRoot) {
  const expected = listFiles(expectedRoot).map((file) =>
    relative(expectedRoot, file),
  );
  const actual = listFiles(actualRoot).map((file) =>
    relative(actualRoot, file),
  );
  const names = new Set([...expected, ...actual]);
  const diffs = [];
  for (const name of [...names].sort()) {
    if (!expected.includes(name))
      diffs.push(`extra committed file: ${join(actualRoot, name)}`);
    else if (!actual.includes(name))
      diffs.push(`missing committed file: ${join(actualRoot, name)}`);
    else if (
      readFileSync(join(expectedRoot, name), "utf8") !==
      readFileSync(join(actualRoot, name), "utf8")
    ) {
      diffs.push(`stale file: ${join(actualRoot, name)}`);
    }
  }
  return diffs;
}

const temp = mkdtempSync(join(tmpdir(), "api-clients-"));
try {
  const backupRoot = join(temp, "committed-generated");
  const expectedRoot = join(temp, "expected-generated");
  const copyCommitted = spawnSync("cp", ["-R", generatedRoot, backupRoot], {
    stdio: "inherit",
  });
  if (copyCommitted.status !== 0) process.exit(copyCommitted.status ?? 1);

  const result = spawnSync("node", ["tools/generate-api-clients.mjs"], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  const copyExpected = spawnSync("cp", ["-R", generatedRoot, expectedRoot], {
    stdio: "inherit",
  });
  if (copyExpected.status !== 0) process.exit(copyExpected.status ?? 1);

  rmSync(generatedRoot, { recursive: true, force: true });
  const restore = spawnSync("cp", ["-R", backupRoot, generatedRoot], {
    stdio: "inherit",
  });
  if (restore.status !== 0) process.exit(restore.status ?? 1);

  const diffs = compareTrees(expectedRoot, generatedRoot);
  if (diffs.length > 0) {
    console.error("API clients are stale. Run `pnpm api:clients`.");
    for (const diff of diffs) console.error(`- ${diff}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "fresh", generatedRoot }));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
