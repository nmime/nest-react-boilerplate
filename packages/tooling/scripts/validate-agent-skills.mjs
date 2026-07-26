#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-WORKFLOW-005 REQ-SCAFFOLD-AGENTS-007

import { access, readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const metadataKeyPattern = /^[a-z_]+$/;
const forbiddenFiles = new Set(['CHANGELOG.md', 'INSTALLATION.md', 'QUICK_REFERENCE.md', 'README.md']);
const interfaceKeys = new Set(['default_prompt', 'display_name', 'short_description']);
// Fail closed: a new skill must route through specification unless reviewers
// deliberately classify it as a non-behavior workflow here.
const specificationLifecycleExemptSkills = new Set([
  'implement-specified-change',
  'initialize-product',
  'pr-review',
  'review-specification-assurance',
  'service-audit',
  'specify-behavior',
  'validate-backend-quality',
  'validate-change',
  'validate-frontend-quality',
]);
const assuranceReviewSkills = new Set([
  'pr-review',
  'service-audit',
  'validate-backend-quality',
  'validate-change',
  'validate-frontend-quality',
]);
const hardcodedToolchainPattern = /\b(?:Node(?:\.js)?|pnpm)\s+v?\d+(?:\.\d+){0,2}\b/gu;

function parseFlatYaml(source, label) {
  const values = new Map();
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!metadataKeyPattern.test(key) || rawValue === '') continue;
    if (values.has(key)) throw new Error(`${label}:${index + 1}: duplicate scalar metadata key ${key}`);
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"));
    values.set(key, {
      line: index + 1,
      quoted,
      value: quoted ? rawValue.slice(1, -1) : rawValue,
    });
  }
  if (values.size === 0) {
    throw new Error(`${label}: no scalar metadata found`);
  }
  return values;
}

export function parseSkillFrontmatter(source, label = 'SKILL.md') {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) throw new Error(`${label}: missing YAML frontmatter`);
  return parseFlatYaml(match[1], label);
}

function requireValue(values, key, label, errors) {
  const item = values.get(key);
  if (!item?.value.trim()) {
    errors.push(`${label}: missing ${key}`);
    return undefined;
  }
  return item;
}

function validateSkillMetadata(metadata, directoryName, errors) {
  const label = `${directoryName}/SKILL.md`;
  const name = requireValue(metadata, 'name', label, errors);
  const description = requireValue(metadata, 'description', label, errors);
  for (const key of metadata.keys()) {
    if (key !== 'name' && key !== 'description') {
      errors.push(`${label}: unsupported frontmatter field ${key}`);
    }
  }
  if (!name) return;
  if (!skillNamePattern.test(name.value) || name.value.length > 64) {
    errors.push(`${label}: invalid skill name "${name.value}"`);
  }
  if (name.value !== directoryName) {
    errors.push(`${label}: name "${name.value}" must match directory`);
  }
  if (description) {
    if (description.value.length < 80 || description.value.length > 400) {
      errors.push(`${label}: description must be 80-400 characters`);
    }
    if (!/\bUse (?:for|when|after|before)\b/u.test(description.value)) {
      errors.push(`${label}: description must state when to use the skill`);
    }
  }
}

function sectionSource(skillSource, heading) {
  const lines = skillSource.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function validateCoreSkillStructure(skillSource, directoryName, errors) {
  if (skillSource.split(/\r?\n/u).length > 500) {
    errors.push(`${directoryName}/SKILL.md: exceeds 500 lines`);
  }
  if (/\b(?:TODO|TBD)\b|\[TODO\]/u.test(skillSource)) {
    errors.push(`${directoryName}/SKILL.md: contains unfinished placeholders`);
  }
  if (!/^## Read first\s*$/mu.test(skillSource)) {
    errors.push(`${directoryName}/SKILL.md: missing "## Read first" context section`);
  }
  if (
    !/^## (?:Verification(?: and boundary)?|Validation|Completion contract|Handoff|Plan output|Output format|Report)\s*$/mu.test(
      skillSource,
    )
  ) {
    errors.push(`${directoryName}/SKILL.md: missing verification, handoff, or output contract section`);
  }
  if (/\bUse this (?:skill|workflow)\b/iu.test(skillSource)) {
    errors.push(`${directoryName}/SKILL.md: move trigger guidance into the frontmatter description`);
  }
}

