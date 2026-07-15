import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveFullstackSelection } from "./fullstack.ts";

describe("dev fullstack selection", () => {
  it("uses setup output when present", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    try {
      mkdirSync(join(root, ".nrb"));
      writeFileSync(
        join(root, ".nrb", "workspace.json"),
        JSON.stringify({ apps: ["user-app", "user-app-api", "fullstack-e2e"], capabilities: ["postgres"] }),
      );
      assert.deepEqual(resolveFullstackSelection(root), {
        projects: ["user-app", "user-app-api"],
        capabilities: ["postgres"],
        source: "setup",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts every core deployable before setup", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-fullstack-"));
    try {
      assert.deepEqual(resolveFullstackSelection(root), {
        projects: [
          "admin-app",
          "admin-app-api",
          "auth-app-api",
          "landing-app",
          "mobile-app",
          "site-app",
          "user-app",
          "user-app-api",
        ],
        capabilities: ["authz", "design-tokens", "i18n", "otel", "postgres", "redis", "swagger"],
        source: "core",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
