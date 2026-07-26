// @requirements REQ-SCAFFOLD-AGENTS-007
// Evidence for: REQ-ASSURANCE-WORKFLOW-005 REQ-SCAFFOLD-AGENTS-007
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

## Specification lifecycle

Establish observable behavior with $specify-behavior and synchronize approved
implementation and evidence through $implement-specified-change.

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

test('validateSkillsRoot rejects non-repository-relative Read-first paths', async () => {
  const root = await createRoot();
  await writeSkill(root, 'bare-path-skill', {
    skill: `---
name: bare-path-skill
description: Follow the repository-owned workflow for this bounded task. Use for changes that require its specialized ownership and verification rules.
---

# Example

## Read first

- Read \`docs/architecture.md\` and \`../../../AGENTS.md\` before editing.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  });

  const errors = await validateSkillsRoot(root);
  assert.ok(
    errors.some((error) => error.includes('docs/architecture.md') && error.includes('repository-relative')),
    `expected a repository-relative Read-first error, got: ${JSON.stringify(errors)}`,
  );
});

test('validateSkillsRoot does not flag prefixed Read-first paths or repo-root prose outside Read first', async () => {
  const root = await createRoot();
  await writeSkill(root, 'relative-path-skill', {
    skill: `---
name: relative-path-skill
description: Follow the repository-owned workflow for this bounded task. Use for changes that require its specialized ownership and verification rules.
---

# Example

## Read first

- Read the canonical owner, current tests, both \`components.json\` files (root and \`libs/frontend\`), and the nearest \`AGENTS.md\` files.

## Workflow

Make the document reachable from \`docs/README.md\` and register it in \`docs/agent-skills.md\`.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  });

  const errors = await validateSkillsRoot(root);
  assert.ok(
    !errors.some((error) => error.includes('repository-relative')),
    `expected no repository-relative error, got: ${JSON.stringify(errors)}`,
  );
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
  assert.ok(missing.some((error) => error.includes('expected exactly one docs/agent-skills.md')));
  assert.ok(missing.some((error) => error.includes('expected exactly one docs/ai/agent-workflows.md')));

  await writeFile(catalogPath, '[Skill](../.agents/skills/example-skill/SKILL.md)\n');
  await writeFile(workflowsPath, 'Mentioned outside the selector: `$example-skill`.\n');
  const buried = await validateSkillsRoot(root, { catalogPath, workflowsPath });
  assert.ok(
    buried.some((error) => error.includes('docs/ai/agent-workflows.md selector row') && error.includes('found 0')),
  );

  await writeFile(
    workflowsPath,
    '| Task | Use | Owner |\n| --- | --- | --- |\n| Example | `$example-skill` | owner |\n',
  );
  assert.deepEqual(await validateSkillsRoot(root, { catalogPath, workflowsPath }), []);

  await writeFile(
    catalogPath,
    '[Skill](../.agents/skills/example-skill/SKILL.md)\n[Duplicate](../.agents/skills/example-skill/SKILL.md)\n',
  );
  const duplicated = await validateSkillsRoot(root, { catalogPath, workflowsPath });
  assert.ok(
    duplicated.some((error) => error.includes('docs/agent-skills.md catalog entry') && error.includes('found 2')),
  );
});

test('validateSkillsRoot requires behavior skills to route through the specification lifecycle', async () => {
  const root = await createRoot();
  await writeSkill(root, 'develop-backend-api', {
    skill: `---
name: develop-backend-api
description: Implement backend behavior within repository runtime contracts. Use for controllers, DTOs, domain services, errors, request context, and API-focused tests.
---

# Develop a backend API

## Read first

Read the canonical owner and current tests.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  });

  const errors = await validateSkillsRoot(root);

  assert.ok(errors.some((error) => error.includes('missing "## Specification lifecycle"')));
  assert.ok(errors.some((error) => error.includes('$specify-behavior')));
  assert.ok(errors.some((error) => error.includes('$implement-specified-change')));
});

test('validateSkillsRoot requires assurance skills to route through independent review', async () => {
  const root = await createRoot();
  await writeSkill(root, 'validate-change');

  const errors = await validateSkillsRoot(root);

  assert.ok(errors.some((error) => error.includes('$review-specification-assurance')));
});

test('validateSkillsRoot rejects lifecycle routing outside its owned section', async () => {
  const root = await createRoot();
  await writeSkill(root, 'behavior-skill', {
    skill: `---
name: behavior-skill
description: Change product behavior within repository ownership boundaries. Use when implementing observable behavior that requires synchronized requirements and evidence.
---

# Change behavior

## Read first

Read $specify-behavior and $implement-specified-change before editing.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  });

  const errors = await validateSkillsRoot(root);

  assert.ok(errors.some((error) => error.includes('missing "## Specification lifecycle"')));
  assert.ok(errors.some((error) => error.includes('$specify-behavior')));
  assert.ok(errors.some((error) => error.includes('$implement-specified-change')));
});

test('validateSkillsRoot rejects hard-coded toolchain versions in skills', async () => {
  const root = await createRoot();
  await writeSkill(root, 'versioned-skill', {
    skill: `---
name: versioned-skill
description: Maintain a version-sensitive repository workflow safely. Use when the task must follow current runtime and package-manager policy.
---

# Maintain a workflow

## Read first

Use Node 24 and pnpm 11.11 before inspecting the canonical owner.

## Specification lifecycle

Establish observable behavior with $specify-behavior and synchronize it through
$implement-specified-change.

## Verification

Run the narrowest check that proves the requested behavior.
`,
  });

  const errors = await validateSkillsRoot(root);

  assert.ok(errors.some((error) => error.includes('read toolchain versions from root policy')));
  assert.ok(errors.some((error) => error.includes('Node 24')));
  assert.ok(errors.some((error) => error.includes('pnpm 11.11')));
});

test('validateSkillsRoot enforces unique interface names and live root scripts', async () => {
  const root = await createRoot();
  await writeSkill(root, 'first-skill', {
    openAi: `interface:
  display_name: "Duplicated Display"
  short_description: "Follow the first repository workflow"
  default_prompt: "Use $first-skill to complete this repository task."
`,
    skill: `---
name: first-skill
description: Maintain the first repository workflow safely and deterministically. Use when its specialized owner, command, and validation contract are required.
---

# First workflow

## Read first

Read the canonical owner and current tests.

## Specification lifecycle

Establish observable behavior with $specify-behavior and synchronize it through
$implement-specified-change.

## Verification

Run \`pnpm run known:check\` and \`pnpm run missing:check\`.
`,
  });
  await writeSkill(root, 'second-skill', {
    openAi: `interface:
  display_name: "Duplicated Display"
  short_description: "Follow the second repository workflow"
  default_prompt: "Use $second-skill to complete this repository task."
`,
  });
  const packageJsonPath = resolve(root, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify({ scripts: { 'known:check': 'node --test' } }));

  const errors = await validateSkillsRoot(root, { packageJsonPath });

  assert.ok(errors.some((error) => error.includes('duplicates first-skill')));
  assert.ok(errors.some((error) => error.includes('root script "missing:check" is missing')));
  assert.ok(!errors.some((error) => error.includes('root script "known:check" is missing')));
});
