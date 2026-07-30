#!/usr/bin/env node
/**
 * native-release — the one ordered sequence that turns a checkout into a running
 * host-native release, shared by both callers so they cannot drift:
 *
 *   scripts/deploy.mjs           (`--target=pm2` / `--preset=native`, one-shot)
 *   deploy/single-server/serverctl  (RUNTIME_MODE=native, persistent host lifecycle)
 *
 * The two differ only in where secrets come from — a generated env file for the
 * one-shot path, root-owned `*_FILE` material under CONFIG_ROOT for the managed host
 * — so the environment wrapper is injected. Ordering, the frontend publish step and
 * the PM2 flag derivation live here, once.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which optional PM2 processes a topology needs. The SSR site is a process even when
 * every SPA is served from disk, so a static deployment still starts it.
 */
export function derivePm2Flags({ profiles = [], siteProcess = false } = {}) {
  const flags = { NODE_ENV: 'production' };
  if (profiles.includes('discord')) flags.PM2_ENABLE_DISCORD = 'true';
  if (profiles.includes('telegram')) flags.PM2_ENABLE_TELEGRAM = 'true';
  if (profiles.some((profile) => profile.startsWith('notification-'))) flags.PM2_ENABLE_NOTIFICATIONS = 'true';
  if (siteProcess) flags.PM2_ENABLE_SITE = 'true';
  return flags;
}

/** The PM2 app names a set of flags starts, for health checks. Mirrors ecosystem.config.cjs. */
export function expectedPm2Apps(flags = {}) {
  const enabled = (key) => String(flags[key] ?? '').toLowerCase() === 'true';
  return [
    'admin-app-api',
    'user-app-api',
    'auth-app-api',
    ...(enabled('PM2_ENABLE_DISCORD') ? ['discord-app-api'] : []),
    ...(enabled('PM2_ENABLE_TELEGRAM') ? ['telegram-bot-api'] : []),
    ...(enabled('PM2_ENABLE_NOTIFICATIONS') ? ['notification-consumer', 'notification-scheduler'] : []),
    ...(enabled('PM2_ENABLE_SITE') ? ['site-app'] : []),
  ];
}

const step = (title, command, args, extra = {}) => ({ title, command, args, ...extra });

/**
 * Build the release sequence. Pure.
 *
 * `withEnvironment(command, args, { secrets })` lets a caller wrap a step so it runs
 * with the resolved runtime environment. It must be used for the build too: a build
 * with a bare environment bakes the example feature flags into every bundle.
 */
const identityWrapper = (command, args) => ({ command, args });

const wrap =
  (withEnvironment) =>
  (title, command, args, { secrets = true, ...extra } = {}) => {
    const resolved = withEnvironment(command, args, { secrets });
    return step(title, resolved.command, resolved.args, extra);
  };

/**
 * Turn the checkout into publishable artifacts. Pure.
 *
 * Separate from the release phase because callers insert their own gates between the
 * two — validation that imports the workspace can only run once dependencies exist.
 */
export function buildNativeBuildPlan({ appRoot = '.', distRoot, withEnvironment = identityWrapper } = {}) {
  const wrapped = wrap(withEnvironment);
  const steps = [
    step('Install workspace dependencies', 'pnpm', ['install', '--frozen-lockfile']),
    // VITE_* values are baked in at build time, so configuration must be present —
    // but never credentials: a build process has no use for them.
    wrapped('Build applications', 'pnpm', ['run', 'build'], { secrets: false }),
  ];
  // Publish rather than serve from the checkout: APP_ROOT is deploy-user-owned 0750,
  // so nginx cannot traverse it, and rebuilding in place rewrites files under live
  // traffic. rsync into a root-owned web root is the atomic-enough swap.
  if (distRoot) {
    steps.push(
      step(
        'Publish the built frontends',
        'rsync',
        [
          '-a',
          '--delete',
          '--chmod=D755,F644',
          `${appRoot.replace(/\/+$/u, '')}/dist/apps/frontend/`,
          `${distRoot.replace(/\/+$/u, '')}/`,
        ],
        { sudo: true, note: 'nginx serves this tree, never the checkout' },
      ),
    );
  }
  return steps;
}

