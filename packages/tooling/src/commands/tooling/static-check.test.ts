// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { supportedLocales } from "@app/common-i18n-runtime";
import {
  checkBunPackageManagerParity,
  checkCommandImportSmoke,
  checkTranslationKeyDrift,
  checkExportedAllCapsConstantConventions,
  checkEnvExampleConsistency,
  checkExportedSymbolTokenConventions,
  checkForbiddenSocialAuthDependencies,
  checkForbiddenSocialAuthImports,
  checkGeneratedContractImports,
  checkDuplicatedLibrarySourceLibPaths,
  checkFrontendUiOwnership,
  checkLocalBarrelExportConventions,
  checkThinLocaleCatalogs,
  checkPackageProjectReferences,
  checkPackageScriptReferences,
  checkProviderScopedRuntimeImports,
  checkRepositoryScriptSpecCoverage,
  checkStaleReferences,
  checkStaleSlashStyleAliasImports,
  checkTrackedSocialAuthSecrets,
  checkVersionedMigrationAuthzBinding,
  checkWorkspaceMetadata,
  collectCommandModules,
  isWorkspaceMetadataFileName,
  staticCheckChildEnv,
} from "./static-check.ts";

describe("static-check worker heap cap environment", () => {
  const originalNodeOptions = process.env.NODE_OPTIONS;

  function withNodeOptions(value: string | undefined, runCase: () => void): void {
    if (value === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = value;
    try {
      runCase();
    } finally {
      if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = originalNodeOptions;
    }
  }

  it("appends the per-worker old-space cap to a clean environment", () => {
    withNodeOptions(undefined, () => {
      assert.deepEqual(staticCheckChildEnv(512), {
        NODE_OPTIONS: "--max-old-space-size=512",
      });
    });
  });

  it("preserves an inherited NODE_OPTIONS when appending the cap", () => {
    withNodeOptions("--expose-gc", () => {
      assert.deepEqual(staticCheckChildEnv(1024), {
        NODE_OPTIONS: "--expose-gc --max-old-space-size=1024",
      });
    });
  });

  it("carries extra environment entries alongside the cap", () => {
    withNodeOptions(undefined, () => {
      assert.deepEqual(
        staticCheckChildEnv(1024, { SKIP_INTEGRATION: "1", NODE_TEST_CONCURRENCY: "1" }),
        {
          NODE_OPTIONS: "--max-old-space-size=1024",
          SKIP_INTEGRATION: "1",
          NODE_TEST_CONCURRENCY: "1",
        },
      );
    });
  });
});

describe("static-check Bun and pnpm dependency parity", () => {
  it("accepts Bun runtime execution over pnpm-owned dependency state", () => {
    const workspaceRoot = createWorkspace();
    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ packageManager: "pnpm@11.11.0", scripts: { check: "bun run --bun ./check.ts" } }),
      );
      writeText(workspaceRoot, "pnpm-workspace.yaml", "packages: []\n");
      assert.deepEqual(checkBunPackageManagerParity(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("rejects Bun package-manager state, commands, and duplicate workspaces", () => {
    const workspaceRoot = createWorkspace();
    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ scripts: { install: "bun install" }, workspaces: ["apps/*"] }),
      );
      writeText(workspaceRoot, "bun.lock", "{}\n");
      const failures = checkBunPackageManagerParity(workspaceRoot);
      assert.equal(failures.length, 3);
      assert.ok(failures.every((failure) => failure.command === "bun pnpm dependency parity"));
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // The scan used to hardcode .github/workflows, so a product hosted anywhere else could invoke
  // `bun install` in its pipeline and this gate would report a clean workspace. Every pipeline the
  // CI gate descriptor names is now in scope, whichever forge declares it.
  it("scans the pipeline files every configured forge declares, not only GitHub workflows", () => {
    const workspaceRoot = createWorkspace();
    try {
      writeText(workspaceRoot, "package.json", JSON.stringify({ packageManager: "pnpm@11.11.0" }));
      writeText(workspaceRoot, "pnpm-workspace.yaml", "packages: []\n");
      writeText(
        workspaceRoot,
        "scripts/ci/gates.json",
        JSON.stringify({
          forges: {
            gitlab: {
              pipeline: ".gitlab-ci.yml",
              jobStyle: "gitlab",
              aggregateJob: "ci-status-summary",
              releasePipeline: "ci/release.yml",
            },
          },
          lanes: {},
          gates: [],
          supplyChain: [],
        }),
      );
      writeText(workspaceRoot, ".gitlab-ci.yml", "script:\n  - bun install\n");
      writeText(workspaceRoot, "ci/release.yml", "script:\n  - bunx cosign\n");

      const failures = checkBunPackageManagerParity(workspaceRoot);

      assert.deepEqual(
        failures.map((failure) => failure.file).sort(),
        [".gitlab-ci.yml", "ci/release.yml"],
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check provider-scoped runtime boundary", () => {
  it("rejects provider imports from neutral runtime source", () => {
    const workspaceRoot = createWorkspace();
    try {
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/module.ts",
        "import { MongoMainModule } from '@app/backend-mongodb-main';\n",
      );
      const failures = checkProviderScopedRuntimeImports(workspaceRoot);
      assert.equal(failures.length, 1);
      assert.equal(failures[0]?.command, "provider-scoped runtime import boundary");
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("allows generated composition but rejects test imports that pollute the Nx package closure", () => {
    const workspaceRoot = createWorkspace();
    try {
      writeText(
        workspaceRoot,
        "apps/backend/auth/src/capabilities.generated.ts",
        "import { MongoMainModule } from '@app/backend-mongodb-main';\n",
      );
      writeText(
        workspaceRoot,
        "libs/backend/feature/auth/main/lib/src/module.spec.ts",
        "import { PostgresMainModule } from '@app/backend-postgres-main';\n",
      );
      const failures = checkProviderScopedRuntimeImports(workspaceRoot);
      assert.equal(failures.length, 1);
      assert.match(failures[0]?.file ?? "", /module\.spec\.ts$/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check frontend UI ownership guard", () => {
  it("rejects app-local and registry-default components/ui trees", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, "apps/frontend/admin/src/components/ui/button.tsx", "export const Button = 1;\n");
      writeText(workspaceRoot, "libs/frontend/components/ui/spotlight.tsx", "export const Spotlight = 1;\n");

      const failures = checkFrontendUiOwnership(workspaceRoot);
      assert.equal(failures.length, 2);
      assert.ok(failures.every((failure) => failure.command === "frontend shared UI ownership"));
      assert.match(failures.map((failure) => failure.stderr).join("\n"), /@app\/frontend-ui-web/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts canonical shared UI and app feature composition", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, "libs/frontend/ui-web/lib/src/component/button.tsx", "export const Button = 1;\n");
      writeText(workspaceRoot, "apps/frontend/admin/src/features/users/ui/user-card.tsx", "export const UserCard = 1;\n");
      assert.deepEqual(checkFrontendUiOwnership(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check environment examples", () => {
  it("checks duplicate keys in every environment profile", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, ".env.example", "APP_NAME=example\n");
      writeText(workspaceRoot, ".env.local.example", "APP_NAME=example\n");
      writeText(workspaceRoot, ".env.staging.example", "PORT=3000\nPORT=3100\n");

      const failures = checkEnvExampleConsistency(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].file, "./.env.staging.example");
      assert.match(failures[0].stderr, /Duplicate env key: PORT/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

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

  // `i18n/<locale>/lint.json` is a supported, thin-catalog-exempt file, but the drift gate parsed it
  // as a catalog and demanded its top-level keys join the TranslationKey union — a failure the
  // generated module can never satisfy, because its generator excludes locale-root metadata.
  it("does not read locale-root metadata as a catalog", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify({ "common.a": "A", "common.b": "B" }),
      );
      writeText(
        workspaceRoot,
        "i18n/en/lint.json",
        JSON.stringify({ foreignProseMarkers: ["the"], untranslatedKeys: [] }),
      );
      writeText(
        workspaceRoot,
        "i18n/en/review-ledger.json",
        JSON.stringify({ reviewedBy: "nobody" }),
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

  it("reuses an explicitly provided command module list instead of re-walking", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeImportSmokeFixture(workspaceRoot);
      writeText(
        workspaceRoot,
        "packages/tooling/src/commands/demo/entry.ts",
        'import { readFileSync } from "node:fs";\nexport const value = Number(Boolean(readFileSync));\n',
      );
      const modules = collectCommandModules(workspaceRoot);

      assert.ok(modules.length > 0);
      assert.deepEqual(checkCommandImportSmoke(workspaceRoot, modules), []);
      assert.deepEqual(checkCommandImportSmoke(workspaceRoot, []), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check versioned migration authz binding", () => {
  const migrationPath =
    "libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/migrations/Migration20260704120000CreateRbacModel.ts";

  it("rejects a versioned migration bound to the composed catalog", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        migrationPath,
        'import {\n  defaultRolePermissions,\n  permissionCatalog,\n  roleKeys,\n} from "@app/common-authz";\n\nexport const seed = () => [permissionCatalog, roleKeys, defaultRolePermissions];\n',
      );

      const failures = checkVersionedMigrationAuthzBinding(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0].command, "versioned migration authz binding");
      assert.equal(failures[0].file, `${migrationPath}:1`);
      assert.match(failures[0].stderr, /defaultRolePermissions, permissionCatalog, roleKeys/u);
      assert.match(failures[0].stderr, /basePermissionCatalog/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts a versioned migration bound to the frozen base catalog", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        migrationPath,
        'import { basePermissionCatalog, baseRoleKeys, baseRolePermissions } from "@app/common-authz";\n\nexport const seed = () => [basePermissionCatalog, baseRoleKeys, baseRolePermissions];\n',
      );

      assert.deepEqual(checkVersionedMigrationAuthzBinding(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("leaves converging reconcilers and migration specs free to use the composed catalog", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "libs/backend/mongodb/main/auth/lib/src/auth-mongo.collections.ts",
        'import { permissionCatalog, permissionsForRoles, roleKeys } from "@app/common-authz";\n\nexport const seed = () => [permissionCatalog, permissionsForRoles, roleKeys];\n',
      );
      writeText(
        workspaceRoot,
        "libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/migrations/rbac-model.migration.spec.ts",
        'import { permissionCatalog, roleKeys } from "@app/common-authz";\n\nexport const fixture = [permissionCatalog, roleKeys];\n',
      );

      assert.deepEqual(checkVersionedMigrationAuthzBinding(workspaceRoot), []);
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
        "libs/frontend/package.json",
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

  it("rejects application package manifests because Nx owns deployable identity", () => {
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
        "apps/frontend/example/package.json",
        JSON.stringify({ name: "example-app", dependencies: { react: "1.0.0" } }),
      );

      const failures = checkWorkspaceMetadata(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.match(failures[0].stderr, /project\.json owns application identity/);
      assert.match(failures[0].stderr, /apps\/frontend\/example\/package\.json/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts a dependency-only application renderer boundary", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(workspaceRoot, "tsconfig.base.json", JSON.stringify({ compilerOptions: { paths: {} } }));
      writeText(workspaceRoot, "packages/tooling/package.json", JSON.stringify({ name: "@repo/tooling" }));
      writeText(
        workspaceRoot,
        "apps/frontend/docs/package.json",
        JSON.stringify({ private: true, devDependencies: { astro: "1.0.0" } }),
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

describe("static-check repository scan boundaries", () => {
  it("scans canonical task files and docs while excluding local nested worktrees", () => {
    const workspaceRoot = createWorkspace();

    try {
      const retiredNode = ["Node", "22"].join(" ");
      writeText(
        workspaceRoot,
        "packages/tooling/src/commands/db/provider-command.ts",
        `// ${retiredNode}\nexport const provider = 'postgres';\n`,
      );
      writeText(workspaceRoot, "docs/architecture.md", `${retiredNode}\n`);
      writeText(
        workspaceRoot,
        ".claude/worktrees/topic/packages/tooling/src/commands/tooling/static-check.test.ts",
        `export const AUTH_USER_STORE = Symbol("AUTH_USER_STORE");\n// ${retiredNode}\n`,
      );
      writeText(
        workspaceRoot,
        ".claude/worktrees/topic/libs/example/project.json",
        JSON.stringify({ name: "admin-app-api", tags: ["type:one", "type:two"] }),
      );
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ scripts: { "test:e2e": "nx run admin-app-api:e2e" } }),
      );
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

      const staleFailures = checkStaleReferences(workspaceRoot);
      assert.deepEqual(
        staleFailures.map((failure) => failure.file),
        [
          "docs/architecture.md:1",
          "packages/tooling/src/commands/db/provider-command.ts:1",
        ],
      );
      assert.deepEqual(checkExportedSymbolTokenConventions(workspaceRoot), []);
      assert.deepEqual(checkWorkspaceMetadata(workspaceRoot), []);
      const projectReferenceFailures = checkPackageProjectReferences(workspaceRoot);
      assert.equal(projectReferenceFailures.length, 1);
      assert.match(projectReferenceFailures[0]?.stderr ?? "", /admin-app-api/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("excludes archival specs only from the architecture and version denylist", () => {
    const workspaceRoot = createWorkspace();

    try {
      const retiredNode = ["Node", "22"].join(" ");
      writeText(workspaceRoot, ".prettierignore", "dist\ndocs/superpowers/**\n");
      writeText(
        workspaceRoot,
        "docs/superpowers/specs/historical-design.md",
        `${retiredNode}\nHistorical path: libs/backend/example/lib/src/lib/record.ts\n`,
      );

      assert.deepEqual(checkStaleReferences(workspaceRoot), []);
      const structuralFailures = checkDuplicatedLibrarySourceLibPaths(workspaceRoot);
      assert.equal(structuralFailures.length, 1);
      assert.equal(
        structuralFailures[0]?.file,
        "docs/superpowers/specs/historical-design.md:2",
      );
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("reads the archived-documentation exemption from .prettierignore rather than a compiled-in path", () => {
    const workspaceRoot = createWorkspace();

    try {
      const retiredNode = ["Node", "22"].join(" ");
      writeText(workspaceRoot, ".prettierignore", "dist\ndocs/archive/working-specs/**\n");
      writeText(
        workspaceRoot,
        "docs/archive/working-specs/historical-design.md",
        `${retiredNode}\n`,
      );
      writeText(workspaceRoot, "docs/superpowers/specs/historical-design.md", `${retiredNode}\n`);

      const failures = checkStaleReferences(workspaceRoot);

      assert.deepEqual(
        failures.map((failure) => failure.file),
        ["docs/superpowers/specs/historical-design.md:1"],
      );
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

describe("static-check package script tooling command guard", () => {
  it("rejects root scripts that reference unknown tooling commands", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "api:client": "pnpm --filter @repo/tooling tooling api client",
          },
        }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({ scripts: {} }),
      );

      const failures = checkPackageScriptReferences(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(
        failures[0].command,
        "package.json tooling command reference package.json#api:client",
      );
      assert.equal(failures[0].file, "package.json");
      assert.match(failures[0].stderr, /Unknown tooling command: api client/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts tooling invocations that resolve against the CLI command table", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({
          scripts: {
            "api:clients:check":
              "pnpm --filter @repo/tooling tooling api clients check",
            "format:changed":
              "pnpm --filter @repo/tooling tooling tooling changed-format-check",
            "check": "pnpm nrb closure run test -- --coverage",
            "dev:db": "pnpm nrb dev database",
            "bun:check":
              "bun run --bun packages/tooling/bin/repo-tooling.mjs tooling bun-compat",
            "docker:selected":
              "pnpm --filter @repo/tooling tooling docker selected up --no-build",
            "nrb": "pnpm --filter @repo/tooling tooling",
          },
        }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/package.json",
        JSON.stringify({
          scripts: {
            "static-check":
              "node --max-old-space-size=1024 ./bin/repo-tooling.mjs tooling static-check",
            tooling: "node ./bin/repo-tooling.mjs",
          },
        }),
      );
      writeText(
        workspaceRoot,
        "packages/tooling/bin/repo-tooling.mjs",
        "// CLI entry\n",
      );

      assert.deepEqual(checkPackageScriptReferences(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});


describe("static-check thin locale catalog guard", () => {
  // The namespace axis is discovered from the default locale in production, so the fixture declares
  // what it writes rather than importing a list the checker no longer owns.
  const thinLocaleCatalogFileNames = [
    "common/shared.json",
    "common/errors.json",
    "landing/app.json",
    "admin/shell.json",
    "admin/dashboard.json",
    "admin/users.json",
    "admin/audit.json",
    "admin/roles.json",
    "admin/navigation.json",
    "admin/feature-flags.json",
    "admin/notifications.json",
    "admin/notification-options.json",
    "admin/notification-navigation.json",
    "admin/problem-presentations.json",
    "admin/login-analytics.json",
    "user/shell.json",
    "user/site.json",
    "user/mobile.json",
    "user/auth.json",
    "user/social-auth.json",
    "user/tma.json",
    "bots/shared.json",
    "bots/telegram.json",
    "bots/discord.json",
  ] as const;

  function writeThinLocaleWorkspace(workspaceRoot: string): void {
    for (const locale of supportedLocales) {
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
      // Every translated locale declares its prose rules; the empty declaration is what a locale
      // with nothing locale-specific to say still has to write.
      if (locale !== "en") writeText(workspaceRoot, `i18n/${locale}/lint.json`, "{}\n");
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

  // The generator discovers namespaces from the default locale and says so: adding one is a file
  // drop, not an edit to this package. The guard used to disagree, so the first product catalog was
  // reported as an unexpected file by a merge-blocking gate.
  it("accepts a namespace the hardcoded list never knew", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      for (const locale of supportedLocales) {
        writeText(
          workspaceRoot,
          `i18n/${locale}/user/billing.json`,
          JSON.stringify({ "user.billing.title": `${locale}:billing` }, null, 2),
        );
      }

      assert.deepEqual(checkThinLocaleCatalogs(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // Discovery must not cost the parity guarantee: a namespace the default locale carries is still
  // required of every other locale.
  it("still requires every locale to carry a discovered namespace", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/en/user/billing.json",
        JSON.stringify({ "user.billing.title": "en:billing" }, null, 2),
      );

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => `${failure.file} ${failure.stderr}`)
        .join("\n");

      for (const locale of supportedLocales.filter((candidate) => candidate !== "en")) {
        assert.match(
          stderr,
          new RegExp(`i18n/${locale}/user/billing\\.json.*missing thin locale file`, "u"),
        );
      }
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // `isLocaleMetadataFile` recognises metadata by shape so a product can add a review ledger without
  // editing this package; the guard used to allow exactly one hardcoded name.
  it("accepts locale-root metadata by shape rather than by name", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      for (const locale of supportedLocales) {
        writeText(
          workspaceRoot,
          `i18n/${locale}/untranslated-allowlist.json`,
          JSON.stringify({ untranslatedKeys: [] }, null, 2),
        );
      }

      assert.deepEqual(checkThinLocaleCatalogs(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // The shape rule must stay narrow: inside a scope directory, JSON is a catalog, and one no other
  // locale carries is still drift.
  it("still reports a stray catalog only one locale carries", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/ru/user/stray.json",
        JSON.stringify({ "user.stray": "ru" }, null, 2),
      );

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => `${failure.file} ${failure.stderr}`)
        .join("\n");

      assert.match(stderr, /i18n\/ru\/user\/stray\.json.*unexpected locale JSON file/u);
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

  it("rejects a translation that drops, renames, or invents an interpolation placeholder", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "en:common/shared.json",
            "common.dropped": "{{count}} items",
            "common.renamed": "Hello {{name}}",
            "common.invented": "All done",
          },
          null,
          2,
        ),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "ru:common/shared.json",
            "common.dropped": "несколько элементов",
            "common.renamed": "Привет, {{имя}}",
            "common.invented": "Готово {{count}}",
          },
          null,
          2,
        ),
      );

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => failure.stderr)
        .join("\n");

      assert.match(stderr, /common\.dropped: expected \{\{count\}\}, received none/);
      assert.match(stderr, /common\.renamed: expected \{\{name\}\}, received \{\{имя\}\}/);
      assert.match(stderr, /common\.invented: expected none, received \{\{count\}\}/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts a translation that reorders placeholders without changing the set", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      for (const locale of supportedLocales) {
        writeText(
          workspaceRoot,
          `i18n/${locale}/common/shared.json`,
          JSON.stringify(
            {
              "common/shared.json.key": `${locale}:common/shared.json`,
              "common.reordered":
                locale === "en" ? "{{first}} then {{second}}" : "{{ second }} после {{first}}",
            },
            null,
            2,
          ),
        );
      }

      assert.deepEqual(checkThinLocaleCatalogs(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("applies orthography, foreign-prose, and untranslated rules a locale declares in lint.json", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "en:common/shared.json",
            "common.residue": "Settings",
            "common.prose": "Please save your settings",
            "common.reviewed": "Connect PostgreSQL",
            "common.api": "Settings API reference",
            "common.copied": "Discord",
            "common.pending": "Cancel",
          },
          null,
          2,
        ),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "ru:common/shared.json",
            "common.residue": "Созлаenglishъмалар",
            "common.prose": "Please save your settings",
            "common.reviewed": "PostgreSQL уланиш",
            "common.api": "Справочник Settings API",
            "common.copied": "Discord",
            "common.pending": "Cancel",
          },
          null,
          2,
        ),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/lint.json",
        JSON.stringify(
          {
            residuePatterns: [{ pattern: "[Гг]ъ|englishъ", label: "use ғ" }],
            foreignProseMarkers: ["please", "save", "settings", "cancel"],
            reviewedTechnicalTerms: ["PostgreSQL", "Discord", "Settings API"],
            untranslatedKeys: ["common.copied"],
          },
          null,
          2,
        ),
      );

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => failure.stderr)
        .join("\n");

      assert.match(stderr, /common\.residue: use ғ/);
      assert.match(stderr, /common\.prose: untranslated prose \(please, save, settings\)/);
      assert.match(stderr, /common\.pending: identical to the fallback locale/);
      // A reviewed technical term is not foreign prose — not even when a marker word sits inside
      // it — and a declared key may stay untranslated.
      assert.equal(/common\.reviewed/u.test(stderr), false);
      assert.equal(/common\.api/u.test(stderr), false);
      assert.equal(/common\.copied/u.test(stderr), false);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // Placeholder names are ASCII identifiers a developer picked; they are machinery, not prose. While
  // they reached the rules, a non-Latin locale could not state the rule it actually means
  // (`[A-Za-z]`) and had to write an adjacency hack, and a marker colliding with a placeholder name
  // was unsuppressable.
  it("does not inspect interpolation placeholders as prose", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(
        workspaceRoot,
        "i18n/en/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "en:common/shared.json",
            "common.failure": "Failed: {{error}}",
            "common.nested": "Owed: {{outer{inner}tail}}",
            "common.realProse": "Please save",
          },
          null,
          2,
        ),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/common/shared.json",
        JSON.stringify(
          {
            "common/shared.json.key": "ru:common/shared.json",
            "common.failure": "Сбой: {{error}}",
            "common.nested": "Долг: {{outer{inner}tail}}",
            "common.realProse": "Please save",
          },
          null,
          2,
        ),
      );
      writeText(
        workspaceRoot,
        "i18n/ru/lint.json",
        JSON.stringify(
          {
            residuePatterns: [{ pattern: "[A-Za-z]", label: "Latin residue" }],
            foreignProseMarkers: ["error", "please", "save"],
            reviewedTechnicalTerms: [],
            untranslatedKeys: [],
          },
          null,
          2,
        ),
      );

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => failure.stderr)
        .join("\n");

      assert.equal(/common\.failure/u.test(stderr), false);
      // Nested braces survive a single pass, so this case is what pins the fixed point.
      assert.equal(/common\.nested/u.test(stderr), false);
      // The strip must not become a blanket exemption: Latin prose outside any placeholder still fails.
      assert.match(stderr, /common\.realProse: Latin residue/u);
      assert.match(stderr, /common\.realProse: untranslated prose \(please, save\)/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("reports a non-default locale that declares no prose rules at all", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      rmSync(join(workspaceRoot, "i18n/ru/lint.json"), { force: true });

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => failure.stderr)
        .join("\n");

      assert.match(stderr, /i18n\/ru\/lint\.json: locale must declare its prose rules/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("reports a locale lint rule set that is unreadable rather than skipping it", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeThinLocaleWorkspace(workspaceRoot);
      writeText(workspaceRoot, "i18n/ru/lint.json", '{ "residuePatterns": [{ "pattern": "[" }] }');

      const stderr = checkThinLocaleCatalogs(workspaceRoot)
        .map((failure) => failure.stderr)
        .join("\n");

      assert.match(stderr, /i18n\/ru\/lint\.json/);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});

describe("static-check repository script spec coverage", () => {
  it("accepts specs a root script discovers by glob", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ scripts: { "test:scripts": 'node --test "scripts/**/*.spec.mjs"' } }),
      );
      writeText(workspaceRoot, "scripts/deploy.spec.mjs", "// spec\n");
      writeText(workspaceRoot, "scripts/ci/runtime-stack.spec.mjs", "// spec\n");

      assert.deepEqual(checkRepositoryScriptSpecCoverage(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  it("accepts a spec a root script names outright", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ scripts: { "docs:check": "node --test scripts/validate-doc-links.spec.mjs" } }),
      );
      writeText(workspaceRoot, "scripts/validate-doc-links.spec.mjs", "// spec\n");

      assert.deepEqual(checkRepositoryScriptSpecCoverage(workspaceRoot), []);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });

  // The enumerated `test:deploy` ran eleven of the sixteen repository specs and no lane ran it at
  // all, so five specs -- including the one guarding the runtime stack's start sequence -- were
  // dead weight nobody noticed. A list is the failure mode; this names what the list left out.
  it("reports a spec no root script runs", () => {
    const workspaceRoot = createWorkspace();

    try {
      writeText(
        workspaceRoot,
        "package.json",
        JSON.stringify({ scripts: { "test:deploy": "node --test scripts/deploy.spec.mjs" } }),
      );
      writeText(workspaceRoot, "scripts/deploy.spec.mjs", "// spec\n");
      writeText(workspaceRoot, "scripts/check-licenses.spec.mjs", "// spec\n");

      const failures = checkRepositoryScriptSpecCoverage(workspaceRoot);

      assert.equal(failures.length, 1);
      assert.equal(failures[0]?.file, "scripts/check-licenses.spec.mjs");
      assert.match(failures[0]?.stderr ?? "", /no root package\.json script runs it/u);
    } finally {
      removeWorkspace(workspaceRoot);
    }
  });
});
