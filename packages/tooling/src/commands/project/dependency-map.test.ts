// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  buildWorkspaceDependencyMap,
  formatWorkspaceDependencyMap,
  normalizeWorkspacePath,
} from "./dependency-map";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

describe("workspace dependency map", () => {
  it("groups live workspace manifests and dependency counts by owning scope", () => {
    const root = createWorkspace();
    writeManifest(root, "package.json", "example", { react: "1.0.0" }, { typescript: "1.0.0" });
    writeManifest(root, "libs/backend/package.json", "@app/backend", { fastify: "1.0.0", pg: "1.0.0" }, {});
    writeManifest(root, "libs/backend/ignored/package.json", "ignored", { bad: "1.0.0" }, {});
    writeManifest(root, "apps/frontend/docs/package.json", undefined, {}, { astro: "1.0.0" });

    const map = buildWorkspaceDependencyMap(root);

    assert.equal(map.workspaceCount, 3);
    assert.deepEqual(
      map.scopes.map(({ scope, workspaceCount }) => ({ scope, workspaceCount })),
      [
        { scope: "apps/frontend", workspaceCount: 1 },
        { scope: "libs/backend", workspaceCount: 1 },
        { scope: "root", workspaceCount: 1 },
      ],
    );
    assert.match(formatWorkspaceDependencyMap(map), /libs\/common\/\*\* \| package\.json/u);
  });

  it("rejects a workspace without pnpm package patterns", () => {
    const root = createWorkspace("overrides: {}\n");
    assert.throws(() => buildWorkspaceDependencyMap(root), /must declare at least one packages pattern/u);
  });

  it("rejects malformed dependency sections with the owning manifest path", () => {
    const root = createWorkspace();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "example", dependencies: [] }));
    assert.throws(() => buildWorkspaceDependencyMap(root), /package\.json: dependencies must be an object/u);
  });

  it("is deterministic across repeated runs and normalizes platform separators", () => {
    const root = createWorkspace();
    writeManifest(root, "package.json", "example", { zed: "1", alpha: "1" }, {});
    assert.deepEqual(buildWorkspaceDependencyMap(root), buildWorkspaceDependencyMap(root));
    assert.equal(normalizeWorkspacePath("libs\\backend\\package.json"), "libs/backend/package.json");
  });
});

function createWorkspace(workspaceConfig = "packages:\n  - 'apps/frontend/*'\n  - 'libs/backend'\n"): string {
  const root = mkdtempSync(join(tmpdir(), "dependency-map-"));
  workspaces.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), workspaceConfig);
  return root;
}

function writeManifest(
  root: string,
  path: string,
  name: string | undefined,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, JSON.stringify({ ...(name ? { name } : {}), dependencies, devDependencies }, null, 2));
}
