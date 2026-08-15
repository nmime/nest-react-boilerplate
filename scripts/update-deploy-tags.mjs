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
export const defaultBaseValuesFile = '.helm/values.yaml';
export const defaultSelectionValuesFile = '.helm/values-selection.yaml';

export const promotableImageNames = releaseImages.map(({ name }) => name);
export const releasePlaceholder = 'sha-REPLACE_WITH_RELEASE_GIT_SHA';
const imageNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

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

/**
 * Read enabled/image ownership from a Helm values document. Used to intersect
 * the selected release inventory with the apps the chart will actually deploy.
 */
export function chartImageOwnership(content) {
  const ownership = {};
  let section = '';
  let owner = '';
  for (const line of String(content).split(/\r?\n/u)) {
    const topLevel = /^([A-Za-z][A-Za-z0-9]*):\s*$/u.exec(line);
    if (topLevel) {
      section = topLevel[1] ?? '';
      owner = section === 'migrations' ? 'migrations' : '';
      continue;
    }
    if (section === 'apps') {
      const app = /^ {2}([A-Za-z][A-Za-z0-9]*):\s*$/u.exec(line);
      if (app) {
        owner = `apps.${app[1]}`;
        continue;
      }
    }
    if (!owner) continue;
    const enabledIndent = owner.startsWith('apps.') ? '    ' : '  ';
    const enabled = new RegExp(`^${enabledIndent}enabled:\\s*(true|false)\\s*$`, 'iu').exec(line);
    if (enabled) {
      ownership[owner] ??= {};
      ownership[owner].enabled = enabled[1]?.toLowerCase() === 'true';
      continue;
    }
    const repositoryIndent = owner.startsWith('apps.') ? '      ' : '    ';
    const repository = new RegExp(`^${repositoryIndent}repository:\\s*["']?([^"'\\s]+)["']?\\s*$`, 'u').exec(line);
    if (repository?.[1]) {
      ownership[owner] ??= {};
      ownership[owner].image = repository[1].split('/').at(-1);
    }
  }
  return ownership;
}

export function enabledDeploymentImages(baseValues, productionValues, selectionValues) {
  const effective = chartImageOwnership(baseValues);
  for (const overlay of [productionValues, selectionValues]) {
    for (const [owner, override] of Object.entries(chartImageOwnership(overlay))) {
      effective[owner] = { ...effective[owner], ...override };
    }
  }
  return new Set(
    Object.values(effective)
      .filter((entry) => entry.enabled === true && typeof entry.image === 'string')
      .map((entry) => entry.image),
  );
}

export function requiredPromotionImages(selectedImages, baseValues, productionValues, selectionValues) {
  const selected = new Set(selectedImages);
  return new Set(
    [...enabledDeploymentImages(baseValues, productionValues, selectionValues)].filter((name) => selected.has(name)),
  );
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

function takeValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) fail(`${flag} requires a value`);
  return value;
}

function parseSelectedImage(value) {
  if (!imageNamePattern.test(value)) fail(`invalid selected image name: ${value}`);
  return value;
}

function parseArguments(argv) {
  const options = {
    sha: undefined,
    updates: [],
    selectedImages: [],
    dryRun: false,
    printRequired: false,
    valuesFile: defaultValuesFile,
    baseValuesFile: defaultBaseValuesFile,
    selectionValuesFile: defaultSelectionValuesFile,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--print-required') options.printRequired = true;
    else if (argument === '--image') options.updates.push(parseImageUpdate(takeValue(argv, (index += 1), '--image')));
    else if (argument.startsWith('--image=')) options.updates.push(parseImageUpdate(argument.slice('--image='.length)));
    else if (argument === '--selected-image') {
      options.selectedImages.push(parseSelectedImage(takeValue(argv, (index += 1), '--selected-image')));
    } else if (argument.startsWith('--selected-image=')) {
      options.selectedImages.push(parseSelectedImage(argument.slice('--selected-image='.length)));
    } else if (argument === '--values-file') options.valuesFile = takeValue(argv, (index += 1), '--values-file');
    else if (argument.startsWith('--values-file=')) options.valuesFile = argument.slice('--values-file='.length);
    else if (argument === '--base-values-file') {
      options.baseValuesFile = takeValue(argv, (index += 1), '--base-values-file');
    } else if (argument.startsWith('--base-values-file=')) {
      options.baseValuesFile = argument.slice('--base-values-file='.length);
    } else if (argument === '--selection-values-file') {
      options.selectionValuesFile = takeValue(argv, (index += 1), '--selection-values-file');
    } else if (argument.startsWith('--selection-values-file=')) {
      options.selectionValuesFile = argument.slice('--selection-values-file='.length);
    } else if (argument.startsWith('--')) fail(`Unknown argument: ${argument}`);
    else if (options.sha === undefined) options.sha = argument;
    else fail(`Unexpected argument: ${argument}`);
  }
  if (!options.sha) fail('a full 40-character Git SHA is required');
  return options;
}

function requireFile(relativePath, flag) {
  const absolute = resolve(rootDir, relativePath);
  if (!existsSync(absolute)) {
    fail(`${relativePath} not found; run from the repository root or pass ${flag}`);
  }
  return absolute;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!/^[0-9a-fA-F]{40}$/u.test(options.sha)) {
    fail(`invalid Git SHA "${options.sha}"; expected exactly 40 hex characters`);
  }
  const valuesPath = requireFile(options.valuesFile, '--values-file');
  const original = readFileSync(valuesPath, 'utf8');

  if (options.selectedImages.length > 0) {
    const uniqueSelected = new Set(options.selectedImages);
    if (uniqueSelected.size !== options.selectedImages.length) {
      fail('each selected image may be supplied only once');
    }
    const basePath = requireFile(options.baseValuesFile, '--base-values-file');
    const selectionPath = requireFile(options.selectionValuesFile, 'the fresh setup-generated --selection-values-file');
    const required = requiredPromotionImages(
      options.selectedImages,
      readFileSync(basePath, 'utf8'),
      original,
      readFileSync(selectionPath, 'utf8'),
    );
    if (required.size === 0) {
      fail('the fresh selected closure and enabled deployment ownership have no release images in common');
    }
    if (options.printRequired) {
      if (options.updates.length > 0) fail('--print-required cannot be combined with --image');
      process.stdout.write(`${[...required].sort().join('\n')}\n`);
      return;
    }
    const updateNames = new Set(options.updates.map(({ name }) => name));
    const missing = [...required].filter((name) => !updateNames.has(name));
    if (missing.length > 0) {
      fail(`missing immutable digests for selected and enabled images: ${missing.sort().join(', ')}`);
    }
    const extra = [...updateNames].filter((name) => !required.has(name));
    if (extra.length > 0) {
      fail(`image digests are outside selected and enabled deployment ownership: ${extra.sort().join(', ')}`);
    }
  } else if (options.printRequired) {
    fail('--print-required requires --selected-image');
  }

  const tag = `sha-${String(options.sha).toLowerCase()}`;
  const content =
    options.selectedImages.length > 0
      ? options.updates.reduce(
          (document, { name, digest }) => updateImageBlock(document, { name, tag, digest }),
          original,
        )
      : promoteImageDigests({ content: original, sha: options.sha, updates: options.updates }).content;
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
