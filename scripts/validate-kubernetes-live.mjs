#!/usr/bin/env node
// Non-persisting read and server-dry-run evidence for REQ-RUNTIME-DELIVERY-009.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  options.backupCronJob ??= `${options.release}-postgres-backup`;
  if (!options.context.trim()) fail('--context is required; implicit current-context access is forbidden');
  for (const [label, value] of [
    ['namespace', options.namespace],
    ['release', options.release],
    ['backup CronJob', options.backupCronJob],
  ]) {
    if (!kubernetesNamePattern.test(value) || value.length > 63) fail(`Invalid Kubernetes ${label}: ${value}`);
  }
  if (!Number.isInteger(options.maxBackupAgeMinutes) || options.maxBackupAgeMinutes < 1) {
    fail('--max-backup-age-minutes must be a positive integer');
  }
  if (!/^\d+[smh]$/u.test(options.timeout)) fail('--timeout must be a positive Kubernetes duration in s, m, or h');
  return options;
}

const helmArgs = (options) => ['--namespace', options.namespace, '--kube-context', options.context];
const kubectlArgs = (options) => ['--context', options.context, '--namespace', options.namespace];

export function buildLiveValidationPlan(
  options,
  manifestPath = '<rendered-manifest>',
  previousRevision = '<previous>',
) {
  const backupJob = `${options.release}-backup-preflight`;
  return [
    {
      id: 'render',
      command: 'helm',
      args: [
        'template',
        options.release,
        '.helm',
        '--namespace',
        options.namespace,
        '-f',
        '.helm/values-production.yaml',
        '--include-crds',
      ],
    },
    {
      id: 'helm-server-dry-run',
      command: 'helm',
      args: [
        'upgrade',
        '--install',
        options.release,
        '.helm',
        '-f',
        '.helm/values-production.yaml',
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
    {
      id: 'backup-freshness',
      command: 'kubectl',
      args: [...kubectlArgs(options), 'get', 'cronjob', options.backupCronJob, '--output', 'json'],
    },
    {
      id: 'backup-admission-dry-run',
      command: 'kubectl',
      args: [
        ...kubectlArgs(options),
        'create',
        'job',
        backupJob,
        `--from=cronjob/${options.backupCronJob}`,
        '--dry-run=server',
        '--output=name',
      ],
    },
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
  if (options.plan) {
    console.log(JSON.stringify({ mode: 'no-deploy', steps: buildLiveValidationPlan(options) }, null, 2));
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

    const backupCronJob = JSON.parse(runStep(plan[6], { capture: true }));
    const backupAgeMinutes = assertRecentBackup(backupCronJob, options.maxBackupAgeMinutes);
    runStep(plan[7]);

    console.log(
      JSON.stringify({
        status: 'ok',
        mode: 'non-persisting-server-preflight',
        context: options.context,
        namespace: options.namespace,
        release: options.release,
        previousRevision,
        backupCronJob: options.backupCronJob,
        backupAgeMinutes: Math.floor(backupAgeMinutes),
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
