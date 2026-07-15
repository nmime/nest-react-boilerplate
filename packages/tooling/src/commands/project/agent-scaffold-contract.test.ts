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
    assert.match(rootPolicy, /app and library roots are never overwritten/iu);
    assert.match(skill, /Never use `--force` as a shortcut/iu);
    assert.match(contract, /Do not create a second scaffold path/iu);
  });

  it("keeps tool-specific instruction files as redirect-only adapters", () => {
    assert.equal(
      read("CLAUDE.md"),
      "# Claude instructions\n\nUse the canonical repository instructions in [AGENTS.md](AGENTS.md). Detailed\npolicy lives in [docs/ai/agent-policy.md](docs/ai/agent-policy.md).\n",
    );
    assert.equal(read("CODEX.md"), "# Codex instructions\n\nUse the canonical repository instructions in [AGENTS.md](AGENTS.md).\n");
  });
});
