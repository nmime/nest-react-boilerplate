// @ts-nocheck
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  checkForbiddenSocialAuthDependencies,
  checkForbiddenSocialAuthImports,
  checkGeneratedContractImports,
  checkThinLocaleCatalogs,
  checkPackageProjectReferences,
  checkStaleReferences,
  checkTrackedSocialAuthSecrets,
  checkWorkspaceMetadata,
  isWorkspaceMetadataFileName,
  thinLocaleCatalogFileNames,
} from "./static-check.ts";

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "static-check-generated-imports-"));
}

function removeWorkspace(workspaceRoot: string): void {
  rmSync(workspaceRoot, { force: true, recursive: true });
}

function writeText(workspaceRoot: string, path: string, text: string): void {
  const file = join(workspaceRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

describe("static-check generated contract import guard", () => {
  it("rejects deep generated contract imports from app feature source", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/auth/api/generated-import.ts",
        'import type { paths } from "../../../../../../../libs/common/api-contracts/lib/src/generated/auth-app-api";\n\nexport type Forbidden = paths;\n',
      );

      const failures = checkGeneratedContractImports(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "generated contract public import boundary",
      );
      assert.equal(
        failures[0].file,
        "apps/frontend/app/src/features/auth/api/generated-import.ts:1",
      );
      assert.match(failures[0].stderr, /stable public aliases/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("allows generated internals inside owning contract/client packages", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/common/api-contracts/lib/src/index.ts",
        'export type { paths } from "./generated/auth-app-api";\n',
      );
      writeText(
        workspaceRoot,
        "libs/frontend/api-client/lib/src/index.ts",
        'export { createAuthClient } from "./generated/auth";\n',
      );
      writeText(
        workspaceRoot,
        "AGENTS.md",
        "Generated contract artifacts live under libs/common/api-contracts/lib/src/generated.\n",
      );

      assert.deepEqual(checkGeneratedContractImports(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check social auth package guard", () => {
  it("rejects deprecated Telegram package imports from app source", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/tma/deprecated.ts",
        'import { useLaunchParams } from "@telegram-apps/sdk-react";\nimport legacyWebApp from "telegram-web-app";\n\nexport const value = useLaunchParams ?? legacyWebApp;\n',
      );

      const failures = checkForbiddenSocialAuthImports(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.equal(failures[0].command, "social auth forbidden import boundary");
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /@tma\.js/);
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /grammY/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects deprecated Telegram packages in dependency manifests", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/package.json",
        JSON.stringify({
          dependencies: {
            "@telegram-apps/sdk-react": "latest",
            "@vkruglikov/react-telegram-web-app": "latest",
          },
        }),
      );

      const failures = checkForbiddenSocialAuthDependencies(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.equal(failures[0].command, "social auth forbidden dependency guard");
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /@tma\.js/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects Telegram and Discord token-shaped values in tracked files", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "docs/social-auth-secrets.md",
        [
          "Do not commit these values:",
          "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_12345",
          "mfa.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_12345",
          "discordClientSecret = \"0123456789abcdefghijklmnopqrstuvwxyzABCD\"",
        ].join("\n"),
      );

      const failures = checkTrackedSocialAuthSecrets(workspaceRoot);

      assert.equal(failures.length, 3);
      assert.deepEqual(
        failures.map((failure) => failure.command),
        [
          "social auth tracked secret guard",
          "social auth tracked secret guard",
          "social auth tracked secret guard",
        ],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /secret-file/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("allows documented placeholders and secret-file examples", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        ".env.example",
        [
          "TELEGRAM_BOT_TOKEN=<set-telegram-bot-token>",
          "TELEGRAM_BOT_TOKEN_FILE=./secrets/telegram_bot_token.txt",
          "DISCORD_BOT_TOKEN=<set-discord-bot-token>",
          "DISCORD_CLIENT_SECRET=<set-discord-client-secret>",
        ].join("\n"),
      );

      assert.deepEqual(checkTrackedSocialAuthSecrets(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check workspace metadata guard", () => {
  it("recognizes metadata file names in Windows-style absolute paths", () => {
    assert.equal(
      isWorkspaceMetadataFileName(
        "C:\\repo\\packages\\tooling\\package.json",
        "package.json",
      ),
      true,
    );
    assert.equal(
      isWorkspaceMetadataFileName(
        "C:\\repo\\apps\\frontend\\landing-app\\project.json",
        "project.json",
      ),
      true,
    );
    assert.equal(
      isWorkspaceMetadataFileName(
        "C:\\repo\\packages\\tooling\\project.json.bak",
        "project.json",
      ),
      false,
    );
  });

  it("rejects duplicate tag prefixes and duplicate TS path targets", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/example/project.json",
        JSON.stringify({
          name: "example",
          tags: ["platform:shared", "type:common", "type:util"],
        }),
      );
      writeText(
        workspaceRoot,
        "tsconfig.base.json",
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@app/example": ["libs/example/src/index.ts"],
              "@app/example-compat": ["libs/example/src/index.ts"],
            },
          },
        }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({ name: "@repo/tooling" }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.deepEqual(
        failures.map((failure) => failure.command).sort(),
        [
          "workspace metadata project tags",
          "workspace metadata tsconfig paths",
        ],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /multiple type:/);
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /Duplicate TS path target/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("keeps packages/tooling as the only package-style workspace", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "tsconfig.base.json",
        JSON.stringify({ compilerOptions: { paths: {} } }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({ name: "@repo/tooling" }),
      );
      writeText(
        workspaceRoot,
        "packages/runtime/package.json",
        JSON.stringify({ name: "@repo/runtime" }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "workspace metadata package manifests",
      );
      assert.match(failures[0].stderr, /packages\/tooling/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check stale admin API name guard", () => {
  it("rejects the retired duplicated admin API project name", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "docs/stale-admin-api.md",
        `Use ${"backend-"}admin-app-api for the admin API.\n`,
      );

      const failures = checkStaleReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "stale architecture/version denylist");
      assert.equal(failures[0].file, "docs/stale-admin-api.md:1");
      assert.match(failures[0].stderr, /duplicated admin API project name/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check package project reference guard", () => {
  it("rejects stale package test scripts that reference removed Nx projects", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "test:e2e":
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,admin-app-api,user-app-api,auth-app-api",
          },
        }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/admin/project.json",
        JSON.stringify({ name: "admin-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/app/project.json",
        JSON.stringify({ name: "user-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/landing/project.json",
        JSON.stringify({ name: "landing-app" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/admin-app-api/project.json",
        JSON.stringify({ name: "retired-admin-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/user-app-api/project.json",
        JSON.stringify({ name: "user-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/auth-app-api/project.json",
        JSON.stringify({ name: "auth-app-api" }),
      );

      const failures = checkPackageProjectReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "package.json project reference package.json#test:e2e",
      );
      assert.equal(failures[0].file, "package.json");
      assert.match(failures[0].stderr, /admin-app-api/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts package test scripts whose referenced Nx projects exist", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "test:e2e":
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,admin-app-api,user-app-api,auth-app-api",
          },
        }),
      );
      for (const projectName of [
        "admin-app",
        "user-app",
        "landing-app",
        "admin-app-api",
        "user-app-api",
        "auth-app-api",
      ]) {
        writeText(
          workspaceRoot,
          `apps/${projectName}/project.json`,
          JSON.stringify({ name: projectName }),
        );
      }

      assert.deepEqual(checkPackageProjectReferences(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check thin locale catalog guard", () => {
  function writeThinLocaleWorkspace(workspaceRoot: string): void {
    for (const locale of ["en", "ru"]) {
      for (const fileName of thinLocaleCatalogFileNames) {
        writeText(
          workspaceRoot,
          `i18n/${locale}/${fileName}`,
          JSON.stringify({ [`${fileName}.key`]: `${locale}:${fileName}` }, null, 2),
        );
      }
      for (const scope of ["admin", "bots", "common", "landing", "user"]) {
        writeText(
          workspaceRoot,
          `i18n/${locale}/${scope}/project.json`,
          JSON.stringify({ name: `@app/i18n-${locale}-${scope}` }, null, 2),
        );
      }
    }
  }

  it("accepts complete thin locale catalogs with identical key sets", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);

      assert.deepEqual(checkThinLocaleCatalogs(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects overfull files, duplicate raw keys, merged duplicates, and locale key drift", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        `{
${Array.from({ length: 61 }, (_, index) => `  "common.${index}": "value"`).join(",\n")}
}
`,
      );
      writeText(
        workspaceRoot,
        "i18n/en/landing/app.json",
        `{
  "landing.duplicate": "first",
  "landing.duplicate": "second"
}
`,
      );
      writeText(
        workspaceRoot,
        "i18n/en/admin/shell.json",
        JSON.stringify({ "admin.shared": "first" }, null, 2),
      );
      writeText(
        workspaceRoot,
        "i18n/en/admin/dashboard.json",
        JSON.stringify({ "admin.shared": "second" }, null, 2),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/user/shell.json",
        JSON.stringify({ "user.only-ru": "drift" }, null, 2),
      );
      writeText(
        workspaceRoot,
        "i18n/en/user/tma.json",
        JSON.stringify({ "bot.menu.main": "wrong scope" }, null, 2),
      );

      const failures = checkThinLocaleCatalogs(workspaceRoot);
      const stderr = failures.map((failure) => failure.stderr).join("\n");

      assert.match(stderr, /has 61 keys/);
      assert.match(stderr, /duplicate raw JSON key landing\.duplicate/);
      assert.match(stderr, /duplicate merged locale key admin\.shared/);
      assert.match(stderr, /bot\/Discord key bot\.menu\.main/);
      assert.match(stderr, /missing fallback locale keys/);
      assert.match(stderr, /has keys absent from fallback locale/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});
