#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
const mode = modeArg?.split('=', 2)[1] ?? process.env.DEPLOY_VALIDATE_MODE ?? 'all';
const allReference = process.argv.includes('--all-reference');
const providerArg = process.argv.find((arg) => arg.startsWith('--provider='));
const provider = providerArg?.split('=', 2)[1];
const requireHelm =
  mode === 'helm' ||
  mode === 'gitops' ||
  process.argv.includes('--require-helm') ||
  process.env.REQUIRE_HELM === 'true';
const supportedModes = new Set(['all', 'docker', 'helm', 'gitops', 'pm2']);
const referenceContextFiles = [
  'Caddyfile.per-app-domains',
  'Caddyfile.single-domain',
  'closure.json',
  'nrb.config.json',
  'workspace.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'lock.json',
  'helm-values.yaml',
];
let validationEnvironment = process.env;

if (!supportedModes.has(mode)) {
  console.error(`Unsupported deployment validation mode: ${mode}. Expected one of: ${[...supportedModes].join(', ')}.`);
  process.exit(2);
}
if (allReference && provider !== 'postgres' && provider !== 'mongodb') {
  console.error('--all-reference requires --provider=postgres or --provider=mongodb.');
  process.exit(2);
}
if (!allReference && provider !== undefined) {
  console.error('--provider is valid only with --all-reference.');
  process.exit(2);
}