function validateToolchainClaims(skillSource, directoryName, errors) {
  const hardcodedToolchains = [...skillSource.matchAll(hardcodedToolchainPattern)].map((match) => match[0]);
  if (hardcodedToolchains.length > 0) {
    errors.push(
      `${directoryName}/SKILL.md: read toolchain versions from root policy instead of hard-coding ${[
        ...new Set(hardcodedToolchains),
      ].join(', ')}`,
    );
  }
}

function validateSpecificationLifecycle(skillSource, directoryName, errors) {
  if (specificationLifecycleExemptSkills.has(directoryName)) return;
  const lifecycle = sectionSource(skillSource, 'Specification lifecycle');
  if (lifecycle === undefined) {
    errors.push(`${directoryName}/SKILL.md: missing "## Specification lifecycle" section`);
  }
  for (const requiredSkill of ['$specify-behavior', '$implement-specified-change']) {
    if (!lifecycle?.includes(requiredSkill)) {
      errors.push(`${directoryName}/SKILL.md: behavior workflow must route through ${requiredSkill}`);
    }
  }
}

function validateAssuranceRouting(skillSource, directoryName, errors) {
  if (!assuranceReviewSkills.has(directoryName)) return;
  const assurance = sectionSource(skillSource, 'Specification assurance');
  if (assurance === undefined) {
    errors.push(`${directoryName}/SKILL.md: missing "## Specification assurance" section`);
  }
  if (!assurance?.includes('$review-specification-assurance')) {
    errors.push(`${directoryName}/SKILL.md: assurance workflow must route through $review-specification-assurance`);
  }
}

function validateSkillSource(skillSource, directoryName, errors) {
  validateCoreSkillStructure(skillSource, directoryName, errors);
  validateToolchainClaims(skillSource, directoryName, errors);
  validateSpecificationLifecycle(skillSource, directoryName, errors);
  validateAssuranceRouting(skillSource, directoryName, errors);
}

const rootedReadFirstPathPattern = /`((?:docs|packages|libs|apps|scripts|tools)\/[^`\r\n]+\.md)`/gu;

function validateReadFirstPaths(skillSource, directoryName, errors) {
  const lines = skillSource.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^## Read first\s*$/u.test(line));
  if (start === -1) return;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /u.test(lines[index])) {
      end = index;
      break;
    }
  }
  const section = lines.slice(start + 1, end).join('\n');
  const seen = new Set();
  for (const match of section.matchAll(rootedReadFirstPathPattern)) {
    const reference = match[1];
    if (seen.has(reference)) continue;
    seen.add(reference);
    errors.push(
      `${directoryName}/SKILL.md: Read-first reference \`${reference}\` must be repository-relative (prefix with ../../../)`,
    );
  }
}

