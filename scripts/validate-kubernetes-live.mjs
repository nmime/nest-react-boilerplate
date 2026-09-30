#!/usr/bin/env node
// Non-persisting read and server-dry-run evidence for REQ-RUNTIME-DELIVERY-009.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { helmValueFiles } from './delivery-inventory.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kubernetesNamePattern = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u;

const fail = (message) => {
  throw new Error(message);
};

export function parseLiveValidationOptions(argv) {
  const options = {
    backupCronJob: undefined,
    context: '',
    maxBackupAgeMinutes: 90,
    namespace: 'nest-react-boilerplate',
    plan: false,
    release: 'nest-react-boilerplate',
    timeout: '2m',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const take = () => argv[(index += 1)] ?? fail(`${argument} requires a value`);
    if (argument === '--context') options.context = take();
    else if (argument.startsWith('--context=')) options.context = argument.slice('--context='.length);
    else if (argument === '--namespace') options.namespace = take();
    else if (argument.startsWith('--namespace=')) options.namespace = argument.slice('--namespace='.length);
    else if (argument === '--release') options.release = take();
    else if (argument.startsWith('--release=')) options.release = argument.slice('--release='.length);
    else if (argument === '--backup-cronjob') options.backupCronJob = take();
    else if (argument.startsWith('--backup-cronjob=')) {
      options.backupCronJob = argument.slice('--backup-cronjob='.length);
    } else if (argument === '--max-backup-age-minutes') {
      options.maxBackupAgeMinutes = Number(take());
    } else if (argument.startsWith('--max-backup-age-minutes=')) {
      options.maxBackupAgeMinutes = Number(argument.slice('--max-backup-age-minutes='.length));
    } else if (argument === '--timeout') options.timeout = take();
    else if (argument.startsWith('--timeout=')) options.timeout = argument.slice('--timeout='.length);
    else if (argument === '--plan') options.plan = true;
    else fail(`Unknown argument: ${argument}`);
  }

  if (!options.context.trim()) fail('--context is required; implicit current-context access is forbidden');
  for (const [label, value] of [
    ['namespace', options.namespace],
    ['release', options.release],
    ['backup CronJob', options.backupCronJob],
  ]) {
    if (value !== undefined && (!kubernetesNamePattern.test(value) || value.length > 63)) {
      fail(`Invalid Kubernetes ${label}: ${value}`);
    }
  }
  if (!Number.isInteger(options.maxBackupAgeMinutes) || options.maxBackupAgeMinutes < 1) {
    fail('--max-backup-age-minutes must be a positive integer');
  }
  if (!/^[1-9]\d*[smh]$/u.test(options.timeout)) fail('--timeout must be a positive Kubernetes duration in s, m, or h');
  return options;
}

