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

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmVersion = '11.15.1';

const image = (name, target, buildArgs, project) => ({ name, target, buildArgs, ...(project ? { project } : {}) });

export const releaseImages = [
  image('migrator', 'migrator', `PNPM_VERSION=${pnpmVersion}`),
  image(
    'admin-app-api',
    'backend',
    `NX_PROJECT=admin-app-api\nBUILD_OUTPUT=dist/apps/backend/admin/admin-app-api\nPNPM_VERSION=${pnpmVersion}`,
    'admin-app-api',
  ),
  image(
    'user-app-api',
    'backend',
    `NX_PROJECT=user-app-api\nBUILD_OUTPUT=dist/apps/backend/user/user-app-api\nPNPM_VERSION=${pnpmVersion}`,
    'user-app-api',
  ),
  image(
    'auth-app-api',
    'backend',
    `NX_PROJECT=auth-app-api\nBUILD_OUTPUT=dist/apps/backend/auth/auth-app-api\nPNPM_VERSION=${pnpmVersion}`,
    'auth-app-api',
  ),
  image(
    'discord-app-api',
    'backend',
    `NX_PROJECT=discord-app-api\nBUILD_OUTPUT=dist/apps/backend/discord/discord-app-api\nPNPM_VERSION=${pnpmVersion}`,
    'discord-app-api',
  ),
  image(
    'telegram-bot-api',
    'backend',
    `NX_PROJECT=telegram-bot-api\nBUILD_OUTPUT=dist/apps/backend/telegram/telegram-bot-api\nPNPM_VERSION=${pnpmVersion}`,
    'telegram-bot-api',
  ),
  image(
    'notification-scheduler',
    'backend',
    `NX_PROJECT=notification-scheduler\nBUILD_OUTPUT=dist/apps/backend/notification/notification-scheduler\nPNPM_VERSION=${pnpmVersion}`,
    'notification-scheduler',
  ),
  image(
    'notification-consumer',
    'backend',
    `NX_PROJECT=notification-consumer\nBUILD_OUTPUT=dist/apps/backend/notification/notification-consumer\nPNPM_VERSION=${pnpmVersion}`,
    'notification-consumer',
  ),
  image(
    'admin-app',
    'frontend',
    `NX_PROJECT=admin-app\nFRONTEND_OUTPUT=dist/apps/frontend/admin\nVITE_API_BASE_URL_MODE=same-origin\nPNPM_VERSION=${pnpmVersion}`,
    'admin-app',
  ),
  image(
    'user-app',
    'frontend',
    `NX_PROJECT=user-app\nFRONTEND_OUTPUT=dist/apps/frontend/app\nVITE_API_BASE_URL_MODE=same-origin\nPNPM_VERSION=${pnpmVersion}`,
    'user-app',
  ),
  image(
    'landing-app',
    'frontend',
    `NX_PROJECT=landing-app\nFRONTEND_OUTPUT=dist/apps/frontend/landing\nVITE_API_BASE_URL_MODE=same-origin\nPNPM_VERSION=${pnpmVersion}`,
    'landing-app',
  ),
  image('site-app', 'site-runtime', `NX_PROJECT=site-app\nPNPM_VERSION=${pnpmVersion}`, 'site-app'),
  image(
    'mobile-app',
    'frontend',
    `NX_PROJECT=mobile-app\nNX_TARGET=export\nFRONTEND_OUTPUT=dist/apps/frontend/mobile\nVITE_API_BASE_URL_MODE=same-origin\nPNPM_VERSION=${pnpmVersion}`,
    'mobile-app',
  ),
];

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
const migrationPrefixes = ['libs/backend/postgres/', 'packages/tooling/src/commands/db/'];

const changedImageInputsRequireFullRelease = (changedFiles) =>
  changedFiles.some(
    (path) => globalImageInputs.includes(path) || globalImagePrefixes.some((prefix) => path.startsWith(prefix)),
  );

const migrationsChanged = (changedFiles) =>
  changedFiles.some(
    (path) => migrationPrefixes.some((prefix) => path.startsWith(prefix)) || path.includes('/migrations/'),
  );

export function selectReleaseImages({ affectedProjects = [], changedFiles = [], forceFull = false } = {}) {
  const all = forceFull || changedImageInputsRequireFullRelease(changedFiles);
  if (all) return [...releaseImages];
  const affected = new Set(affectedProjects);
  const includeMigration = migrationsChanged(changedFiles);
  return releaseImages.filter((candidate) =>
    candidate.name === 'migrator' ? includeMigration : affected.has(candidate.project),
  );
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
  const options = { forceFull: false, githubOutput: undefined, head: 'HEAD', base: undefined, namesOnly: false };
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

export function buildReleasePlan({ affectedProjects, changedFiles, forceFull }) {
  const selected = selectReleaseImages({ affectedProjects, changedFiles, forceFull });
  return {
    hasImages: selected.length > 0,
    matrix: { include: selected.map(({ project: _project, ...candidate }) => candidate) },
    selected,
  };
}

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.namesOnly) {
    console.log(releaseImages.map(({ name }) => name).join('\n'));
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
  const plan = buildReleasePlan({ affectedProjects, changedFiles, forceFull });
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
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
