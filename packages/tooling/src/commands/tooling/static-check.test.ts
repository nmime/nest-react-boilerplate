import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  checkCommandImportSmoke,
  checkTranslationKeyDrift,
  checkExportedAllCapsConstantConventions,
  checkExportedSymbolTokenConventions,
  checkForbiddenSocialAuthDependencies,
  checkForbiddenSocialAuthImports,
  checkGeneratedContractImports,
  checkDuplicatedLibrarySourceLibPaths,
  checkLocalBarrelExportConventions,
  checkThinLocaleCatalogs,
  checkPackageProjectReferences,
  checkStaleReferences,
  checkStaleSlashStyleAliasImports,
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

function writeImportSmokeFixture(workspaceRoot: string): void {
  writeText(
    workspaceRoot,
    "tsconfig.base.json",
    JSON.stringify({ compilerOptions: { paths: {} } }),
  );
  writeText(workspaceRoot, "packages/tooling/src/cli.ts", "export const main = () => 0;\n");
}

function writeTranslationKeyUnion(
  workspaceRoot: string,
  keys: string[],
  quote: 'single' | 'double' = 'double',
): void {
  const delimiter = quote === 'single' ? "'" : '"';
  const union = keys.map((key) => `  | ${delimiter}${key}${delimiter}`).join("\n");
  writeText(
    workspaceRoot,
    "libs/common/i18n/keys/lib/src/index.ts",
    `export type TranslationKey =\n${union};\n`,
  );
}