/** Migrate and (re)start the supervised processes. Pure. */
export function buildNativeStartPlan({
  pm2Flags = {},
  skipMigrations = false,
  withEnvironment = identityWrapper,
} = {}) {
  const wrapped = wrap(withEnvironment);
  const steps = [];
  // Migrations are forward-only, so a rollback deliberately never runs them, and they
  // must precede the reload or autorestart crash-loops against the wrong schema.
  if (!skipMigrations) steps.push(wrapped('Run database migrations', 'pnpm', ['run', 'db:migrate']));
  steps.push(
    // startOrReload is idempotent, and --update-env is what makes a rotated secret
    // actually reach the processes instead of being silently ignored.
    wrapped('Start or reload PM2 services', 'pm2', ['startOrReload', 'ecosystem.config.cjs', '--update-env'], {
      env: pm2Flags,
    }),
    step('Persist the PM2 process list', 'pm2', ['save'], { env: pm2Flags }),
  );
  return steps;
}

/** The whole sequence, for callers with nothing to insert in between. Pure. */
export function buildNativeReleasePlan(options = {}) {
  return [...buildNativeBuildPlan(options), ...buildNativeStartPlan(options)];
}

/** Wrap a command so it runs with the resolved native environment. Pure. */
export function nativeEnvironmentWrapper({ productionEnv, node = process.execPath }) {
  return (command, args, { secrets = true } = {}) => ({
    command: node,
    args: [
      'scripts/native-runtime-env.mjs',
      'exec',
      `--production-env=${productionEnv}`,
      ...(secrets ? [] : ['--no-secrets']),
      '--',
      command,
      ...args,
    ],
  });
}

function main() {
  const [action, ...rest] = process.argv.slice(2);
  const options = { dryRun: false, productionEnv: '.env.production', appRoot: repoRoot, distRoot: undefined };
  const flags = {};
  for (const argument of rest) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--skip-migrations') options.skipMigrations = true;
    else if (argument.startsWith('--production-env=')) options.productionEnv = argument.slice(17);
    else if (argument.startsWith('--app-root=')) options.appRoot = argument.slice(11);
    else if (argument.startsWith('--dist-root=')) options.distRoot = argument.slice(12);
    else if (argument.startsWith('--pm2-flag=')) flags[argument.slice(11)] = 'true';
    else throw new Error(`Unknown argument: ${argument}`);
  }
  // `build` and `start` are the two phases separately, so a caller that has to change
  // privilege between them (publishing into a root-owned web root) still runs the
  // shared sequence in the shared order.
  const builders = { build: buildNativeBuildPlan, start: buildNativeStartPlan, apply: buildNativeReleasePlan };
  // Health checks need the expected process names for the same flags.
  if (action === 'pm2-apps') {
    console.log(expectedPm2Apps({ ...flags }).join('\n'));
    return;
  }
  if (!(action in builders)) {
    console.log(
      'Usage: native-release.mjs <build|start|apply|pm2-apps> [--production-env=path] [--app-root=path] [--dist-root=path] [--pm2-flag=KEY] [--skip-migrations] [--dry-run]',
    );
    process.exit(action ? 2 : 0);
  }
  const plan = builders[action]({
    appRoot: options.appRoot,
    distRoot: options.distRoot,
    pm2Flags: { NODE_ENV: 'production', ...flags },
    skipMigrations: options.skipMigrations,
    withEnvironment: nativeEnvironmentWrapper({ productionEnv: options.productionEnv }),
  });
  for (const [index, item] of plan.entries()) {
    console.log(`\n==> [${index + 1}/${plan.length}] ${item.title}`);
    if (options.dryRun) {
      console.log(`    ${item.sudo ? 'sudo ' : ''}${item.command} ${item.args.join(' ')}`);
      continue;
    }
    const result = spawnSync(item.command, item.args, {
      cwd: options.appRoot,
      stdio: 'inherit',
      env: { ...process.env, ...(item.env ?? {}) },
    });
    if (result.error?.code === 'ENOENT') {
      console.error(`\n"${item.command}" is not available on this host.`);
      process.exit(127);
    }
    if (result.status !== 0) {
      console.error(`\nStep failed: ${item.title} (exit ${result.status}).`);
      process.exit(result.status ?? 1);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`native-release failed: ${error.message}`);
    process.exit(1);
  }
}
