#!/usr/bin/env node
// Start the Compose runtime stack and block until every service is actually ready.
//
// Both CI drivers delegate here: .github/actions/runtime-stack and scripts/ci/runtime-stack.sh.
// They used to carry byte-identical bash, and the copies drifted -- quality-presets and
// spec-assurance-nightly lost ci.yml's retry and stayed red for 32 nights. Keeping the sequence in
// one executable module is what stops that recurring, and it makes the sequencing below testable
// instead of only observable in a failed lane.
//
// The sequencing itself is the fix for a second defect. `docker compose up -d` honours `depends_on`
// ordering but never waits for a one-shot container to *exit*, so every API booted concurrently
// with the migrator and raced an unmigrated schema. The Playwright fullstack driver had already
// been taught to sequence; the CI lanes had not.

import { spawnSync } from 'node:child_process';
import { imageCompileRequested } from '../image-compile.mjs';

const composeFile = process.env.COMPOSE_FILE_PATH ?? 'docker/docker-compose.yml';
const startAttempts = Number.parseInt(process.env.START_ATTEMPTS ?? '3', 10);
const readinessTimeoutSeconds = Number.parseInt(process.env.READINESS_TIMEOUT ?? '300', 10);
const annotate = process.env.GITHUB_ACTIONS === 'true';

/**
 * Whether a container counts as ready, still starting, or broken.
 *
 * A service that declares a healthcheck is judged only by it. A service that declares none is
 * judged by its lifecycle, and the two kinds of such service need opposite answers: a one-shot is
 * ready once it has *exited* cleanly, while a long-running service is ready as soon as it is
 * *running*. Collapsing them -- treating "no healthcheck" as "one-shot" -- hangs the lane, because
 * `notification-scheduler` and `notification-consumer` run forever and declare no healthcheck; the
 * previous shell collapsed them the other way and declared a still-running migrator ready.
 */
export function classifyContainerReadiness({ health, status, exitCode, oneShot }) {
  if (health === 'healthy') {
    return 'ready';
  }
  if (health === 'unhealthy') {
    return 'failed';
  }
  if (health !== 'none' && health !== '' && health !== undefined) {
    // `starting`, and any future probe state: not yet ready, not yet a failure.
    return 'pending';
  }

  if (oneShot) {
    if (status !== 'exited') {
      return 'pending';
    }
    return exitCode === 0 ? 'ready' : 'failed';
  }

  if (status === 'exited' || status === 'dead') {
    return 'failed';
  }
  return status === 'running' ? 'ready' : 'pending';
}

/**
 * A service that runs to completion rather than staying up.
 *
 * Read from the compose file's own `restart: 'no'`, which is exactly how both migrators and the
 * replica-set bootstrap already declare themselves. A product that adds its own preparation job --
 * a seeder, a fixture loader -- gets sequenced by declaring the same thing, with nothing to
 * register here and no list to keep in step.
 */
const isOneShot = (definition) => definition.restart === 'no';

const dependencyNames = (definition) => Object.keys(definition.depends_on ?? {});

/**
 * Whether a one-shot needs its prerequisites *healthy*, as opposed to merely started.
 *
 * A one-shot that asks only for `service_started` is declaring that it does not need health -- and
 * in MongoDB's case it is the reason health arrives at all, since a `--replSet` mongod is not a
 * writable primary until `rs.initiate()` runs. Gating on health before running it would wait for a
 * state only it can produce, so the condition each one-shot already declares is what decides which
 * side of the health gate it belongs on. Nothing here names a service.
 */
const needsHealthyPrerequisites = (definition) =>
  Object.values(definition.depends_on ?? {}).some((dependency) => dependency?.condition === 'service_healthy');

/** One-shots in declared dependency order, so `mongodb-init` runs before `mongodb-migrate`. */
function orderOneShots(services, oneShots) {
  const ordered = [];
  const seen = new Set();

  const visit = (name) => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    for (const dependency of dependencyNames(services[name] ?? {})) {
      if (oneShots.includes(dependency)) {
        visit(dependency);
      }
    }
    ordered.push(name);
  };

  for (const name of oneShots) {
    visit(name);
  }
  return ordered;
}

