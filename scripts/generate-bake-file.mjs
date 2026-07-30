#!/usr/bin/env node
/**
 * Derive a Docker Bake config from catalog-owned image metadata, constrained
 * by the current setup-selected closure for product builds.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAllReferenceReleaseClosure, loadSelectedReleaseClosure, releaseImages } from './release-image-plan.mjs';
import { resolveSelectedProductClosureContext, validateNormalizedClosureContext } from './closure-build-context.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const parseBuildArgs = (buildArgs) =>
  Object.fromEntries(
    buildArgs
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

export function buildBakeConfig(images, selectedNames, closureContext) {
  if (!closureContext) throw new Error('Every Bake target requires an explicit nrb-closure context.');
  const byName = new Map(images.map((image) => [image.name, image]));
  const unknown = (selectedNames ?? []).filter((name) => !byName.has(name));
  if (unknown.length > 0) throw new Error(`Unknown release image names: ${unknown.join(', ')}`);
  // Preserve the order the caller selected images in (e.g. the --only list) so
  // NX_BUILD_PROJECTS reflects the affected-set order, not the full catalogue order.
  const scoped = selectedNames === undefined ? images : selectedNames.map((name) => byName.get(name));

  const nxBuildProjects = scoped
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');

  const target = {};
  for (const image of scoped) {
    const parsed = parseBuildArgs(image.buildArgs);
    const runtimeProject = parsed.NX_PROJECT;
    delete parsed.NX_PROJECT;
    delete parsed.NX_TARGET;
    const args = image.project
      ? { NX_BUILD_PROJECTS: nxBuildProjects, RUNTIME_PROJECT: runtimeProject, ...parsed }
      : { ...parsed };
    target[image.name] = {
      dockerfile: 'Dockerfile',
      target: image.target,
      args,
      contexts: { 'nrb-closure': closureContext },
    };
  }

  return { group: { default: { targets: scoped.map((image) => image.name) } }, target };
}

export function renderBakeJson(images, selectedNames, closureContext) {
  return `${JSON.stringify(buildBakeConfig(images, selectedNames, closureContext), null, 2)}\n`;
}

export function resolveBakeImageNames(allowedNames, only) {
  const names = only
    ? only
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : allowedNames;
  const allowed = new Set(allowedNames);
  const outsideClosure = names.filter((name) => !allowed.has(name));
  if (outsideClosure.length > 0) {
    throw new Error(`Release images are outside the selected closure: ${outsideClosure.join(', ')}`);
  }
  return names;
}

const parseArguments = (argv) => {
  const options = { allReference: false, provider: undefined, only: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--only') {
      const value = argv[index + 1];
      if (!value) throw new Error('--only requires a value.');
      options.only = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--only=')) {
      options.only = argument.slice('--only='.length);
      continue;
    }
    if (argument === '--all-reference') {
      options.allReference = true;
      continue;
    }
    if (argument === '--provider') {
      const provider = argv[index + 1];
      if (provider !== 'postgres' && provider !== 'mongodb') {
        throw new Error('--provider must be postgres or mongodb.');
      }
      options.provider = provider;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.allReference && !options.provider) {
    throw new Error('--all-reference requires --provider <postgres|mongodb>.');
  }
  if (!options.allReference && options.provider) {
    throw new Error('--provider is valid only with --all-reference.');
  }
  const allowedNames = options.allReference
    ? (await loadAllReferenceReleaseClosure(options.provider, rootDir)).releaseImages
    : (await loadSelectedReleaseClosure()).releaseImages;
  const names = resolveBakeImageNames(allowedNames, options.only);
  const closureContext = options.allReference ? `.nrb/reference/${options.provider}` : '.nrb/closure';
  if (options.allReference) validateNormalizedClosureContext(join(rootDir, closureContext));
  else resolveSelectedProductClosureContext(rootDir);
  writeFileSync(join(rootDir, 'docker-bake.json'), renderBakeJson(releaseImages, names, closureContext));
  console.log('Wrote docker-bake.json');
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
