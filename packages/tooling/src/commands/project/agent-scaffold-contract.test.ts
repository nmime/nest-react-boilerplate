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
});