/**
 * The order the stack has to start in: the one-shots' prerequisites, then any one-shot that does not
 * need them healthy, then the health gate, then the rest of the one-shots, then everything else.
 *
 * This is the same shape `fullstackStartupPlan` derives from a selected closure in
 * apps/e2e/fullstack/src/selection.ts. The CI lanes have no fullstack selection -- they pin
 * `COMPOSE_PROFILES` -- so the plan is read out of the resolved compose configuration instead, and
 * both derivations feed the same `startupCommands`.
 */
export function composeStartupPlan(config) {
  const services = config.services ?? {};
  const names = Object.keys(services);
  const oneShots = names.filter((name) => isOneShot(services[name]));

  if (oneShots.length === 0) {
    return names.length > 0 ? [{ kind: 'up', services: names }] : [];
  }

  const isPrerequisite = (name) =>
    !oneShots.includes(name) && oneShots.some((oneShot) => dependencyNames(services[oneShot]).includes(name));
  const prerequisites = names.filter(isPrerequisite);
  const remaining = names.filter((name) => !oneShots.includes(name) && !isPrerequisite(name));
  const ordered = orderOneShots(services, oneShots).map((service) => ({ kind: 'run', services: [service] }));
  const tail = remaining.length > 0 ? [{ kind: 'up', services: remaining }] : [];

  if (prerequisites.length === 0) {
    return [...ordered, ...tail];
  }

  const runsBeforeHealth = (step) => !needsHealthyPrerequisites(services[step.services[0]]);
  const beforeGate = ordered.filter(runsBeforeHealth);
  // `--wait` is safe here only because a prerequisite is by construction not a one-shot: it reads
  // a one-shot exiting 0 as a failed wait, which is why the final step below never uses it.
  const gate = { kind: 'up', services: prerequisites, waitForHealthy: true };

  return [
    // With nothing to run first, the gate is the first start. Otherwise the prerequisites come up
    // ungated so those one-shots can reach them, and the gate follows once health is reachable --
    // Compose leaves an already-running container alone, so the second `up` only waits.
    ...(beforeGate.length > 0 ? [{ kind: 'up', services: prerequisites }, ...beforeGate, gate] : [gate]),
    ...ordered.filter((step) => !runsBeforeHealth(step)),
    ...tail,
  ];
}

/**
 * The docker argv for each step of a plan.
 *
 * Images are built once up front so the per-step starts can use `--no-build`; without that, the
 * final `up` would rebuild everything it starts and undo the sequencing's whole point. With no plan
 * there is nothing to sequence against, so the whole-stack build-and-start is kept as it was.
 */
export function startupCommands({ composeFile: file, plan, compile = imageCompileRequested() }) {
  const compileStep = compile ? [['scripts/build-images.mjs']] : [];
  if (plan === undefined) {
    return [...compileStep, ['compose', '-f', file, 'up', '-d', '--no-build']];
  }

  return [
    ...compileStep,
    ...plan.map((step) =>
      step.kind === 'run'
        ? ['compose', '-f', file, 'run', '--rm', '--no-deps', ...step.services]
        : [
            'compose',
            '-f',
            file,
            'up',
            '--no-build',
            '-d',
            ...(step.waitForHealthy === true ? ['--wait'] : []),
            ...step.services,
          ],
    ),
  ];
}

/** Every service the plan expects to still be up once the start sequence finishes. */
export function oneShotServices(plan) {
  return plan === undefined ? [] : plan.filter((step) => step.kind === 'run').flatMap((step) => step.services);
}

const docker = (args, options = {}) =>
  spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.capture === true ? 'pipe' : 'inherit',
    ...(options.capture === true ? { timeout: 30_000 } : {}),
  });

