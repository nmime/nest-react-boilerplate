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
      "site-app.example.com",
      "mobile-app.example.com",
      "admin-app.example.com",
      "user-app.example.com",
      "auth-app-api.example.com",
      "user-app-api.example.com",
      "admin-app-api.example.com",
      "discord-app-api.example.com",
      "telegram-bot-api.example.com",
      "admin-app.staging.example.com",
      "user@example.com",
    ].join("\n") + "\n",
  );
  writeFileSync(join(root, ".env.example"), "PUBLIC_URL=https://user-app.example.com\n");
  writeFileSync(
    join(root, ".env.production.example"),
    "PUBLIC_URL=https://example.com\nPRIMARY_APP=landing-app\n",
  );
  writeFileSync(
    join(root, "deployment.txt"),
    [
      "https://github.com/your-github-org/nest-react-boilerplate.git",
      "ghcr.io/your-github-org/nest-react-boilerplate/auth-app-api",
    ].join("\n") + "\n",
  );
  writeFileSync(
    join(root, "problem-type.txt"),
    "https://example.com/problems#resource-not-found\n",
  );
  writeFileSync(join(root, ".env"), "PRIVATE_URL=https://example.com\n");
  writeFileSync(
    join(root, "bootstrap.sh"),
    "#!/usr/bin/env bash\nREPOSITORY_URL=https://github.com/your-github-org/nest-react-boilerplate.git\n",
  );
  writeFileSync(
    join(root, "server.env.example"),
    "PUBLIC_DOMAIN=example.com\nIMAGE_REGISTRY=ghcr.io/your-github-org/nest-react-boilerplate\n",
  );
  writeFileSync(
    join(root, "spa.conf"),
    'add_header Content-Security-Policy "connect-src https://auth-app-api.example.com";\n',
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

      const invalidApex = spawnSync(
        process.execPath,
        [
          runner,
          command,
          "--name",
          "Acme App",
          "--domain",
          "acme.example",
          "--apex-app",
          "user-app",
          "--dry-run",
          "--force",
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.notEqual(invalidApex.status, 0);
      assert.match(`${invalidApex.stdout}${invalidApex.stderr}`, /landing-app.*site-app/u);
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
      assert.deepEqual(domains.trim().split("\n"), [
        "acme.example",
        "site-app.acme.example",
        "mobile-app.acme.example",
        "admin-app.acme.example",
        "user-app.acme.example",
        "auth-app-api.acme.example",
        "user-app-api.acme.example",
        "admin-app-api.acme.example",
        "discord-app-api.acme.example",
        "telegram-bot-api.acme.example",
        "admin-app.staging.acme.example",
        "user@acme.example",
      ]);

      assert.equal(
        readFileSync(join(root, ".env.example"), "utf8"),
        "PUBLIC_URL=https://user-app.acme.example\n",
      );
      assert.equal(
        readFileSync(join(root, ".env.production.example"), "utf8"),
        "PUBLIC_URL=https://acme.example\nPRIMARY_APP=landing-app\n",
      );
      assert.equal(
        readFileSync(join(root, "deployment.txt"), "utf8"),
        [
          "https://github.com/acme-org/acme-app.git",
          "ghcr.io/acme-org/acme-app/auth-app-api",
        ].join("\n") + "\n",
      );
      assert.equal(
        readFileSync(join(root, "problem-type.txt"), "utf8"),
        "https://acme.example/problems#resource-not-found\n",
        "Problem types must use the configured product domain without repository identity.",
      );
      assert.equal(
        readFileSync(join(root, ".env"), "utf8"),
        "PRIVATE_URL=https://example.com\n",
        "Real environment files must never be rewritten by template initialization.",
      );

      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        name: string;
      };
      assert.equal(manifest.name, "acme-app");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rewrites shell scripts, nginx conf, and *.env.example deployment templates", () => {
    const root = createFixture();
    try {
      execFileSync(
        process.execPath,
        [runner, command, "--name", "Acme App", "--domain", "acme.example", "--owner", "acme-org", "--force"],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(
        readFileSync(join(root, "bootstrap.sh"), "utf8"),
        "#!/usr/bin/env bash\nREPOSITORY_URL=https://github.com/acme-org/acme-app.git\n",
        "single-server bootstrap.sh must be re-pointed at the adopter's repository",
      );
      assert.equal(
        readFileSync(join(root, "server.env.example"), "utf8"),
        "PUBLIC_DOMAIN=acme.example\nIMAGE_REGISTRY=ghcr.io/acme-org/acme-app\n",
        "*.env.example deployment templates must be rewritten like .env.*.example files",
      );
      assert.equal(
        readFileSync(join(root, "spa.conf"), "utf8"),
        'add_header Content-Security-Policy "connect-src https://auth-app-api.acme.example";\n',
        "nginx .conf CSP hosts must be rewritten to the product domain",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("can assign the product apex to site-app while preserving every other hostname", () => {
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
          "acme.example",
          "--apex-app",
          "site-app",
          "--force",
        ],
        { cwd: root, encoding: "utf8" },
      );

      assert.deepEqual(readFileSync(join(root, "domains.txt"), "utf8").trim().split("\n"), [
        "landing-app.acme.example",
        "acme.example",
        "mobile-app.acme.example",
        "admin-app.acme.example",
        "user-app.acme.example",
        "auth-app-api.acme.example",
        "user-app-api.acme.example",
        "admin-app-api.acme.example",
        "discord-app-api.acme.example",
        "telegram-bot-api.acme.example",
        "admin-app.staging.acme.example",
        "user@acme.example",
      ]);
      assert.equal(
        readFileSync(join(root, ".env.production.example"), "utf8"),
        "PUBLIC_URL=https://landing-app.acme.example\nPRIMARY_APP=site-app\n",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