export function loadLiveValidationSelection(workspaceRoot = rootDir, checkClosure = spawnSync) {
  // The canonical checker compares generated selection bytes to the live graph,
  // configuration, and provider. Merely finding an overlay is not freshness.
  const checked = checkClosure('pnpm', ['nrb', 'closure', 'check'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (checked.error || checked.status !== 0) {
    fail('Selected closure is missing or stale; run pnpm nrb setup and pnpm nrb closure install before preflight');
  }
  const closure = JSON.parse(readFileSync(join(workspaceRoot, '.nrb/closure.json'), 'utf8'));
  if (![null, 'postgres', 'mongodb'].includes(closure.provider)) fail('Invalid selected closure provider');
  return { provider: closure.provider, configHash: closure.configHash };
}

const helmArgs = (options) => ['--namespace', options.namespace, '--kube-context', options.context];
const kubectlArgs = (options) => ['--context', options.context, '--namespace', options.namespace];

export function buildLiveValidationPlan(
  options,
  manifestPath = '<rendered-manifest>',
  previousRevision = '<previous>',
) {
  if (![null, 'postgres', 'mongodb'].includes(options.provider)) {
    fail('Kubernetes preflight requires a validated selected closure provider');
  }
  if (options.provider === null && options.backupCronJob !== undefined) {
    fail('Provider-free selection cannot validate a database backup CronJob');
  }
  const backupCronJob =
    options.backupCronJob ?? (options.provider === null ? null : `${options.release}-${options.provider}-backup`);
  if (backupCronJob !== null && backupCronJob.length > 63) {
    fail('Default backup CronJob name exceeds 63 characters; provide --backup-cronjob explicitly');
  }
  const valuesArgs = helmValueFiles.flatMap((path) => ['-f', path]);
  const backupJob = `${options.release}-backup-preflight`;
  if (options.provider !== null && backupJob.length > 63) fail('Release name is too long for the backup preflight job');
  return [
    {
      id: 'render',
      command: 'helm',
      args: ['template', options.release, '.helm', '--namespace', options.namespace, ...valuesArgs, '--include-crds'],
    },
    {
      id: 'helm-server-dry-run',
      command: 'helm',
      args: [
        'upgrade',
        '--install',
        options.release,
        '.helm',
        ...valuesArgs,
        ...helmArgs(options),
        '--dry-run=server',
        '--hide-secret',
      ],
    },
    {
      id: 'admission-dry-run',
      command: 'kubectl',
      args: [
        ...kubectlArgs(options),
        'apply',
        '--server-side',
        '--field-manager=nrb-preflight',
        '--force-conflicts',
        '--dry-run=server',
        '--validate=strict',
        '-f',
        manifestPath,
      ],
    },
    {
      id: 'current-rollout',
      command: 'kubectl',
      args: [
        ...kubectlArgs(options),
        'rollout',
        'status',
        'deployment',
        `--selector=app.kubernetes.io/instance=${options.release}`,
        `--timeout=${options.timeout}`,
      ],
    },
    {
      id: 'release-history',
      command: 'helm',
      args: ['history', options.release, ...helmArgs(options), '--output', 'json'],
    },
    {
      id: 'rollback-server-dry-run',
      command: 'helm',
      args: [
        'rollback',
        options.release,
        String(previousRevision),
        ...helmArgs(options),
        '--dry-run=server',
        '--no-hooks',
        `--timeout=${options.timeout}`,
      ],
    },
    ...(options.provider === null
      ? []
      : [
          {
            id: 'backup-freshness',
            command: 'kubectl',
            args: [...kubectlArgs(options), 'get', 'cronjob', backupCronJob, '--output', 'json'],
          },
          {
            id: 'backup-admission-dry-run',
            command: 'kubectl',
            args: [
              ...kubectlArgs(options),
              'create',
              'job',
              backupJob,
              `--from=cronjob/${backupCronJob}`,
              '--dry-run=server',
              '--output=name',
            ],
          },
        ]),
  ];
}

export function selectPreviousRevision(history) {
  if (!Array.isArray(history) || history.length < 2) fail('Rollback validation requires at least two Helm revisions');
  const currentRevision = Number(history.at(-1)?.revision);
  const previous = history
    .slice(0, -1)
    .reverse()
    .find((entry) => ['deployed', 'superseded'].includes(String(entry?.status).toLowerCase()));
  const previousRevision = Number(previous?.revision);
  if (
    !Number.isInteger(currentRevision) ||
    !Number.isInteger(previousRevision) ||
    previousRevision >= currentRevision
  ) {
    fail('Unable to select a safe previous Helm revision for rollback validation');
  }
  return previousRevision;
}

export function assertRecentBackup(cronJob, maxAgeMinutes, now = Date.now()) {
  if (cronJob?.spec?.suspend === true) fail('Backup CronJob is suspended');
  const lastSuccessfulTime = cronJob?.status?.lastSuccessfulTime;
  if (typeof lastSuccessfulTime !== 'string') fail('Backup CronJob has no successful run');
  const successfulAt = Date.parse(lastSuccessfulTime);
  if (!Number.isFinite(successfulAt)) fail('Backup CronJob lastSuccessfulTime is invalid');
  const ageMinutes = (now - successfulAt) / 60_000;
  if (ageMinutes < 0 || ageMinutes > maxAgeMinutes) {
    fail(`Latest successful backup is ${Math.floor(ageMinutes)} minutes old; maximum is ${maxAgeMinutes}`);
  }
  return ageMinutes;
}

function runStep(step, { capture = false } = {}) {
  const result = spawnSync(step.command, step.args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: capture ? 'pipe' : 'ignore',
  });
  if (result.error) fail(`${step.id} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${step.id} failed with exit code ${result.status ?? 1}`);
  return result.stdout ?? '';
}

function main() {
  const options = parseLiveValidationOptions(process.argv.slice(2));
  const selectionPath = resolve(rootDir, helmValueFiles.at(-1));
  if (
    process.env.NRB_ALL_REFERENCE === 'true' ||
    (process.env.HELM_SELECTION_VALUES && resolve(rootDir, process.env.HELM_SELECTION_VALUES) !== selectionPath)
  ) {
    fail(
      'Existing-release preflight requires the current product selection, not an all-reference or alternate overlay',
    );
  }
  Object.assign(options, loadLiveValidationSelection());
  if (options.plan) {
    console.log(
      JSON.stringify(
        {
          mode: 'no-deploy',
          provider: options.provider,
          configHash: options.configHash,
          backup: options.provider === null ? 'not-applicable: provider-free selection' : 'required',
          steps: buildLiveValidationPlan(options),
        },
        null,
        2,
      ),
    );
    return;
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'nrb-kubernetes-preflight-'));
  const manifestPath = join(temporaryDirectory, 'candidate.yaml');
  try {
    let plan = buildLiveValidationPlan(options, manifestPath);
    writeFileSync(manifestPath, runStep(plan[0], { capture: true }), { mode: 0o600 });
    runStep(plan[1]);
    runStep(plan[2]);
    runStep(plan[3]);

    const history = JSON.parse(runStep(plan[4], { capture: true }));
    const previousRevision = selectPreviousRevision(history);
    plan = buildLiveValidationPlan(options, manifestPath, previousRevision);
    runStep(plan[5]);

    let backupAgeMinutes = null;
    let backupCronJob = null;
    if (options.provider !== null) {
      const backupStep = plan.find((step) => step.id === 'backup-freshness');
      backupCronJob = backupStep.args.at(-3);
      const observedBackup = JSON.parse(runStep(backupStep, { capture: true }));
      backupAgeMinutes = Math.floor(assertRecentBackup(observedBackup, options.maxBackupAgeMinutes));
      runStep(plan.find((step) => step.id === 'backup-admission-dry-run'));
    }

    console.log(
      JSON.stringify({
        status: 'ok',
        mode: 'non-persisting-server-preflight',
        context: options.context,
        namespace: options.namespace,
        release: options.release,
        previousRevision,
        provider: options.provider,
        configHash: options.configHash,
        backupCronJob,
        backupAgeMinutes,
        backup: options.provider === null ? 'not-applicable: provider-free selection' : 'validated',
      }),
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(`Kubernetes live validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