const run = (label, command, args, options = {}) => {
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const commandExists = (command) =>
  spawnSync('sh', ['-c', `command -v ${command} >/dev/null 2>&1`], {
    cwd: rootDir,
    stdio: 'ignore',
  }).status === 0;

const hasAny = (paths) => paths.some((path) => existsSync(join(rootDir, path)));

if (allReference) {
  run(`${provider} all-reference closure`, 'pnpm', [
    'nrb',
    'closure',
    'materialize',
    '--all-reference',
    '--provider',
    provider,
  ]);
  const contextRoot = join(rootDir, '.nrb', 'reference', provider);
  const missing = referenceContextFiles.filter((file) => !existsSync(join(contextRoot, file)));
  if (missing.length > 0) {
    console.error(`All-reference ${provider} context is incomplete: ${missing.join(', ')}`);
    process.exit(1);
  }
  validationEnvironment = {
    ...process.env,
    NRB_CLOSURE_CONTEXT: contextRoot,
    NRB_CLOSURE_MANIFEST: join(contextRoot, 'closure.json'),
    HELM_SELECTION_VALUES: join(contextRoot, 'helm-values.yaml'),
    NRB_ALL_REFERENCE: 'true',
  };
}

const validateDocker = () => {
  const options = { env: validationEnvironment };
  run(
    'Docker/static deployment config',
    process.execPath,
    ['scripts/validate-deployment-config.mjs', '--mode=docker'],
    options,
  );
  run(
    'Docker Compose production wrapper tests',
    process.execPath,
    ['--test', 'scripts/compose-production.spec.mjs'],
    options,
  );
  run(
    'Docker Compose production init scaffolder tests',
    process.execPath,
    ['--test', 'scripts/compose-production-init.spec.mjs'],
    options,
  );
  run('Standalone migrator provider tests', process.execPath, ['--test', 'docker/migrator-run.spec.mjs'], options);
  run(
    'Single-server deployment tests',
    process.execPath,
    ['--test', 'scripts/single-server-deployment.spec.mjs'],
    options,
  );
  run(
    'Native datastore provisioning tests',
    process.execPath,
    ['--test', 'scripts/native-datastores.spec.mjs'],
    options,
  );
  run(
    'Single-server deployment contract',
    process.execPath,
    ['scripts/validate-single-server-deployment.mjs'],
    options,
  );
  run('Docker Compose production config', process.execPath, ['scripts/validate-docker-compose-prod.mjs'], options);
  run(
    'Docker Compose database/domain/TLS topology renders',
    process.execPath,
    ['scripts/validate-compose-modes.mjs'],
    options,
  );
};

const validateHelm = () => {
  if (!existsSync(join(rootDir, '.helm'))) {
    console.error('Helm mode selected but .helm/ chart directory is missing.');
    process.exit(1);
  }

  if (!allReference) {
    run('Selected closure freshness', 'pnpm', ['nrb', 'closure', 'check']);
    validationEnvironment = {
      ...process.env,
      HELM_SELECTION_VALUES: join(rootDir, '.helm', 'values-selection.yaml'),
    };
  }
  const options = { env: validationEnvironment };
  run(
    'Helm/static deployment config',
    process.execPath,
    ['scripts/validate-deployment-config.mjs', '--mode=helm'],
    options,
  );
  run('Helm rate-limit static config', process.execPath, ['scripts/validate-helm-rate-limit-config.mjs'], options);
  run(
    'Kubernetes no-deploy live preflight plan',
    process.execPath,
    ['scripts/validate-kubernetes-live.mjs', '--context=validation-only', '--plan'],
    options,
  );

  if (commandExists('helm')) {
    run('Helm render validation', 'bash', ['scripts/validate-helm.sh'], options);
    return;
  }

  if (requireHelm) {
    console.error(
      'Helm executable not found; Helm render validation is required for --mode=helm or REQUIRE_HELM=true. Install Helm 4 or use a non-Helm validation mode.',
    );
    process.exit(127);
  }

  console.log(
    'Helm executable not found; skipping Helm render validation because Helm is optional for generic deployment validation. Set REQUIRE_HELM=true or run --mode=helm to require it.',
  );
};

const validateGitOps = () => {
  const manifests = ['deploy/argocd/application.yaml', 'deploy/flux/release.yaml'];
  if (!hasAny(manifests)) {
    if (mode === 'gitops') {
      console.error(`GitOps mode selected but no Argo CD or Flux manifests are present.`);
      process.exit(1);
    }
    console.log('GitOps validation skipped: no Argo CD or Flux manifests are present.');
    return;
  }
  run('Affected release-image plan tests', process.execPath, ['--test', 'scripts/release-image-plan.spec.mjs']);
  run('Selective GitOps image-promotion tests', process.execPath, ['--test', 'scripts/update-deploy-tags.spec.mjs']);
  run('GitOps/Argo CD and Flux config', process.execPath, ['scripts/validate-gitops-config.mjs']);
};

const validatePm2 = () => {
  const pm2Configs = ['ecosystem.config.js', 'ecosystem.config.cjs', 'ecosystem.config.mjs'];
  if (!hasAny(pm2Configs)) {
    console.log(
      'PM2 validation skipped: no ecosystem.config.{js,cjs,mjs} file is present for this optional deployment mode.',
    );
    return;
  }
  run('PM2 static config', process.execPath, ['scripts/validate-pm2-config.mjs']);
  // The native release sequence and its secret resolution are shared with
  // serverctl's RUNTIME_MODE=native path, so they are contract-checked here too.
  run('Native release sequence tests', process.execPath, ['--test', 'scripts/native-release.spec.mjs']);
  run('Native runtime environment tests', process.execPath, ['--test', 'scripts/native-runtime-env.spec.mjs']);
  run('Native datastore provisioning tests', process.execPath, ['--test', 'scripts/native-datastores.spec.mjs']);
};

// The unified `pnpm run deploy` planner spans every target, so its contract is
// checked in all modes: a broken plan would misdeploy regardless of runtime.
run('Unified deploy planner tests', process.execPath, ['--test', 'scripts/deploy.spec.mjs']);
// The bake generator defines the release image set; keep it gated here rather than
// relying on a standalone package.json script.
run('Bake-file generator tests', process.execPath, ['--test', 'scripts/generate-bake-file.spec.mjs']);

if (mode === 'docker') {
  validateDocker();
} else if (mode === 'helm') {
  validateHelm();
} else if (mode === 'gitops') {
  validateHelm();
  validateGitOps();
} else if (mode === 'pm2') {
  validatePm2();
} else {
  validateDocker();
  validateHelm();
  validateGitOps();
  validatePm2();
}

console.log(`deployment validation passed (${mode} mode)`);