async function validateLocalReferences(skillSource, skillDirectory, directoryName, errors) {
  const references = new Set(
    [...skillSource.matchAll(/`((?:\.\.\/)+[^`\r\n]+\.(?:json|md|ya?ml))`/gu)].map((match) => match[1]),
  );
  for (const reference of references) {
    try {
      await access(resolve(skillDirectory, reference));
    } catch {
      errors.push(`${directoryName}/SKILL.md: missing referenced file ${reference}`);
    }
  }
}

async function validateSkillFiles(skillDirectory, directoryName, errors) {
  let entries = [];
  try {
    entries = await readdir(skillDirectory);
  } catch {
    errors.push(`${directoryName}: cannot read skill directory`);
  }
  for (const entry of entries) {
    if (forbiddenFiles.has(entry)) {
      errors.push(`${directoryName}/${entry}: unsupported skill documentation file`);
    }
  }
}

function validateOpenAiMetadata(openAi, directoryName, errors) {
  const label = `${directoryName}/agents/openai.yaml`;
  const displayName = requireValue(openAi, 'display_name', label, errors);
  const shortDescription = requireValue(openAi, 'short_description', label, errors);
  const defaultPrompt = requireValue(openAi, 'default_prompt', label, errors);
  for (const [key, item] of [
    ['display_name', displayName],
    ['short_description', shortDescription],
    ['default_prompt', defaultPrompt],
  ]) {
    if (item && !item.quoted) errors.push(`${label}:${item.line}: ${key} must be quoted`);
  }
  validateMetadataLength(displayName, 'display_name', 3, 48, label, errors);
  validateMetadataLength(shortDescription, 'short_description', 25, 64, label, errors);
  validateDefaultPrompt(defaultPrompt, directoryName, label, errors);
}

function validateMetadataLength(item, key, minimum, maximum, label, errors) {
  if (item && (item.value.length < minimum || item.value.length > maximum)) {
    errors.push(`${label}: ${key} must be ${minimum}-${maximum} characters`);
  }
}

function validateDefaultPrompt(defaultPrompt, directoryName, label, errors) {
  if (defaultPrompt && !defaultPrompt.value.includes(`$${directoryName}`)) {
    errors.push(`${label}: default_prompt must mention $${directoryName}`);
  }
  if (defaultPrompt && !defaultPrompt.value.startsWith(`Use $${directoryName}`)) {
    errors.push(`${label}: default_prompt must start with "Use $${directoryName}"`);
  }
  if (defaultPrompt && !/[.!?]$/u.test(defaultPrompt.value)) {
    errors.push(`${label}: default_prompt must end with sentence punctuation`);
  }
  if (defaultPrompt && defaultPrompt.value.length > 200) {
    errors.push(`${label}: default_prompt must not exceed 200 characters`);
  }
}

function validateOpenAiSource(source, directoryName, errors) {
  const label = `${directoryName}/agents/openai.yaml`;
  const lines = source.split(/\r?\n/u).filter((line) => line.trim() !== '');
  const interfaceIndex = lines.indexOf('interface:');
  if (interfaceIndex === -1) {
    errors.push(`${label}: missing interface mapping`);
    return;
  }
  if (interfaceIndex !== 0) {
    errors.push(`${label}: must start with the interface mapping`);
  }
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    if (index === interfaceIndex) continue;
    const key = line.match(/^ {2}([a-z_]+):\s+\S/u)?.[1];
    if (!key || !interfaceKeys.has(key)) {
      errors.push(`${label}:${index + 1}: unsupported interface structure or field`);
      continue;
    }
    if (seen.has(key)) errors.push(`${label}:${index + 1}: duplicate ${key}`);
    seen.add(key);
  }
}

export async function validateSkillDirectory(skillDirectory) {
  const errors = [];
  const directoryName = basename(skillDirectory);
  const skillPath = resolve(skillDirectory, 'SKILL.md');
  const openAiPath = resolve(skillDirectory, 'agents/openai.yaml');

  let skillSource;
  try {
    skillSource = await readFile(skillPath, 'utf8');
  } catch {
    return [`${directoryName}: missing SKILL.md`];
  }

  let metadata;
  try {
    metadata = parseSkillFrontmatter(skillSource, `${directoryName}/SKILL.md`);
  } catch (error) {
    errors.push(error.message);
    return errors;
  }

  validateSkillMetadata(metadata, directoryName, errors);
  validateSkillSource(skillSource, directoryName, errors);
  validateReadFirstPaths(skillSource, directoryName, errors);
  await validateLocalReferences(skillSource, skillDirectory, directoryName, errors);
  await validateSkillFiles(skillDirectory, directoryName, errors);

  let openAiSource;
  try {
    openAiSource = await readFile(openAiPath, 'utf8');
  } catch {
    errors.push(`${directoryName}/agents/openai.yaml: missing interface metadata`);
    return errors;
  }

  let openAi;
  try {
    validateOpenAiSource(openAiSource, directoryName, errors);
    openAi = parseFlatYaml(openAiSource, `${directoryName}/agents/openai.yaml`);
  } catch (error) {
    errors.push(error.message);
    return errors;
  }
  validateOpenAiMetadata(openAi, directoryName, errors);

  return errors;
}

async function validateSkillDiscovery(directories, { catalogPath, workflowsPath }) {
  if (!catalogPath && !workflowsPath) return [];
  const errors = [];
  let catalog = '';
  let workflows = '';
  try {
    catalog = await readFile(catalogPath, 'utf8');
  } catch {
    errors.push(`Skill catalog is missing: ${catalogPath}`);
  }
  try {
    workflows = await readFile(workflowsPath, 'utf8');
  } catch {
    errors.push(`Skill workflow selector is missing: ${workflowsPath}`);
  }
  if (!catalog || !workflows) return errors;

  for (const directory of directories) {
    const name = directory.name;
    const catalogReference = `.agents/skills/${name}/SKILL.md`;
    const catalogReferences = catalog.split(catalogReference).length - 1;
    if (catalogReferences !== 1) {
      errors.push(`${name}: expected exactly one docs/agent-skills.md catalog entry, found ${catalogReferences}`);
    }
    const workflowRows = workflows
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('|') && line.includes(`\`$${name}\``)).length;
    if (workflowRows !== 1) {
      errors.push(`${name}: expected exactly one docs/ai/agent-workflows.md selector row, found ${workflowRows}`);
    }
  }
  return errors;
}

