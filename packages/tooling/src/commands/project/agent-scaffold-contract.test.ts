import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const workspaceRoot = process.cwd();
const read = (path: string): string => readFileSync(join(workspaceRoot, path), "utf8");

describe("agent scaffold contract", () => {
  it("routes every agent to one in-place-first scaffold workflow", () => {
    const rootPolicy = read("AGENTS.md");
    const skill = read(".agents/skills/scaffold-feature/SKILL.md");
    const contract = read("docs/scaffolding-and-extension.md");

    for (const [name, content] of [
      ["AGENTS.md", rootPolicy],
      ["scaffold skill", skill],
      ["scaffolding contract", contract],
    ] as const) {
      assert.match(content, /modify (?:that|the) owner in place/iu, `${name} must prefer existing ownership`);
      assert.match(content, /genuinely new (?:ownership|runtime or library ownership)/iu, `${name} must limit generation`);
      assert.match(content, /(?:nested copy|copy of (?:this|the) (?:boilerplate|repository))/iu, `${name} must forbid nesting`);
    }

    assert.match(rootPolicy, /Never create an adjacent clone/iu);
    assert.match(rootPolicy, /starter-app/iu);
    assert.match(rootPolicy, /app, library, and feature roots are never[\s\n]+overwritten/iu);
    assert.match(skill, /Never use `--force` or regenerate/iu);
    assert.match(contract, /Do not create a second scaffold path/iu);
    assert.match(contract, /Generator `--force` is disabled/iu);
  });

  it("does not teach feature regeneration through another documentation path", () => {
    for (const path of [
      "docs/first-feature-walkthrough.md",
      "docs/setup/cli-reference.md",
      "docs/setup/extending-generators.md",
      "docs/setup/migration.md",
      "docs/setup/troubleshooting.md",
    ]) {
      const content = read(path);
      const shellBlocks = [...content.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/giu)].map((match) => match[1]);
      for (const block of shellBlocks) {
        assert.doesNotMatch(
          block,
          /pnpm nrb add feature[\s\S]*--force/iu,
          `${path} must not instruct agents to regenerate a feature`,
        );
      }
    }
  });

  it("does not expose ownership-bypassing generator options", () => {
    for (const path of [
      "packages/tooling/src/generators/application/schema.json",
      "packages/tooling/src/generators/library/schema.json",
    ]) {
      const schema = JSON.parse(read(path)) as { properties: Record<string, unknown> };
      assert.equal("directory" in schema.properties, false, `${path} must derive the canonical root`);
      assert.equal("tags" in schema.properties, false, `${path} must derive ownership tags`);
    }

    const featureSchema = JSON.parse(read("packages/tooling/src/generators/feature/schema.json")) as {
      properties: Record<string, unknown>;
    };
    assert.equal("force" in featureSchema.properties, false, "feature schema must not advertise regeneration");
  });

  it("keeps tool-specific instruction files as redirect-only adapters", () => {
    assert.equal(
      read("CLAUDE.md"),
      "# Claude instructions\n\nUse the canonical repository instructions in [AGENTS.md](AGENTS.md). Detailed\npolicy lives in [docs/ai/agent-policy.md](docs/ai/agent-policy.md).\n",
    );
    assert.equal(read("CODEX.md"), "# Codex instructions\n\nUse the canonical repository instructions in [AGENTS.md](AGENTS.md).\n");
  });

  it("routes frontend and backend agents through matching skill chains", () => {
    const frontendApps = read("apps/frontend/AGENTS.md");
    const frontendLibraries = read("libs/frontend/AGENTS.md");
    const backendApps = read("apps/backend/AGENTS.md");
    const backendLibraries = read("libs/backend/AGENTS.md");
    const commonLibraries = read("libs/common/AGENTS.md");
    const e2eApps = read("apps/e2e/AGENTS.md");
    const catalog = read("docs/agent-skills.md");
    const workflows = read("docs/ai/agent-workflows.md");

    for (const [name, content] of [
      ["frontend apps", frontendApps],
      ["frontend libraries", frontendLibraries],
    ] as const) {
      assert.match(content, /\$plan-frontend-change/u, `${name} must route frontend planning`);
      assert.match(content, /\$validate-frontend-quality/u, `${name} must route frontend quality`);
    }
    assert.match(frontendApps, /\$develop-web-frontend/u);
    assert.match(frontendApps, /\$develop-mobile-frontend/u);

    for (const [name, content] of [
      ["backend apps", backendApps],
      ["backend libraries", backendLibraries],
    ] as const) {
      assert.match(content, /\$plan-backend-change/u, `${name} must route backend planning`);
      assert.match(content, /\$validate-backend-quality/u, `${name} must route backend quality`);
      assert.match(content, /\$develop-backend-api/u, `${name} must route API development`);
      assert.match(content, /\$develop-background-process/u, `${name} must route process development`);
    }

    for (const content of [commonLibraries, e2eApps]) {
      assert.match(content, /\$validate-frontend-quality/u);
      assert.match(content, /\$validate-backend-quality/u);
    }

    for (const skill of [
      "plan-frontend-change",
      "develop-web-frontend",
      "develop-mobile-frontend",
      "validate-frontend-quality",
      "plan-backend-change",
      "develop-backend-api",
      "develop-background-process",
      "validate-backend-quality",
    ]) {
      assert.match(catalog, new RegExp(`\\.agents/skills/${skill}/SKILL\\.md`, "u"));
      assert.match(workflows, new RegExp(`\\$${skill}`, "u"));
    }
  });
});
