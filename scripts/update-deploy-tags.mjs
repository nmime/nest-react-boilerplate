#!/usr/bin/env node
/**
 * update-deploy-tags — promote selected immutable image digests in production Helm
 * values.
 *
 *   node scripts/update-deploy-tags.mjs <full-sha> --image <name>=sha256:<digest> [--image ...] [--dry-run]
 *
 * The release workflow only supplies images built for the candidate SHA, so digests
 * for unaffected workloads stay untouched and a small feature release does not roll
 * the whole fleet.
 *
 * The promotable image names come from `releaseImages` — the single authoritative
 * image inventory — so this file can never drift from what the release pipeline
 * actually builds.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseImages } from './release-image-plan.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultValuesFile = '.helm/values-production.yaml';

export const promotableImageNames = releaseImages.map(({ name }) => name);
export const releasePlaceholder = 'sha-REPLACE_WITH_RELEASE_GIT_SHA';

const fail = (message) => {
  throw new Error(message);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Parse one `name=sha256:<64 hex>` promotion argument. Pure. */
export function parseImageUpdate(value) {
  const separator = String(value).indexOf('=');
  const name = separator === -1 ? '' : value.slice(0, separator);
  const digest = separator === -1 ? '' : value.slice(separator + 1);
  if (!promotableImageNames.includes(name)) {
    fail(`--image must name one of ${promotableImageNames.join(', ')} (received "${name}").`);
  }
  if (!/^sha256:[0-9a-fA-F]{64}$/u.test(digest)) {
    fail(`invalid immutable digest for ${name}: ${digest}`);
  }
  return { name, digest: digest.toLowerCase() };
}

/**
 * Rewrite the `tag`/`digest` pair of exactly one image block. Pure.
 *
 * The block is bounded by the next `repository:` key at the same indentation, so a
 * promotion can never leak into the following workload's values.
 */
export function updateImageBlock(content, { name, tag, digest }) {
  const repositoryPattern = new RegExp(`^([ \\t]*)repository:\\s*["']?\\S+/${escapeRegExp(name)}["']?\\s*$`, 'mu');
  const match = repositoryPattern.exec(content);
  if (!match) fail(`production values do not contain an image repository ending in /${name}`);
  const indentation = match[1] ?? '';
  const start = match.index + match[0].length;
  const nextRepository = new RegExp(`^${escapeRegExp(indentation)}repository:\\s`, 'mu').exec(content.slice(start));
  const end = nextRepository ? start + nextRepository.index : content.length;
  let block = content.slice(start, end);
  const tagPattern = new RegExp(`^${escapeRegExp(indentation)}tag:[ \\t]*.*$`, 'mu');
  const digestPattern = new RegExp(`^${escapeRegExp(indentation)}digest:[ \\t]*.*$`, 'mu');
  if (!tagPattern.test(block) || !digestPattern.test(block)) {
    fail(`production values image block for ${name} must contain tag and digest fields`);
  }
  block = block.replace(tagPattern, `${indentation}tag: "${tag}"`);
  block = block.replace(digestPattern, `${indentation}digest: "${digest}"`);
  return content.slice(0, start) + block + content.slice(end);
}

/**
 * Apply every promotion to the values document. Pure.
 *
 * A first promotion has to cover the whole inventory: leaving a placeholder behind
 * would deploy a workload with an unresolved tag.
 */
export function promoteImageDigests({ content, sha, updates }) {
  if (!/^[0-9a-fA-F]{40}$/u.test(String(sha))) {
    fail(`invalid Git SHA "${sha}"; expected exactly 40 hex characters`);
  }
  if (updates.length === 0) fail('at least one --image promotion is required');
  const names = updates.map(({ name }) => name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) fail(`each image may be supplied only once (${duplicate} repeated)`);

  const tag = `sha-${String(sha).toLowerCase()}`;
  const updated = updates.reduce(
    (document, { name, digest }) => updateImageBlock(document, { name, tag, digest }),
    content,
  );
  if (updated.includes(releasePlaceholder) && names.length !== promotableImageNames.length) {
    fail(
      'production values still contain release placeholders; the first promotion must supply every release image digest',
    );
  }
  return { content: updated, tag };
}

export function renderPromotionPreview(original, updated) {
  const before = original.split(/\r?\n/u);
  const after = updated.split(/\r?\n/u);
  const changed = [];
  const lineCount = Math.max(before.length, after.length);
  for (let index = 0; index < lineCount; index += 1) {
    if (before[index] === after[index]) continue;
    changed.push(`@@ line ${index + 1} @@`, `- ${before[index] ?? ''}`, `+ ${after[index] ?? ''}`);
  }
  return changed.length > 0 ? `--- current\n+++ promoted\n${changed.join('\n')}\n` : '';
}

function parseArguments(argv) {
  const options = { sha: undefined, updates: [], dryRun: false, valuesFile: defaultValuesFile };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--image') options.updates.push(parseImageUpdate(argv[(index += 1)] ?? ''));
    else if (argument.startsWith('--image=')) options.updates.push(parseImageUpdate(argument.slice('--image='.length)));
    else if (argument === '--values-file') options.valuesFile = argv[(index += 1)] ?? '';
    else if (argument.startsWith('--values-file=')) options.valuesFile = argument.slice('--values-file='.length);
    else if (argument.startsWith('--')) fail(`Unknown argument: ${argument}`);
    else if (options.sha === undefined) options.sha = argument;
    else fail(`Unexpected argument: ${argument}`);
  }
  if (!options.sha) fail('a full 40-character Git SHA is required');
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const valuesPath = resolve(rootDir, options.valuesFile);
  if (!existsSync(valuesPath)) {
    fail(`${options.valuesFile} not found; run from the repository root or pass --values-file`);
  }
  const original = readFileSync(valuesPath, 'utf8');
  const { content, tag } = promoteImageDigests({ content: original, sha: options.sha, updates: options.updates });
  if (options.dryRun) {
    console.log(
      `Dry run: ${content === original ? 'NO CHANGES for' : 'WOULD update'} ${options.updates.length} image(s) to ${tag}`,
    );
    const preview = renderPromotionPreview(original, content);
    if (preview) process.stdout.write(preview);
    return;
  }
  writeFileSync(valuesPath, content);
  console.log(`Updated ${options.updates.length} immutable image reference(s) to ${tag} in ${options.valuesFile}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`update-deploy-tags failed: ${error.message}`);
    process.exit(1);
  }
}
