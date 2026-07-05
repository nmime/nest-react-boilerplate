#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const generatedRoot = "libs/frontend/api-client/lib/src/generated";

function listFiles(root: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === ".prettier-cache") continue;
      // Frontend toast rules are generated and verified by `api toast-config`.
      if (name === "toast" && dir === root) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function compareTrees(expectedRoot: string, actualRoot: string) {
  const expected = listFiles(expectedRoot).map((file) =>
    relative(expectedRoot, file),
  );
  const actual = listFiles(actualRoot).map((file) =>
    relative(actualRoot, file),
  );
  const diffs = [];
  for (const name of [...new Set([...expected, ...actual])].sort()) {
    if (!expected.includes(name))
      diffs.push(`extra committed file: ${join(actualRoot, name)}`);
    else if (!actual.includes(name))
      diffs.push(`missing committed file: ${join(actualRoot, name)}`);
    else if (
      readFileSync(join(expectedRoot, name), "utf8") !==
      readFileSync(join(actualRoot, name), "utf8")
    )
      diffs.push(`stale file: ${join(actualRoot, name)}`);
  }
  return diffs;
}

const temp = mkdtempSync(join(tmpdir(), "api-clients-"));
// Capture the exit code and exit after the finally block so the temp dir is
// always cleaned up; process.exit() inside try would skip finally.
let exitCode = 0;
try {
  const expectedRoot = join(temp, "expected-generated");
  const result = spawnSync(
    "node",
    [
      "packages/tooling/bin/repo-tooling.mjs", "api", "clients",
      "--generated-root",
      expectedRoot,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  } else {
    const diffs = compareTrees(expectedRoot, generatedRoot);
    if (diffs.length) {
      console.error("API clients are stale. Run `pnpm api:clients`.");
      for (const diff of diffs) console.error(`- ${diff}`);
      exitCode = 1;
    } else {
      console.log(JSON.stringify({ status: "fresh", generatedRoot }));
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
if (exitCode !== 0) process.exit(exitCode);