const dockerOutput = (args) => {
  const result = docker(args, { capture: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Docker runtime inspection failed (exit ${result.status ?? 'unknown'}).`);
  }
  return result.stdout.trim();
};

const warn = (message) => {
  process.stderr.write(`${annotate ? `::warning::${message}` : message}\n`);
};

const group = (title, body) => {
  process.stdout.write(annotate ? `::group::${title}\n` : `--- ${title}\n`);
  body();
  if (annotate) {
    process.stdout.write('::endgroup::\n');
  }
};

export function parseRuntimeComposeConfig(raw) {
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error('Runtime Compose configuration is not valid JSON.');
  }
  if (
    !config?.services ||
    Array.isArray(config.services) ||
    typeof config.services !== 'object' ||
    Object.keys(config.services).length === 0
  ) {
    throw new Error('Runtime Compose configuration must select at least one service.');
  }
  return config;
}

const databaseProviders = ['postgres', 'mongodb'];

/**
 * The database provider the pinned compose profiles select.
 *
 * Deployment migrations refuse to guess a provider -- `resolveDeploymentDatabaseProvider` fails
 * unless `DATABASE_ENGINE` and `AUTH_PERSISTENCE` both name one and agree -- and a runtime lane's
 * explicit selection is exactly the profiles it pins: `postgres` carries `migrate`, `mongodb`
 * carries `mongodb-migrate`. Deriving the two keys here, in the one start sequence every driver
 * runs through, is what stops each lane having to repeat an environment block: the spec-assurance
 * lanes never grew one and stayed red on the migrator's first explicit-provider check.
 *
 * The environment keeps the last word, the same contract `validateFullstackEnvironment` enforces
 * for the Playwright driver: a value that contradicts the pinned profiles is a configuration error
 * worth failing on, never something to quietly override. When no provider profile is pinned at all
 * this returns undefined and the deployment guard keeps failing loudly rather than being guessed
 * for.
 */
export function runtimeDatabaseProvider(environment = process.env) {
  const configured = String(environment.COMPOSE_PROFILES ?? '')
    .split(',')
    .map((profile) => profile.trim())
    .filter((profile) => profile.length > 0);
  const selected = databaseProviders.filter((provider) => configured.includes(provider));

  if (selected.length > 1) {
    throw new Error(`COMPOSE_PROFILES selects conflicting database providers: ${selected.join(', ')}.`);
  }

  const provider = selected[0];
  if (provider === undefined) {
    return undefined;
  }

  for (const name of ['DATABASE_ENGINE', 'AUTH_PERSISTENCE']) {
    const value = environment[name]?.trim();
    if (value && value !== provider) {
      throw new Error(`${name} conflicts with the ${provider} provider selected by COMPOSE_PROFILES.`);
    }
  }

  return provider;
}

function resolveComposeConfig() {
  const raw = dockerOutput(['compose', '-f', composeFile, 'config', '--format', 'json']);
  return parseRuntimeComposeConfig(raw);
}

export function runtimeSnapshotReadiness(expectedServices, snapshots, oneShots = []) {
  if (!Array.isArray(expectedServices) || expectedServices.length === 0 || !Array.isArray(snapshots))
    return { ready: false, failed: ['invalid runtime state'], pending: [] };
  const observed = new Set();
  const failed = [];
  const pending = [];
  for (const snapshot of snapshots) {
    const service = snapshot?.Config?.Labels?.['com.docker.compose.service'];
    const state = snapshot?.State;
    if (
      typeof service !== 'string' ||
      !service ||
      !state ||
      !['running', 'restarting', 'paused', 'exited', 'dead', 'created', 'removing'].includes(state.Status) ||
      !Number.isInteger(state.ExitCode) ||
      state.ExitCode < 0 ||
      (!expectedServices.includes(service) && !oneShots.includes(service))
    ) {
      failed.push('unrecognized or malformed container state');
      continue;
    }
    observed.add(service);
    const health = state.Health?.Status ?? 'none';
    const verdict =
      state.Status !== 'running' && health === 'healthy' && !oneShots.includes(service)
        ? 'failed'
        : classifyContainerReadiness({
            health,
            status: state.Status,
            exitCode: state.ExitCode,
            oneShot: oneShots.includes(service),
          });
    if (verdict === 'failed') failed.push(service);
    if (verdict === 'pending') pending.push(service);
  }
  for (const service of expectedServices) if (!observed.has(service)) pending.push(`${service}(missing)`);
  return { ready: failed.length === 0 && pending.length === 0, failed, pending };
}

export function readRuntimeReadiness(expectedServices, oneShots, runDocker = dockerOutput) {
  const ids = runDocker(['compose', '-f', composeFile, 'ps', '--all', '--quiet']).split('\n').filter(Boolean);
  if (ids.length === 0) return runtimeSnapshotReadiness(expectedServices, [], oneShots);
  let snapshots;
  try {
    snapshots = JSON.parse(runDocker(['inspect', ...ids]));
  } catch {
    throw new Error('Runtime container inspection did not return valid JSON.');
  }
  return runtimeSnapshotReadiness(expectedServices, snapshots, oneShots);
}

function containers() {
  const ids = dockerOutput(['compose', '-f', composeFile, 'ps', '--all', '--quiet']);
  return ids === '' ? [] : ids.split('\n').filter(Boolean);
}

const inspect = (container, format) => dockerOutput(['inspect', '--format', format, container]);

function dumpDiagnostics() {
  group('Compose service state', () => {
    docker(['compose', '-f', composeFile, 'ps', '--all']);
  });

  // A failed start prints only "container is unhealthy". The reason is in the service log and the
  // last healthcheck probe, so surface both.
  for (const container of containers()) {
    const name = inspect(container, '{{.Name}}').replace(/^\//u, '') || container;
    const state = inspect(
      container,
      '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}}',
    );

    group(`${name} (${state})`, () => {
      const probes = inspect(
        container,
        '{{if .State.Health}}{{range .State.Health.Log}}--- probe exit={{.ExitCode}}{{"\\n"}}{{.Output}}{{end}}{{else}}no healthcheck{{end}}',
      );
      process.stdout.write(`${probes.split('\n').slice(-40).join('\n')}\n`);
      docker(['logs', '--tail', '80', container]);
    });
  }
}

const sleep = (seconds) => spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${seconds * 1000})`]);

function assertReady(expectedServices, oneShots) {
  const deadline = Date.now() + readinessTimeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const { ready, failed } = readRuntimeReadiness(expectedServices, oneShots);

    if (failed.length > 0) {
      warn(`Unhealthy service(s): ${failed.join(' ')}`);
      return false;
    }
    if (ready) {
      return true;
    }

    sleep(5);
  }

  warn(`Timed out after ${readinessTimeoutSeconds}s waiting for the runtime stack.`);
  return false;
}

