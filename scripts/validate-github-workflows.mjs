#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowDir = new URL("../.github/workflows", import.meta.url);
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort()
  .map((name) => ({
    name,
    text: readFileSync(join(workflowDir.pathname, name), "utf8"),
  }));

const shaPinnedAction =
  /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+@[a-f0-9]{40}(?:\s+#\s+.+)?$/u;
const dockerAction = /^docker:\/\//u;
const localAction = /^\.\//u;

assert.ok(workflows.length > 0, "No GitHub workflows found");

for (const { name, text } of workflows) {
  assert.ok(
    !/pull_request_target:/u.test(text),
    `${name} must not use pull_request_target`,
  );
  assert.ok(
    /permissions:\n/u.test(text),
    `${name} must declare top-level permissions`,
  );
  assert.ok(
    !/write-all|read-all/u.test(text),
    `${name} must avoid broad read-all/write-all permissions`,
  );

  const usesLines = text.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu);
  for (const match of usesLines) {
    const action = match[1] ?? "";
    if (localAction.test(action) || dockerAction.test(action)) continue;
    assert.ok(
      shaPinnedAction.test(action),
      `${name} action must be pinned to a full commit SHA: ${action}`,
    );
  }

  if (name !== "release-images.yml") {
    assert.ok(
      !/packages:\s*write/u.test(text),
      `${name} must not request packages: write`,
    );
    assert.ok(
      !/id-token:\s*write/u.test(text),
      `${name} must not request id-token: write`,
    );
  }
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const scripts = packageJson.scripts ?? {};
const ci = workflows.find((workflow) => workflow.name === "ci.yml")?.text ?? "";
for (const required of ["pnpm run ci:pr", "pnpm run deploy:validate"]) {
  assert.ok(ci.includes(required), `ci.yml missing required gate: ${required}`);
}
for (const required of [
  "non-runtime-validation",
  "pnpm run db:migrations:check",
  "pnpm run lib:configs:check",
  "pnpm run api:contracts:check",
  "pnpm run api:clients:check",
  "pnpm run api:openapi:lint",
  "pnpm run api:contracts:consumer",
  "pnpm run api:openapi:fuzz",
  "pnpm run test:property",
]) {
  assert.ok(
    ci.includes(required),
    `ci.yml missing non-runtime validation gate: ${required}`,
  );
}
for (const required of [
  "pnpm run tooling:static-check",
  "pnpm run test:security:secrets",
  "pnpm run test:security:sast",
  "pnpm run audit:ci",
]) {
  assert.ok(
    scripts["ci:pr"]?.includes(required),
    `package.json ci:pr missing required gate: ${required}`,
  );
}

console.log(JSON.stringify({ status: "ok", workflows: workflows.length }));
