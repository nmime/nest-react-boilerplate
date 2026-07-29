#!/usr/bin/env node
/**
 * Select the immutable production images that actually changed since the last
 * release baseline. Nx supplies transitive application impact; migrations use
 * a path rule because they are executed by a dedicated image rather than an
 * Nx project.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmVersion = '11.11.0';
const jiti = createJiti(import.meta.url);
const { appCatalog } = await jiti.import('../packages/tooling/src/setup/catalog.ts');
const { materializeAllReferenceClosure, validateCurrentClosure } = await jiti.import(
  '../packages/tooling/src/setup/closure-workspace.ts',
);
const { checkClosureArtifacts, validateProductClosureBuildContext } = await jiti.import(
  '../packages/tooling/src/setup/closure-materializer.ts',
);

const image = (name, target, buildArgs, project) => ({ name, target, buildArgs, ...(project ? { project } : {}) });

export const releaseImages = [
  image('migrator', 'migrator', `PNPM_VERSION=${pnpmVersion}`),
  ...Object.values(appCatalog).flatMap((app) => {
    if (!app.releaseImage) return [];
    const buildArgs = [
      `NX_PROJECT=${app.id}`,
      ...(app.releaseImage.nxTarget ? [`NX_TARGET=${app.releaseImage.nxTarget}`] : []),
      ...(app.releaseImage.buildOutput ? [`BUILD_OUTPUT=${app.releaseImage.buildOutput}`] : []),
      ...(app.releaseImage.frontendOutput ? [`FRONTEND_OUTPUT=${app.releaseImage.frontendOutput}`] : []),
      ...(app.releaseImage.frontendOutput ? ['VITE_API_BASE_URL_MODE=same-origin'] : []),
      `PNPM_VERSION=${pnpmVersion}`,
    ].join('\n');
    return [image(app.id, app.releaseImage.target, buildArgs, app.id)];
  }),
];
const releaseImageNames = new Set(releaseImages.map(({ name }) => name));

const globalImageInputs = [
  '.dockerignore',
  '.npmrc',
  'Dockerfile',
  'eslint.config.js',
  'nx.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.lint.json',
];
const globalImagePrefixes = ['config/', 'docker/', 'i18n/', 'packages/'];
const migrationPrefixes = ['libs/backend/postgres/', 'libs/backend/mongodb/', 'packages/tooling/src/commands/db/'];

const changedImageInputsRequireFullRelease = (changedFiles) =>
  changedFiles.some(
    (path) => globalImageInputs.includes(path) || globalImagePrefixes.some((prefix) => path.startsWith(prefix)),
  );

const migrationsChanged = (changedFiles) =>
  changedFiles.some(
    (path) => migrationPrefixes.some((prefix) => path.startsWith(prefix)) || path.includes('/migrations/'),
  );

export function selectReleaseImages({
  selectedReleaseImages,
  affectedProjects = [],
  changedFiles = [],
  forceFull = false,
}) {
  if (!Array.isArray(selectedReleaseImages)) {
    throw new Error('Selected closure releaseImages are required for release planning.');
  }
  const unknown = selectedReleaseImages.filter((name) => !releaseImageNames.has(name));
  if (unknown.length > 0) throw new Error(`Selected closure references unknown release images: ${unknown.join(', ')}`);
  const selected = new Set(selectedReleaseImages);
  const eligible = releaseImages.filter(({ name }) => selected.has(name));
  const all = forceFull || changedImageInputsRequireFullRelease(changedFiles);
  if (all) return eligible;
  const affected = new Set(affectedProjects);
  const includeMigration = migrationsChanged(changedFiles);
  return eligible.filter((candidate) =>
    candidate.name === 'migrator' ? includeMigration : affected.has(candidate.project),
  );
}

export async function loadSelectedReleaseClosure(workspaceRoot = rootDir, dependencies = {}) {
  const actual = await validateCurrentClosure(workspaceRoot, {
    ...(dependencies.readActual ? { readActual: dependencies.readActual } : {}),
    ...(dependencies.buildExpected ? { buildExpected: dependencies.buildExpected } : {}),
  });
  const checked = (dependencies.checkArtifacts ?? checkClosureArtifacts)(workspaceRoot, actual);
  if (!checked.valid) throw new Error(`${checked.problems.join('; ')}; rerun \`pnpm nrb setup\`.`);
  if (checked.lockStatus === 'stale') {
    throw new Error('.nrb/closure/pnpm-lock.yaml is stale; run `pnpm nrb closure install`.');
  }
  validateProductClosureBuildContext(workspaceRoot, actual);
  const unknown = actual.releaseImages.filter((name) => !releaseImageNames.has(name));
  if (unknown.length > 0) throw new Error(`Selected closure references unknown release images: ${unknown.join(', ')}`);
  return actual;
}

export async function loadAllReferenceReleaseClosure(provider, workspaceRoot = rootDir) {
  if (provider !== 'postgres' && provider !== 'mongodb') {
    throw new Error('All-reference release closure provider must be postgres or mongodb.');
  }
  return materializeAllReferenceClosure(workspaceRoot, provider);
}

const git = (args, { allowFailure = false } = {}) => {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return undefined;
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr.trim()}` : ''}`);
  }
};

const defaultBase = (head) => {
  const previousTag = git(['describe', '--tags', '--match', 'v*', '--abbrev=0', `${head}^`], { allowFailure: true });
  return previousTag ? git(['rev-list', '-n', '1', previousTag]) : undefined;
};

const changedFilesBetween = (base, head) => {
  if (!base) return [];
  return git(['diff', '--name-only', `${base}..${head}`])
    .split(/\r?\n/u)
    .filter(Boolean);
};

const affectedProjectsBetween = (base, head) => {
  if (!base) return [];
  const output = execFileSync(
    'pnpm',
    ['exec', 'nx', 'show', 'projects', '--affected', `--base=${base}`, `--head=${head}`],
    { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
};

const initializedProductionValuesRequireFullRelease = () => {
  const valuesPath = join(rootDir, '.helm', 'values-production.yaml');
  return existsSync(valuesPath) && readFileSync(valuesPath, 'utf8').includes('sha-REPLACE_WITH_RELEASE_GIT_SHA');
};

const parseArguments = (argv) => {
  const options = {
    forceFull: false,
    allReference: false,
    provider: undefined,
    githubOutput: undefined,
    head: 'HEAD',
    base: undefined,
    namesOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = (flag) => {
      if (argument !== flag) return undefined;
      const result = argv[index + 1];
      if (!result) throw new Error(`${flag} requires a value.`);
      index += 1;
      return result;
    };
    const base = value('--base');
    if (base !== undefined) {
      options.base = base;
      continue;
    }
    const head = value('--head');
    if (head !== undefined) {
      options.head = head;
      continue;
    }
    const githubOutput = value('--github-output');
    if (githubOutput !== undefined) {
      options.githubOutput = githubOutput;
      continue;
    }
    if (argument === '--force-full') {
      options.forceFull = true;
      continue;
    }
    if (argument === '--all-reference') {
      options.allReference = true;
      continue;
    }
    const provider = value('--provider');
    if (provider !== undefined) {
      if (provider !== 'postgres' && provider !== 'mongodb') {
        throw new Error('--provider must be postgres or mongodb.');
      }
      options.provider = provider;
      continue;
    }
    if (argument === '--names') {
      options.namesOnly = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
};

const writeOutputs = (outputPath, values) => {
  for (const [key, value] of Object.entries(values)) appendFileSync(outputPath, `${key}=${value}\n`);
};

export function buildReleasePlan({ selectedReleaseImages, affectedProjects, changedFiles, forceFull }) {
  const selected = selectReleaseImages({ selectedReleaseImages, affectedProjects, changedFiles, forceFull });
  return {
    hasImages: selected.length > 0,
    matrix: { include: selected.map(({ project: _project, ...candidate }) => candidate) },
    selected,
  };
}

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.allReference && !options.provider) {
    throw new Error('--all-reference requires --provider <postgres|mongodb>.');
  }
  if (!options.allReference && options.provider) {
    throw new Error('--provider is valid only with --all-reference.');
  }
  const selectedReleaseImages = options.allReference
    ? (await loadAllReferenceReleaseClosure(options.provider)).releaseImages
    : (await loadSelectedReleaseClosure()).releaseImages;
  if (options.namesOnly) {
    console.log(selectedReleaseImages.join('\n'));
    return;
  }
  if (options.base && !/^[0-9a-fA-F]{40}$/u.test(options.base)) {
    throw new Error('--base must be a full 40-character Git SHA.');
  }
  const head = git(['rev-parse', options.head]);
  const base = options.base ? git(['rev-parse', options.base]) : defaultBase(head);
  if (base && git(['merge-base', '--is-ancestor', base, head], { allowFailure: true }) === undefined) {
    throw new Error(`Release base ${base} is not an ancestor of ${head}.`);
  }
  const changedFiles = changedFilesBetween(base, head);
  const productionValuesRequireFullRelease = initializedProductionValuesRequireFullRelease();
  const globalImageInputChanged = changedImageInputsRequireFullRelease(changedFiles);
  const forceFull = options.forceFull || !base || productionValuesRequireFullRelease || globalImageInputChanged;
  const affectedProjects = forceFull ? [] : affectedProjectsBetween(base, head);
  const plan = buildReleasePlan({ selectedReleaseImages, affectedProjects, changedFiles, forceFull });
  const reason = forceFull
    ? !base
      ? 'no-previous-release-baseline'
      : options.forceFull
        ? 'manual-full-release'
        : productionValuesRequireFullRelease
          ? 'production-values-not-initialized'
          : 'global-image-input-changed'
    : 'nx-affected-projects';
  const output = {
    affected_projects: affectedProjects.join(','),
    base: base ?? '',
    changed_files: changedFiles.length,
    has_images: String(plan.hasImages),
    matrix: JSON.stringify(plan.matrix),
    reason,
    selected_images: plan.selected.map(({ name }) => name).join(','),
  };
  if (options.githubOutput) writeOutputs(options.githubOutput, output);
  console.log(JSON.stringify({ ...output, matrix: plan.matrix }, null, 2));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
