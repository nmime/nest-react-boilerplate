// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { run } from "../../runtime/process.ts";
import {
  type AliasImportSite,
  type CommitTree,
  parseLockfileImporters,
  parseTsconfigPaths,
  readCommitTree,
  resolveAliasTargets,
  validateCommitTree,
} from "./commit-tree.ts";
import { defaultGitConventionsConfig } from "./conventions-config.ts";

const lockfile = [
  "lockfileVersion: '9.0'",
  "",
  "settings:",
  "  autoInstallPeers: true",
  "",
  "importers:",
  "",
  "  .:",
  "    dependencies:",
  "      react:",
  "        specifier: ^19.0.0",
  "        version: 19.0.0",
  "",
  "  apps/frontend/landing:",
  "    dependencies: {}",
  "",
  "packages:",
  "",
  "  react@19.0.0:",
  "    resolution: {integrity: sha512-abc}",
  "",
].join("\n");

const tsconfig = JSON.stringify({
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@app/backend-feature-auth-shared": ["libs/backend/feature/auth/shared/lib/src/index.ts"],
      "@app/i18n-en-common/*": ["i18n/en/common/*"],
    },
  },
});

function fakeTree(files: Record<string, string>, aliasImports: AliasImportSite[] = []): CommitTree {
  return {
    hash: "abc1234",
    files: Object.keys(files),
    readFile: (path) => files[path] ?? null,
    aliasImports: () => aliasImports,
  };
}

describe("commit tree checks", () => {
  it("parses pnpm-lock importers and tsconfig path targets", () => {
    assert.deepEqual(parseLockfileImporters(lockfile), [".", "apps/frontend/landing"]);
    assert.deepEqual(parseTsconfigPaths(tsconfig), {
      "@app/backend-feature-auth-shared": ["libs/backend/feature/auth/shared/lib/src/index.ts"],
      "@app/i18n-en-common/*": ["i18n/en/common/*"],
    });
  });

  // TypeScript substitutes the captured tail into a target's `*` literally, and
  // `String.prototype.replace` with a string pattern does not: it reads `$&` in the replacement as
  // a back-reference to the match. A tail carrying `$&` therefore resolved to a path that does not
  // exist, and this gate rejected a commit whose imports are fine — the failure mode a commit gate
  // can least afford. A target carrying more than one `*` is deliberately not covered here: `tsc`
  // rejects that config outright (TS5062), so no reachable tsconfig can produce one.
  it("substitutes the captured tail literally rather than as a replacement pattern", () => {
    assert.deepEqual(resolveAliasTargets("@app/gen/a$&b", { "@app/gen/*": ["libs/*/src"] }), [
      "libs/a$&b/src",
    ]);
    assert.deepEqual(
      resolveAliasTargets("@app/i18n-en-common/errors.json", parseTsconfigPaths(tsconfig)),
      ["i18n/en/common/errors.json"],
    );
  });

  it("fails a commit whose lockfile declares an importer with no package.json", () => {
    const failures = validateCommitTree(
      fakeTree({ "pnpm-lock.yaml": lockfile, "package.json": "{}" }),
      defaultGitConventionsConfig(),
    );

    assert.equal(failures.length, 1);
    assert.match(failures[0] ?? "", /apps\/frontend\/landing\/package\.json/u);
  });

  it("fails a commit whose tsconfig path target is absent from the tree", () => {
    const config = defaultGitConventionsConfig();
    const files = {
      "tsconfig.base.json": tsconfig,
      "i18n/en/common/errors.json": "{}",
    };

    const failures = validateCommitTree(fakeTree(files), config);

    assert.equal(failures.length, 1);
    assert.match(failures[0] ?? "", /@app\/backend-feature-auth-shared/u);
    assert.deepEqual(
      validateCommitTree(
        fakeTree({ ...files, "libs/backend/feature/auth/shared/lib/src/index.ts": "export {};" }),
        config,
      ),
      [],
    );
  });

  it("fails an @app import whose target does not exist in the same tree", () => {
    const config = defaultGitConventionsConfig();
    const files = {
      "tsconfig.base.json": tsconfig,
      "libs/backend/feature/auth/shared/lib/src/index.ts": "export {};",
      "i18n/en/common/errors.json": "{}",
    };
    const dangling: AliasImportSite[] = [
      {
        path: "libs/backend/mongodb/main/auth/lib/src/auth-mongo-admin.repository.ts",
        line: 16,
        specifier: "@app/backend-feature-farmer-shared",
      },
    ];
    const resolvable: AliasImportSite[] = [
      { path: "apps/backend/auth/src/main.ts", line: 3, specifier: "@app/backend-feature-auth-shared" },
      { path: "apps/backend/auth/src/main.ts", line: 4, specifier: "@app/i18n-en-common/errors.json" },
    ];

    const failures = validateCommitTree(fakeTree(files, dangling), config);

    assert.equal(failures.length, 1);
    assert.match(failures[0] ?? "", /auth-mongo-admin\.repository\.ts:16/u);
    assert.match(failures[0] ?? "", /@app\/backend-feature-farmer-shared/u);
    assert.deepEqual(validateCommitTree(fakeTree(files, resolvable), config), []);
  });

  it("keeps configured fixture paths out of the alias scan", () => {
    const config = defaultGitConventionsConfig();
    const fixture: AliasImportSite[] = [
      {
        path: "packages/tooling/src/commands/tooling/static-check.test.ts",
        line: 10,
        specifier: "@app/backend-feature-does-not-exist",
      },
    ];

    assert.deepEqual(
      validateCommitTree(fakeTree({ "tsconfig.base.json": tsconfig }, fixture), {
        ...config,
        tree: { ...config.tree, tsconfigPathTargets: false },
      }),
      [],
    );
  });

  it("reads a real commit tree without checking anything out", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-commit-tree-"));
    try {
      const git = (args: string[]): void => {
        const result = run("git", args, { cwd: root });
        if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
      };
      const write = (path: string, content: string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
      };

      git(["init", "--initial-branch=main"]);
      git(["config", "user.email", "owner@example.com"]);
      git(["config", "user.name", "owner"]);
      write("pnpm-lock.yaml", lockfile);
      write("package.json", "{}");
      write("tsconfig.base.json", tsconfig);
      write("apps/backend/auth/src/main.ts", "import { session } from '@app/backend-feature-auth-shared';\n");
      git(["add", "."]);
      git(["commit", "-m", "feat(auth): add the auth app"]);
      const broken = run("git", ["rev-parse", "HEAD"], { cwd: root }).stdout.trim();

      write("libs/backend/feature/auth/shared/lib/src/index.ts", "export const session = 1;\n");
      write("apps/frontend/landing/package.json", "{}");
      write("i18n/en/common/errors.json", "{}");
      git(["add", "."]);
      git(["commit", "-m", "feat(auth): add the shared auth library"]);
      const fixed = run("git", ["rev-parse", "HEAD"], { cwd: root }).stdout.trim();

      const config = defaultGitConventionsConfig();
      // One missing importer manifest, two dangling tsconfig targets (the library and the locale
      // directory), and the import site that consumes the library a commit too early.
      const brokenFailures = validateCommitTree(readCommitTree(root, broken, config), config);
      assert.equal(brokenFailures.length, 4, brokenFailures.join("\n"));
      assert.match(brokenFailures.join("\n"), /apps\/frontend\/landing\/package\.json/u);
      assert.match(brokenFailures.join("\n"), /apps\/backend\/auth\/src\/main\.ts:1/u);

      assert.deepEqual(validateCommitTree(readCommitTree(root, fixed, config), config), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
