#!/usr/bin/env node
/**
 * The only product-image compile driver.
 *
 * Bake compiles the selected images once (`NX_BUILD_PROJECTS` is the union) and
 * `--load`s them. Compose, smoke, fullstack, and CI runtime-stack then start
 * with `--no-build`. They do not re-enter Nx per service.
 *
 *   node scripts/build-images.mjs
 *   node scripts/build-images.mjs --only migrator,auth-app-api
 *   node scripts/build-images.mjs --registry ghcr.io/acme/acme --tag sha-<git-sha>
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveSelectedProductClosureContext, validateNormalizedClosureContext } from './closure-build-context.mjs';
import { buildBakeConfig, resolveBakeImageNames } from './generate-bake-file.mjs';
import { loadAllReferenceReleaseClosure, loadSelectedReleaseClosure, releaseImages } from './release-image-plan.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultLocalImagePrefix = 'nrb';
export const defaultLocalImageTag = 'local';
export const bakeFileName = 'docker-bake.json';

const localImageRef = (name, prefix = defaultLocalImagePrefix, tag = defaultLocalImageTag) =>
  `${prefix}/${name}:${tag}`;

export function bakeNameForComposeService(service) {
  if (service === 'migrate' || service === 'mongodb-migrate') return 'migrator';
  return service;
}

export function publishedImageRef(name, registry, tag) {
  return `${String(registry).replace(/\/$/u, '')}/${name}:${tag}`;
}

export function planImageBuild({
  names,
  closureContext,
  registry,
  tag,
  prefix = defaultLocalImagePrefix,
  localTag = defaultLocalImageTag,
} = {}) {
  if (!closureContext) throw new Error('Every image build requires an explicit nrb-closure context.');
  const selected = names ?? releaseImages.map((image) => image.name);
  const config = buildBakeConfig(releaseImages, selected, closureContext);
  for (const name of Object.keys(config.target)) {
    const tags = [localImageRef(name, prefix, localTag)];
    if (registry && tag) tags.push(publishedImageRef(name, registry, tag));
    config.target[name].tags = tags;
  }
  return {
    bakeFile: bakeFileName,
    config,
    names: selected,
    args: ['buildx', 'bake', '-f', bakeFileName, '--load', ...selected],
    tags: Object.fromEntries(
      selected.map((name) => [name, config.target[name]?.tags ?? [localImageRef(name, prefix, localTag)]]),
    ),
  };
}

function parseArguments(argv) {
  const options = {
    only: undefined,
    registry: undefined,
    tag: undefined,
    allReference: false,
    provider: undefined,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const take = (flag) => {
      const value = argv[(index += 1)];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (argument === '--only') options.only = take('--only');
    else if (argument.startsWith('--only=')) options.only = argument.slice('--only='.length);
    else if (argument === '--registry') options.registry = take('--registry');
    else if (argument.startsWith('--registry=')) options.registry = argument.slice('--registry='.length);
    else if (argument === '--tag') options.tag = take('--tag');
    else if (argument.startsWith('--tag=')) options.tag = argument.slice('--tag='.length);
    else if (argument === '--all-reference') options.allReference = true;
    else if (argument === '--provider') options.provider = take('--provider');
    else if (argument.startsWith('--provider=')) options.provider = argument.slice('--provider='.length);
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function resolveBuildImageNames(options, workspaceRoot = rootDir) {
  const allowed = options.allReference
    ? (await loadAllReferenceReleaseClosure(options.provider, workspaceRoot)).releaseImages
    : (await loadSelectedReleaseClosure(workspaceRoot)).releaseImages;
  return resolveBakeImageNames(allowed, options.only);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.allReference && options.provider !== 'postgres' && options.provider !== 'mongodb') {
    throw new Error('--all-reference requires --provider postgres or mongodb.');
  }
  const names = await resolveBuildImageNames(options);
  const closureContext = options.allReference
    ? `.nrb/reference/${options.provider}`
    : resolveSelectedProductClosureContext(rootDir, process.env.NRB_CLOSURE_CONTEXT);
  if (options.allReference) validateNormalizedClosureContext(join(rootDir, closureContext));
  const plan = planImageBuild({
    names,
    closureContext,
    registry: options.registry,
    tag: options.tag,
  });
  writeFileSync(join(rootDir, plan.bakeFile), `${JSON.stringify(plan.config, null, 2)}\n`);
  if (options.dryRun) {
    console.log(JSON.stringify({ status: 'planned', names: plan.names, tags: plan.tags }, null, 2));
    return;
  }
  const result = spawnSync('docker', plan.args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
