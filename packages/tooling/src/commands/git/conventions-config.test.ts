// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  defaultGitConventionsConfig,
  loadGitConventionsConfig,
  matchesPathPattern,
  resolveGitConventionsConfig,
} from "./conventions-config.ts";

describe("git conventions config", () => {
  it("returns defaults when no override is supplied", () => {
    const config = resolveGitConventionsConfig(undefined);

    assert.deepEqual(config, defaultGitConventionsConfig());
    assert.ok(config.size.maxFilesChanged > 0);
    assert.ok(config.size.maxInsertions > 0);
  });

  it("overrides only the thresholds a product sets", () => {
    const config = resolveGitConventionsConfig({
      size: { maxFilesChanged: 5 },
      tree: { aliasImports: false },
    });

    assert.equal(config.size.maxFilesChanged, 5);
    assert.equal(config.size.maxInsertions, defaultGitConventionsConfig().size.maxInsertions);
    assert.equal(config.tree.aliasImports, false);
    assert.equal(config.tree.lockfileImporters, true);
  });

  it("rejects unknown keys and wrong value types instead of ignoring them", () => {
    assert.throws(() => resolveGitConventionsConfig({ size: {} }), /gitConventions\.size/u);
    assert.throws(
      () => resolveGitConventionsConfig({ size: { maxFilesChanged: "many" } }),
      /gitConventions\.size\.maxFilesChanged/u,
    );
  });

  it("reads the gitConventions key of nrb.config.json", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-git-conventions-config-"));
    try {
      writeFileSync(
        join(root, "nrb.config.json"),
        JSON.stringify({ schemaVersion: "1.0.0", gitConventions: { body: { maxSubjectLength: 42 } } }),
      );

      assert.equal(loadGitConventionsConfig(root).body.maxSubjectLength, 42);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to defaults when the workspace has no nrb.config.json", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-git-conventions-config-"));
    try {
      assert.deepEqual(loadGitConventionsConfig(root), defaultGitConventionsConfig());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("matches generated path patterns by glob segment", () => {
    assert.equal(matchesPathPattern("libs/common/api-contracts/lib/src/generated/user.ts", "**/generated/**"), true);
    assert.equal(matchesPathPattern("apps/backend/auth/src/capabilities.generated.ts", "**/*.generated.*"), true);
    assert.equal(matchesPathPattern("pnpm-lock.yaml", "pnpm-lock.yaml"), true);
    assert.equal(matchesPathPattern("libs/common/api-contracts/lib/src/index.ts", "**/generated/**"), false);
    assert.equal(matchesPathPattern("libs/generated-docs/index.ts", "**/generated/**"), false);
  });
});