describe("static-check translation key drift guard", () => {
  it("accepts an exact match between en catalogs and the TranslationKey union", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify({ "common.a": "A", "common.b": "B" }),
      );
      writeTranslationKeyUnion(workspaceRoot, ["common.a", "common.b"], 'single');

      assert.deepEqual(checkTranslationKeyDrift(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("flags drift in either direction and ignores Nx project.json files", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify({ "common.a": "A", "common.catalogOnly": "C" }),
      );
      writeText(
        workspaceRoot,
        "i18n/en/project.json",
        JSON.stringify({ name: "en-i18n", sourceRoot: "i18n/en" }),
      );
      writeTranslationKeyUnion(workspaceRoot, ["common.a", "common.unionOnly"]);

      const failures = checkTranslationKeyDrift(workspaceRoot);
      const messages = failures.map((failure) => failure.stderr).join("\n");

      assert.equal(failures.length, 2);
      assert.match(messages, /missing 1 key\(s\).*common\.catalogOnly/s);
      assert.match(messages, /absent from i18n\/en catalogs.*common\.unionOnly/s);
      // The Nx project.json keys (name, sourceRoot) must not be treated as catalog keys.
      assert.equal(messages.includes("sourceRoot"), false);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check command import smoke guard", () => {
  it("flags command modules with unresolved import paths", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeImportSmokeFixture(workspaceRoot);
      writeText(
        workspaceRoot,
        "packages/tooling/src/commands/demo/broken.ts",
        'import { missing } from "./does-not-exist.ts";\nexport const value = missing;\n',
      );

      const failures = checkCommandImportSmoke(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "command module import smoke");
      assert.equal(failures[0].file, "packages/tooling/src/commands/demo/broken.ts");
      assert.match(failures[0].stderr, /Unresolved import "\.\/does-not-exist\.ts"/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts command modules whose relative imports resolve", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeImportSmokeFixture(workspaceRoot);
      writeText(
        workspaceRoot,
        "packages/tooling/src/commands/demo/helper.ts",
        "export const helper = 1;\n",
      );
      writeText(
        workspaceRoot,
        "packages/tooling/src/commands/demo/entry.ts",
        'import { helper } from "./helper.ts";\nimport { readFileSync } from "node:fs";\nexport const value = helper + Number(Boolean(readFileSync));\n',
      );

      assert.deepEqual(checkCommandImportSmoke(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

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

describe("static-check stale slash-style alias guard", () => {
  it("rejects stale slash-style @app imports", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/example/src/consumer.ts",
        [
          'import type { paths } from "@app/common/api/contracts";',
          'export { createClient } from "@app/frontend/api/client";',
        ].join("\n"),
      );

      const failures = checkStaleSlashStyleAliasImports(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.deepEqual(
        failures.map((failure) => failure.command),
        ["stale slash-style alias import", "stale slash-style alias import"],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /flattened @app aliases/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts flattened package aliases and wildcard catalog subpaths", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/example/src/consumer.ts",
        [
          'import type { paths } from "@app/common-api-contracts";',
          'import enErrorsCatalog from "@app/i18n-en-common/errors.json";',
          'export { createAuthClient } from "@app/frontend-api-client";',
        ].join("\n"),
      );

      assert.deepEqual(checkStaleSlashStyleAliasImports(workspaceRoot), []);
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


describe("static-check exported constant naming guard", () => {
  it("rejects exported ALL_CAPS const declarations", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/shared/lib/src/oauth/tenant-context.ts",
        [
          'export const DEFAULT_AUTH_TENANT_ID = "00000000-0000-0000-0000-000000000000";',
          'const LOCAL_ONLY = "allowed";',
          'export const DefaultAuthTenantId = "00000000-0000-0000-0000-000000000000";',
        ].join("\n"),
      );

      const failures = checkExportedAllCapsConstantConventions(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "exported constant naming convention");
      assert.equal(
        failures[0].file,
        "libs/backend/feature/auth/shared/lib/src/oauth/tenant-context.ts:1",
      );
      assert.match(failures[0].stderr, /DEFAULT_AUTH_TENANT_ID/);
      assert.match(failures[0].stderr, /PascalCase/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts exported PascalCase and camelCase constants", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/shared/lib/src/oauth/tenant-context.ts",
        [
          'export const DefaultAuthTenantId = "00000000-0000-0000-0000-000000000000";',
          'export const tenantIdHeaders = ["x-tenant-id"] as const;',
        ].join("\n"),
      );

      assert.deepEqual(checkExportedAllCapsConstantConventions(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check exported symbol token guard", () => {
  it("rejects all-caps exported Symbol token constants", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/auth-user-store.ts",
        'export const AUTH_USER_STORE = Symbol("AUTH_USER_STORE");\n',
      );

      const failures = checkExportedSymbolTokenConventions(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "exported symbol token convention");
      assert.match(failures[0].stderr, /PascalCase/);
      assert.match(failures[0].stderr, /reference inject-token convention/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects PascalCase exported Symbol tokens without InjectToken suffix", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/auth-user-store.ts",
        'export const AuthUserStore = Symbol("AuthUserStore");\n',
      );

      const failures = checkExportedSymbolTokenConventions(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "exported symbol token convention");
      assert.match(failures[0].stderr, /InjectToken/);
      assert.match(failures[0].stderr, /reference inject-token convention/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts InjectToken exported Symbol tokens with matching descriptions", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/auth-user-store.ts",
        'export const AuthUserStoreInjectToken = Symbol("AuthUserStoreInjectToken");\n',
      );

      const failures = checkExportedSymbolTokenConventions(workspaceRoot);

      assert.deepEqual(failures, []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check local re-export guard", () => {
  it("rejects named local re-exports", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/auth/index.ts",
        [
          'export { AuthCards } from "./ui/auth-cards";',
          'export type { AuthMode } from "./model/auth-model";',
        ].join("\n"),
      );
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/auth/auth.facade.ts",
        'export { AuthCards } from "./ui/auth-cards";\n',
      );

      const failures = checkLocalBarrelExportConventions(workspaceRoot);

      assert.equal(failures.length, 3);
      assert.deepEqual(
        failures.map((failure) => failure.file),
        [
          "apps/frontend/app/src/features/auth/auth.facade.ts:1",
          "apps/frontend/app/src/features/auth/index.ts:1",
          "apps/frontend/app/src/features/auth/index.ts:2",
        ],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /export \* from/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts star re-exports from local modules", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "apps/frontend/app/src/features/auth/index.ts",
        ['export * from "./ui/auth-cards";', 'export type * from "./model";'].join("\n"),
      );

      assert.deepEqual(checkLocalBarrelExportConventions(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check library source path guard", () => {
  it("rejects duplicated library lib/src/lib paths", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/project.json",
        JSON.stringify({ name: "@app/backend-feature-auth-main" }),
      );
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/lib/auth-user-store.ts",
        "export const AuthUserStoreInjectToken = Symbol('AuthUserStoreInjectToken');\n",
      );
      writeText(
        workspaceRoot,
        "docs/frontend-state.md",
        "Old path: libs/backend/feature/auth/main/lib/src/lib/auth-user-store.ts\n",
      );

      const failures = checkDuplicatedLibrarySourceLibPaths(workspaceRoot);

      assert.equal(failures.length, 2);
      assert.deepEqual(
        failures.map((failure) => failure.file),
        [
          "libs/backend/feature/auth/main/lib/src/lib",
          "docs/frontend-state.md:1",
        ],
      );
      assert.match(
        failures.map((failure) => failure.stderr).join("\n"),
        /lib\/src\/lib/,
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts library source folders directly below src", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/project.json",
        JSON.stringify({ name: "@app/backend-feature-auth-main" }),
      );
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/auth-user-store.ts",
        "export const AuthUserStoreInjectToken = Symbol('AuthUserStoreInjectToken');\n",
      );
      writeText(
        workspaceRoot,
        "docs/frontend-state.md",
        "Current path: libs/backend/feature/auth/main/lib/src/auth-user-store.ts\n",
      );

      assert.deepEqual(checkDuplicatedLibrarySourceLibPaths(workspaceRoot), []);
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

  it("rejects duplicate tag prefixes and non-canonical app aliases", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/example/project.json",
        JSON.stringify({
          name: "@app/example/compat",
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
              "@app/example/compat": ["libs/example/src/index.ts"],
              "@app/i18n-en-admin/*": ["i18n/en/admin/*"],
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

      assert.equal(failures.length, 4);
      assert.deepEqual(
        failures.map((failure) => failure.command).sort(),
        [
          "workspace metadata project names",
          "workspace metadata project tags",
          "workspace metadata tsconfig paths",
          "workspace metadata tsconfig paths",
        ],
      );
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /multiple type:/);
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /Duplicate TS path target/);
      assert.match(
        failures.map((failure) => failure.stderr).join("\n"),
        /package-style flattened naming/,
      );
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

  it("accepts backend and frontend platform package manifests", () => {
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
        "libs/backend/package.json",
        JSON.stringify({ name: "@app/backend" }),
      );
      writeText(
        workspaceRoot,
        "libs/frontend/package.json",
        JSON.stringify({ name: "@app/frontend" }),
      );

      assert.deepEqual(checkWorkspaceMetadata(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects package manifests inside nested libraries", () => {
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
        "libs/frontend/ui-web/lib/package.json",
        JSON.stringify({ name: "@app/frontend-ui-web" }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "workspace metadata package manifests",
      );
      assert.match(
        failures[0].stderr,
        /Nested libraries must not define package\.json/,
      );
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

describe("static-check retired documentation contract guard", () => {
  it("rejects deleted paths and unsupported environment names", () => {
    const workspaceRoot = createWorkspace();

    try {
      const retiredUiPath = ["libs/frontend", "ui"].join("/");
      const retiredContractPath = [
        "packages/tooling/src/commands/api",
        "contract-layout.ts",
      ].join("/");
      const retiredEnvironmentName = ["POSTHOG", "API", "KEY"].join("_");
      writeText(
        workspaceRoot,
        "docs/stale-contracts.md",
        `${retiredUiPath}\n${retiredContractPath}\n${retiredEnvironmentName}\n`,
      );

      const failures = checkStaleReferences(workspaceRoot);

      assert.equal(failures.length, 3);
      assert.match(failures[0].stderr, /frontend UI compatibility facade/);
      assert.match(failures[1].stderr, /API contract layout helper/);
      assert.match(failures[2].stderr, /unsupported environment variable name/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check Problem Details namespace guard", () => {
  it("rejects the unregistered problem URN namespace", () => {
    const workspaceRoot = createWorkspace();

    try {
      const invalidProblemType = ["urn", "problem", "example", "not-found"].join(":");
      writeText(workspaceRoot, "docs/problem-details.md", `${invalidProblemType}\n`);

      const failures = checkStaleReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.match(failures[0].stderr, /invalid Problem Details URN namespace/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check Node version guard", () => {
  it("rejects an old NODE_VERSION assignment", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, "Dockerfile", "ARG NODE_VERSION=" + "22.14.0-alpine\n");

      const failures = checkStaleReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.match(failures[0].stderr, /unsupported workflow Node version reference/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("does not treat the minor component of Node 24 as an old major", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, "Dockerfile", "ARG NODE_VERSION=24.18.0-alpine\n");

      assert.deepEqual(checkStaleReferences(workspaceRoot), []);
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
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,site-app,mobile-app,admin-app-api,user-app-api,auth-app-api",
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
        "apps/backend/admin/admin-app-api/project.json",
        JSON.stringify({ name: "retired-admin-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/user/user-app-api/project.json",
        JSON.stringify({ name: "user-app-api" }),
      );
      writeText(
        workspaceRoot,
        "apps/backend/auth/auth-app-api/project.json",
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
              "nx run-many -t e2e --projects=admin-app,user-app,landing-app,site-app,mobile-app,admin-app-api,user-app-api,auth-app-api",
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