function startStack() {
  // Export the profile-selected provider before any compose command runs: the config
  // interpolation and every one-shot's environment read the same two keys the migration
  // guard validates.
  const provider = runtimeDatabaseProvider();
  if (provider !== undefined) {
    process.env.DATABASE_ENGINE = provider;
    process.env.AUTH_PERSISTENCE = provider;
  }

  const config = resolveComposeConfig();
  const plan = composeStartupPlan(config);
  const oneShots = oneShotServices(plan);
  const expectedServices = Object.keys(config.services).filter((name) => !oneShots.includes(name));
  if (expectedServices.length === 0) throw new Error('Runtime stack must select a long-running service.');

  for (const args of startupCommands({ composeFile, plan })) {
    const isBake = args[0] === 'scripts/build-images.mjs';
    process.stdout.write(`+ ${isBake ? `${process.execPath} ` : 'docker '}${args.join(' ')}\n`);
    const result = isBake ? spawnSync(process.execPath, args, { encoding: 'utf8', stdio: 'inherit' }) : docker(args);
    if (result.status !== 0) {
      return false;
    }
  }

  return assertReady(expectedServices, oneShots);
}

function main() {
  for (let attempt = 1; attempt <= startAttempts; attempt += 1) {
    let ready = false;
    try {
      ready = startStack();
    } catch (error) {
      warn(error.message);
    }
    if (ready) {
      process.stdout.write(`Runtime stack ready on attempt ${attempt}.\n`);
      return 0;
    }

    warn(`Runtime stack start attempt ${attempt} failed.`);
    try {
      dumpDiagnostics();
    } catch {
      warn('Runtime diagnostics are unavailable because Docker inspection failed.');
    }

    if (attempt === startAttempts) {
      const message = `Runtime stack failed to start after ${attempt} attempt(s).`;
      process.stderr.write(`${annotate ? `::error::${message}` : message}\n`);
      return 1;
    }

    // Reset to a clean slate so a half-started stack cannot poison the retry, then back off to let
    // the runner recover CPU and IO.
    docker(['compose', '-f', composeFile, 'down', '--remove-orphans', '--volumes']);
    sleep(attempt * 15);
  }

  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