async function validateUniqueInterfaceMetadata(directories, skillsRoot) {
  const errors = [];
  const displayNames = new Map();
  for (const directory of directories) {
    const openAiPath = resolve(skillsRoot, directory.name, 'agents/openai.yaml');
    try {
      const source = await readFile(openAiPath, 'utf8');
      const values = parseFlatYaml(source, `${directory.name}/agents/openai.yaml`);
      const displayName = values.get('display_name')?.value;
      if (!displayName) continue;
      const existing = displayNames.get(displayName);
      if (existing) {
        errors.push(
          `${directory.name}/agents/openai.yaml: display_name "${displayName}" duplicates ${existing}/agents/openai.yaml`,
        );
      } else {
        displayNames.set(displayName, directory.name);
      }
    } catch {
      // Per-skill validation reports unreadable or malformed interface metadata.
    }
  }
  return errors;
}

async function validateRootScriptReferences(directories, skillsRoot, packageJsonPath) {
  if (!packageJsonPath) return [];
  const errors = [];
  let scripts;
  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    scripts = new Set(Object.keys(packageJson.scripts ?? {}));
  } catch {
    return [`Cannot read root package scripts: ${packageJsonPath}`];
  }
  for (const directory of directories) {
    const skillPath = resolve(skillsRoot, directory.name, 'SKILL.md');
    let source;
    try {
      source = await readFile(skillPath, 'utf8');
    } catch {
      continue;
    }
    const referencedScripts = new Set([...source.matchAll(/\bpnpm run ([a-zA-Z0-9:_-]+)/gu)].map((match) => match[1]));
    for (const script of referencedScripts) {
      if (!scripts.has(script)) {
        errors.push(`${directory.name}/SKILL.md: root script "${script}" is missing from package.json`);
      }
    }
  }
  return errors;
}

export async function validateSkillsRoot(skillsRoot, discovery = {}) {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (directories.length === 0) return ['No repo-local skills found'];

  const errorGroups = await Promise.all(
    directories.map((entry) => validateSkillDirectory(resolve(skillsRoot, entry.name))),
  );
  return [
    ...errorGroups.flat(),
    ...(await validateUniqueInterfaceMetadata(directories, skillsRoot)),
    ...(await validateSkillDiscovery(directories, discovery)),
    ...(await validateRootScriptReferences(directories, skillsRoot, discovery.packageJsonPath)),
  ];
}

async function main() {
  const workspaceRoot = resolve(import.meta.dirname, '../../..');
  const skillsRoot = resolve(workspaceRoot, '.agents/skills');
  const errors = await validateSkillsRoot(skillsRoot, {
    catalogPath: resolve(workspaceRoot, 'docs/agent-skills.md'),
    packageJsonPath: resolve(workspaceRoot, 'package.json'),
    workflowsPath: resolve(workspaceRoot, 'docs/ai/agent-workflows.md'),
  });
  if (errors.length > 0) {
    console.error('Agent skill validation failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  const count = (await readdir(skillsRoot, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.'),
  ).length;
  console.log(`Validated ${count} repo-local agent skills.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
