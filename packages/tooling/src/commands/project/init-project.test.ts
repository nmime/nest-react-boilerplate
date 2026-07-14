import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const workspaceRoot = process.cwd();
const runner = resolve(workspaceRoot, "packages/tooling/bin/run-ts-command.mjs");
const command = resolve(
  workspaceRoot,
  "packages/tooling/src/commands/project/init-project.ts",
);

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "nrb-init-project-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "nest-react-boilerplate", private: true }, null, 2) + "\n",
  );
  writeFileSync(
    join(root, "domains.txt"),
    [
      "example.com",
      "site.example.com",
      "mobile.example.com",
      "admin.example.com",
      "app.example.com",
      "auth.example.com",
      "api.example.com",
      "admin-api.example.com",
      "discord-api.example.com",
      "telegram-api.example.com",
      "admin.staging.example.com",
      "user@example.com",
    ].join("\n") + "\n",
  );
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}

describe("project init", () => {
  it("requires an explicit valid product domain", () => {
    const root = createFixture();
    try {
      const missing = spawnSync(
        process.execPath,
        [runner, command, "--name", "Acme App", "--dry-run", "--force"],
        { cwd: root, encoding: "utf8" },
      );
      assert.notEqual(missing.status, 0);
      assert.match(`${missing.stdout}${missing.stderr}`, /--domain is required/u);

      const invalid = spawnSync(
        process.execPath,
        [
          runner,
          command,
          "--name",
          "Acme App",
          "--domain",
          "https://acme.example/path",
          "--dry-run",
          "--force",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.notEqual(invalid.status, 0);
      assert.match(`${invalid.stdout}${invalid.stderr}`, /DNS base name/u);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("replaces the base domain across every frontend, API, staging, and email surface", () => {
    const root = createFixture();
    try {
      execFileSync(
        process.execPath,
        [
          runner,
          command,
          "--name",
          "Acme App",
          "--domain",
          "Acme.Example.",
          "--owner",
          "acme-org",
          "--force",
        ],
        { cwd: root, encoding: "utf8" },
      );

      const domains = readFileSync(join(root, "domains.txt"), "utf8");
      assert.equal(domains.includes("example.com"), false);
      assert.match(domains, /^acme\.example$/mu);
      assert.match(domains, /^site\.acme\.example$/mu);
      assert.match(domains, /^mobile\.acme\.example$/mu);
      assert.match(domains, /^admin-api\.acme\.example$/mu);
      assert.match(domains, /^discord-api\.acme\.example$/mu);
      assert.match(domains, /^telegram-api\.acme\.example$/mu);
      assert.match(domains, /^admin\.staging\.acme\.example$/mu);
      assert.match(domains, /^user@acme\.example$/mu);

      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        name: string;
      };
      assert.equal(manifest.name, "acme-app");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
