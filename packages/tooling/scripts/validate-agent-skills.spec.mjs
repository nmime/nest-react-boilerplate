import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';

import { parseSkillFrontmatter, validateSkillsRoot } from './validate-agent-skills.mjs';

const temporaryRoots = [];

async function createRoot() {
  const root = await mkdtemp(resolve(tmpdir(), 'nrb-agent-skills-'));
  temporaryRoots.push(root);
  return root;
}

async function writeSkill(root, name, overrides = {}) {
  const skillDirectory = resolve(root, name);
  await mkdir(resolve(skillDirectory, 'agents'), { recursive: true });
  await writeFile(
    resolve(skillDirectory, 'SKILL.md'),
    overrides.skill ??
      `---
name: ${name}
description: Follow the repository-owned workflow for this bounded task. Use for changes that require its specialized ownership and verification rules.
---

# Example

## Read first

Read the canonical owner and current tests.

## Workflow

Inspect the owner, implement the change, and verify it.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  );
  await writeFile(
    resolve(skillDirectory, 'agents/openai.yaml'),
    overrides.openAi ??
      `interface:
  display_name: "Example Skill"
  short_description: "Follow a repository-owned workflow"
  default_prompt: "Use $${name} to complete this bounded repository task."
`,
  );
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

test('parseSkillFrontmatter reads required scalar metadata', () => {
  const metadata = parseSkillFrontmatter(`---
name: example-skill
description: Example description
---
`);
  assert.equal(metadata.get('name').value, 'example-skill');
  assert.equal(metadata.get('description').value, 'Example description');
});

test('parseSkillFrontmatter rejects duplicate scalar metadata', () => {
  assert.throws(
    () =>
      parseSkillFrontmatter(`---
name: example-skill
name: duplicate-skill
description: Example description
---
`),
    /duplicate scalar metadata key name/u,
  );
});

test('validateSkillsRoot accepts a complete skill package', async () => {
  const root = await createRoot();
  await writeSkill(root, 'example-skill');
  assert.deepEqual(await validateSkillsRoot(root), []);
});

test('validateSkillsRoot reports discoverability and packaging errors', async () => {
  const root = await createRoot();
  await writeSkill(root, 'wrong-directory', {
    skill: `---
name: another-name
description: TODO
license: unsupported
---
`,
    openAi: `interface:
  display_name: Unquoted
  short_description: "Too short"
  default_prompt: "Complete the task."
`,
  });
  await writeFile(resolve(root, 'wrong-directory/README.md'), 'extra');

  const errors = await validateSkillsRoot(root);
  assert.ok(errors.some((error) => error.includes('must match directory')));
  assert.ok(errors.some((error) => error.includes('unfinished placeholders')));
  assert.ok(errors.some((error) => error.includes('unsupported frontmatter field')));
  assert.ok(errors.some((error) => error.includes('unsupported skill documentation')));
  assert.ok(errors.some((error) => error.includes('display_name must be quoted')));
  assert.ok(errors.some((error) => error.includes('25-64 characters')));
  assert.ok(errors.some((error) => error.includes('default_prompt must mention')));
});

test('validateSkillsRoot reports workflow quality and broken reference errors', async () => {
  const root = await createRoot();
  await writeSkill(root, 'weak-skill', {
    skill: `---
name: weak-skill
description: Generic short instructions without a trigger.
---

# Weak

Use this skill for everything. Read \`../missing/README.md\`.
`,
  });

  const errors = await validateSkillsRoot(root);
  assert.ok(errors.some((error) => error.includes('description must be 80-400 characters')));
  assert.ok(errors.some((error) => error.includes('must state when to use')));
  assert.ok(errors.some((error) => error.includes('missing "## Read first"')));
  assert.ok(errors.some((error) => error.includes('missing verification')));
  assert.ok(errors.some((error) => error.includes('move trigger guidance')));
  assert.ok(errors.some((error) => error.includes('missing referenced file')));
});

test('validateSkillsRoot enforces minimal interface metadata structure', async () => {
  const root = await createRoot();
  await writeSkill(root, 'interface-skill', {
    openAi: `policy:
  allow_implicit_invocation: true
interface:
  display_name: "Interface Skill"
  short_description: "Follow the repository-owned workflow"
  default_prompt: "Use $interface-skill to complete this task"
  icon_small: "./assets/icon.png"
`,
  });
  await writeSkill(root, 'duplicate-interface', {
    openAi: `interface:
  display_name: "Interface Skill"
  display_name: "Duplicate"
  short_description: "Follow the repository-owned workflow"
  default_prompt: "Use $duplicate-interface to complete this task."
`,
  });

  const errors = await validateSkillsRoot(root);
  assert.ok(errors.some((error) => error.includes('must start with the interface mapping')));
  assert.ok(errors.some((error) => error.includes('unsupported interface structure or field')));
  assert.ok(errors.some((error) => error.includes('duplicate display_name')));
  assert.ok(errors.some((error) => error.includes('default_prompt must end')));
});

test('validateSkillsRoot requires catalog and workflow discovery', async () => {
  const root = await createRoot();
  await writeSkill(root, 'example-skill');
  const catalogPath = resolve(root, 'agent-skills.md');
  const workflowsPath = resolve(root, 'agent-workflows.md');
  await writeFile(catalogPath, '# Skills\n');
  await writeFile(workflowsPath, '# Workflows\n');

  const missing = await validateSkillsRoot(root, { catalogPath, workflowsPath });
  assert.ok(missing.some((error) => error.includes('missing from docs/agent-skills.md')));
  assert.ok(missing.some((error) => error.includes('missing from docs/ai/agent-workflows.md')));

  await writeFile(catalogPath, '[Skill](../.agents/skills/example-skill/SKILL.md)\n');
  await writeFile(workflowsPath, 'Use `$example-skill`.\n');
  assert.deepEqual(await validateSkillsRoot(root, { catalogPath, workflowsPath }), []);
});
