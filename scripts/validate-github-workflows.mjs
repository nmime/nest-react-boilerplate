#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-RELEASE-003
// Security and operations evidence for REQ-ASSURANCE-RELEASE-003.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflowDir = new URL('../.github/workflows', import.meta.url);
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort()
  .map((name) => ({
    name,
    text: readFileSync(join(workflowDir.pathname, name), 'utf8'),
  }));

const shaPinnedAction = /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+@[a-f0-9]{40}(?:\s+#\s+.+)?$/u;
const dockerAction = /^docker:\/\//u;
const localAction = /^\.\//u;

assert.ok(workflows.length > 0, 'No GitHub workflows found');

for (const { name, text } of workflows) {
  assert.ok(!/pull_request_target:/u.test(text), `${name} must not use pull_request_target`);
  assert.ok(/^permissions:/mu.test(text), `${name} must declare top-level permissions`);
  assert.ok(!/write-all|read-all/u.test(text), `${name} must avoid broad read-all/write-all permissions`);

  const usesLines = text.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu);
  for (const match of usesLines) {
    const action = match[1] ?? '';
    if (localAction.test(action) || dockerAction.test(action)) continue;
    assert.ok(shaPinnedAction.test(action), `${name} action must be pinned to a full commit SHA: ${action}`);
  }

  if (name !== 'release-images.yml' && name !== 'scorecard.yml') {
    assert.ok(!/packages:\s*write/u.test(text), `${name} must not request packages: write`);
    assert.ok(!/id-token:\s*write/u.test(text), `${name} must not request id-token: write`);
  }
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const scripts = packageJson.scripts ?? {};
const ci = workflows.find((workflow) => workflow.name === 'ci.yml')?.text ?? '';
const release = workflows.find((workflow) => workflow.name === 'release.yml')?.text ?? '';
const releaseImagesWorkflow = workflows.find((workflow) => workflow.name === 'release-images.yml')?.text ?? '';
const deployWorkflow = workflows.find((workflow) => workflow.name === 'deploy.yml')?.text ?? '';
const nightlyAssurance = workflows.find((workflow) => workflow.name === 'spec-assurance-nightly.yml')?.text ?? '';
const runtimeAssurance = workflows.find((workflow) => workflow.name === 'spec-assurance-runtime.yml')?.text ?? '';
const githubReleaseNotes = readFileSync(new URL('../.github/release.yml', import.meta.url), 'utf8');
const gitleaksConfig = readFileSync(new URL('../.gitleaks.toml', import.meta.url), 'utf8');
const nxCacheAction = readFileSync(new URL('../.github/actions/nx-cache/action.yml', import.meta.url), 'utf8');
const nxCacheDocs = readFileSync(new URL('../docs/ci-cache.md', import.meta.url), 'utf8');
const fullstackCompose = readFileSync(new URL('../apps/e2e/fullstack/src/compose.ts', import.meta.url), 'utf8');
const fullstackSpec = readFileSync(new URL('../apps/e2e/fullstack/src/fullstack.spec.ts', import.meta.url), 'utf8');
const bunCompatibilityCommand = readFileSync(
  new URL('../packages/tooling/src/commands/tooling/bun-compat.ts', import.meta.url),
  'utf8',
);
const developmentCompose = readFileSync(new URL('../docker/docker-compose.yml', import.meta.url), 'utf8');
assert.ok(
  nxCacheAction.includes('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'),
  'Nx cache composite action must pin actions/cache to a full commit SHA',
);
assert.ok(nxCacheAction.includes('path: .nx/cache'), 'Nx cache composite action must cache only Nx task outputs');
assert.ok(!nxCacheAction.includes('secrets.'), 'Nx cache composite action must not receive secrets');
assert.ok(ci.includes('NX_CACHE_DIRECTORY: .nx/cache'), 'CI must use the explicit Nx cache directory');
for (const scope of ['fast', 'spec-evidence', 'non-runtime', 'bun', 'quality', 'e2e', 'mongodb']) {
  assert.ok(ci.includes(`scope: ${scope}`), `CI must restore the remote Nx cache for ${scope}`);
}
assert.ok(
  nxCacheDocs.includes('GitHub Actions cache service'),
  'CI cache documentation must explain the remote backend',
);
assert.ok(
  nxCacheDocs.includes('Do not add `.env*`'),
  'CI cache documentation must prohibit secret-bearing cache paths',
);
assert.ok(release.includes('RELEASE_PROVIDER: github'), 'release.yml must select only the GitHub release provider');
// The release repository is overridable so forks/adopters can enable CD, but
// the upstream `nmime` default must be preserved.
assert.ok(
  release.includes("vars.RELEASE_REPOSITORY || 'nmime/nest-react-boilerplate'"),
  'release.yml must gate releases on RELEASE_REPOSITORY with the nmime default',
);
assert.ok(
  !release.includes('GIT_AUTHOR_NAME:') && !release.includes('GIT_COMMITTER_NAME:'),
  'release.yml must not configure an identity for forbidden protected-branch release commits',
);
assert.ok(release.includes('workflow_run:'), 'release.yml must wait for the CI workflow');
assert.ok(
  release.includes("github.event.workflow_run.conclusion == 'success'"),
  'release.yml must require a successful CI conclusion',
);
assert.ok(
  release.includes('ref: ${{ github.event.workflow_run.head_sha }}'),
  'release.yml must checkout the exact verified CI commit',
);
assert.ok(
  release.includes('test "$(git rev-parse origin/main)" = "$VERIFIED_SHA"'),
  'release.yml must refuse a stale successful CI commit after main advances',
);
assert.ok(
  ci.includes('Enforce every required CI result'),
  'ci.yml summary must fail when any required job did not succeed',
);

// Every gate job must be both awaited by and enforced in ci-status-summary. Without this a new
// job silently becomes non-blocking: the summary asserts only that the enforce step exists.
const ciJobNames = (() => {
  const jobsIndex = ci.indexOf('\njobs:\n');
  assert.ok(jobsIndex !== -1, 'ci.yml must declare a top-level jobs block');
  return [...ci.slice(jobsIndex).matchAll(/^ {2}([a-zA-Z0-9_-]+):$/gmu)].map((match) => match[1]);
})();
assert.ok(ciJobNames.length > 5, `ci.yml job list could not be parsed (found ${ciJobNames.length})`);
assert.ok(ciJobNames.includes('ci-status-summary'), 'ci.yml must define the ci-status-summary aggregator');

const summaryNeedsMatch = /^ {2}ci-status-summary:\n(?:.*\n)*? {4}needs:\n((?: {6}- [a-zA-Z0-9_-]+\n)+)/mu.exec(ci);
assert.ok(summaryNeedsMatch, 'ci.yml ci-status-summary must declare an explicit needs list');
const awaitedJobs = new Set([...summaryNeedsMatch[1].matchAll(/- ([a-zA-Z0-9_-]+)/gu)].map((match) => match[1]));

const requiredResultsMatch = /REQUIRED_RESULTS: >-\n((?:[^\S\n]+\$\{\{ needs\.[a-zA-Z0-9_-]+\.result \}\}\n)+)/u.exec(
  ci,
);
assert.ok(requiredResultsMatch, 'ci.yml must declare REQUIRED_RESULTS as a list of needs results');
const enforcedJobs = new Set(
  [...requiredResultsMatch[1].matchAll(/needs\.([a-zA-Z0-9_-]+)\.result/gu)].map((match) => match[1]),
);

for (const job of ciJobNames) {
  if (job === 'ci-status-summary') continue;
  assert.ok(awaitedJobs.has(job), `ci.yml ci-status-summary needs must include every gate job; missing: ${job}`);
  assert.ok(enforcedJobs.has(job), `ci.yml REQUIRED_RESULTS must enforce every gate job; missing: ${job}`);
}
for (const job of awaitedJobs) {
  assert.ok(ciJobNames.includes(job), `ci.yml ci-status-summary needs a job that does not exist: ${job}`);
}
assert.ok(
  ci.includes('origin/$GITHUB_BASE_REF..$PR_HEAD_SHA'),
  'ci.yml must validate authored commits without including the synthetic pull-request merge commit',
);
// Gates that exist but run in no pipeline are dead QA surface; pin the ones that were added
// after being found unwired, plus the e2e selection that must never reach the Docker suite.
for (const required of [
  'pnpm run frontend:fsd:check',
  'pnpm run api:toast-config:check',
  'pnpm run audit:licenses',
  'pnpm run audit:full',
]) {
  assert.ok(ci.includes(required), `ci.yml must run the previously unwired gate: ${required}`);
}
assert.ok(
  !/nx run-many -t e2e --all(?! --exclude fullstack-e2e)/u.test(JSON.stringify(scripts)),
  'package.json e2e aggregates must exclude fullstack-e2e; the Docker-managed Playwright suite rejects forwarded flags and needs a Compose stack',
);

// A scheduled workflow has no pull request to turn red, so the gates it uniquely owns rot
// invisibly unless failure is surfaced somewhere a human sees it.
for (const [name, text] of [
  ['quality-presets.yml', workflows.find((workflow) => workflow.name === 'quality-presets.yml')?.text ?? ''],
  [
    'spec-assurance-nightly.yml',
    workflows.find((workflow) => workflow.name === 'spec-assurance-nightly.yml')?.text ?? '',
  ],
]) {
  assert.ok(text.includes('if: failure()'), `${name} must surface failures from its scheduled run`);
  assert.ok(text.includes('issues: write'), `${name} must be able to open its failure issue`);
  assert.ok(text.includes('gh issue create'), `${name} failure reporter must open an issue when none is open`);
}

for (const required of [
  'name: Exact-SHA specification evidence',
  'pnpm run spec:verify',
  '--lane "$lane"',
  '--base "$base"',
  '--head HEAD',
  '${{ needs.spec-evidence.result }}',
]) {
  assert.ok(ci.includes(required), `ci.yml missing exact-SHA specification gate: ${required}`);
}
for (const required of [
  "cron: '21 1 * * *'",
  'pnpm run spec:verify -- --all --lane nightly',
  'docker compose -f docker/docker-compose.yml up -d --build',
  'nightly-specification-assurance',
]) {
  assert.ok(nightlyAssurance.includes(required), `nightly assurance workflow missing required contract: ${required}`);
}
for (const required of [
  'workflow_dispatch:',
  'pnpm run spec:verify -- --all --lane runtime',
  'runtime-specification-assurance',
]) {
  assert.ok(runtimeAssurance.includes(required), `runtime assurance workflow missing required contract: ${required}`);
}
for (const required of [
  'Build every setup-selected release image',
  'pnpm nrb closure install',
  'pnpm run deploy:validate:helm',
  'release-image-plan.mjs',
  '[[ "$GITHUB_REF" == refs/tags/* ]]',
  'generate-bake-file.mjs --only "${SELECTED_IMAGES}"',
]) {
  assert.ok(
    releaseImagesWorkflow.includes(required),
    `release-images.yml missing selected closure contract: ${required}`,
  );
}
for (const required of [
  'git switch --detach "$RELEASE_SHA"',
  'pnpm nrb closure check',
  'release-image-plan.mjs --names',
  'cp .helm/values-selection.yaml /tmp/nrb-helm-values.yaml',
  'cmp -s /tmp/nrb-helm-values.yaml .helm/values-selection.yaml',
  '--selected-image',
  '--selection-values-file /tmp/nrb-helm-values.yaml',
  '--print-required',
  'Missing immutable candidate digests for selected and enabled images',
  'git switch main',
]) {
  assert.ok(deployWorkflow.includes(required), `deploy.yml missing selected closure contract: ${required}`);
}
assert.ok(
  !releaseImagesWorkflow.includes('--all-reference') && !deployWorkflow.includes('--all-reference'),
  'Product release and promotion workflows must never bypass the selected closure with all-reference mode',
);
for (const required of ['pnpm run test:coverage:all', 'pnpm run test:e2e:coverage:all']) {
  assert.ok(ci.includes(required), `ci.yml missing explicit maintainer test command: ${required}`);
}
for (const required of [
  '[extend]',
  'useDefault = true',
  'id = "generic-api-key"',
  'id = "discord-client-id"',
  '[[rules.allowlists]]',
  'condition = "AND"',
  'mailpace-email-notification\\.provider\\.spec\\.ts',
  'resend-email-notification\\.provider\\.spec\\.ts',
  'health-sanitize\\.util\\.spec\\.ts',
  'notification-delivery-1',
  'sk-live-abc123',
  'better-auth\\.config\\.spec\\.ts',
  'test-secret-placeholder-min-32-chars-long',
  'discord-app-api\\.module\\.spec\\.ts',
  'discord-command-registration\\.service\\.spec\\.ts',
  'discord-config\\.spec\\.ts',
  '123456789012345678',
]) {
  assert.ok(gitleaksConfig.includes(required), `.gitleaks.toml missing narrow fixture allowlist: ${required}`);
}
for (const section of ['Breaking Changes', 'Features', 'Bug Fixes', 'Performance', 'Security', 'Maintenance']) {
  assert.ok(githubReleaseNotes.includes(`title: ${section}`), `.github/release.yml missing ${section} category`);
}
assert.ok(
  !workflows.some((workflow) => workflow.name === 'release-gitlab.yml'),
  'GitLab releases must run in GitLab CI, not as a second workflow on every GitHub push',
);

const gitlabCi = readFileSync(new URL('../.gitlab-ci.yml', import.meta.url), 'utf8');
const gitlabJob = (name, nextName) => {
  const start = gitlabCi.indexOf(`${name}:\n`);
  const end = nextName ? gitlabCi.indexOf(`${nextName}:\n`, start + name.length + 2) : gitlabCi.length;
  assert.ok(start >= 0, `.gitlab-ci.yml is missing job ${name}`);
  assert.ok(end > start, `.gitlab-ci.yml cannot isolate job ${name}`);
  return gitlabCi.slice(start, end);
};
const assertOrderedCommands = (jobName, job, commands) => {
  let previous = -1;
  for (const command of commands) {
    const position = job.indexOf(command);
    assert.ok(position >= 0, `.gitlab-ci.yml ${jobName} missing closure contract: ${command}`);
    assert.ok(position > previous, `.gitlab-ci.yml ${jobName} must run ${command} after closure preparation.`);
    previous = position;
  }
};
for (const required of [
  'stage: release',
  'pnpm exec semantic-release',
  'RELEASE_PROVIDER: gitlab',
  '$GITLAB_TOKEN != null || $GL_TOKEN != null',
  'spec-evidence:',
  'pnpm run spec:validate',
  'pnpm run spec:verify',
  '--lane "$lane"',
  '--base "$base"',
  '--head HEAD',
  'test "$(git rev-parse HEAD)" = "$CI_COMMIT_SHA"',
  'git fetch --no-tags origin "$CI_DEFAULT_BRANCH"',
  'git rev-parse FETCH_HEAD',
  'Refusing stale release',
  '$CI_PIPELINE_SOURCE == "push"',
]) {
  assert.ok(gitlabCi.includes(required), `.gitlab-ci.yml missing provider-isolated release contract: ${required}`);
}
for (const forbidden of [
  'gitleaks:latest',
  '|| true',
  'allow_failure: true',
  'mcr.microsoft.com/playwright:v1.54.2',
  '\n  image: docker:27-dind',
]) {
  assert.ok(!gitlabCi.includes(forbidden), `.gitlab-ci.yml contains a fail-open or stale CI contract: ${forbidden}`);
}
for (const required of [
  'gitleaks:',
  'zricethezav/gitleaks:v8.28.0',
  'node:24.18.0-alpine',
  'mcr.microsoft.com/playwright:v1.61.1-noble',
  'docker:27.5.1-dind',
  'postgres:17.6-alpine',
  'docker-cli-compose',
  'DOCKER_HOST: tcp://docker:2375',
  "DOCKER_TLS_CERTDIR: ''",
  'mongodb-validation:',
  'docker-fullstack-mongodb:',
  'DATABASE_ENGINE: mongodb',
  'AUTH_PERSISTENCE: mongodb',
  'MONGODB_REPLICA_SET: rs0',
  // The GitLab lane claims to mirror ci.yml, so it must evaluate the coverage contract too:
  // plain `test:all` leaves coverage.enabled false and every threshold unchecked.
  'pnpm run test:coverage:all',
  'pnpm run test:e2e:coverage:all',
]) {
  assert.ok(gitlabCi.includes(required), `.gitlab-ci.yml missing pinned CI contract: ${required}`);
}
// The fullstack selection derives Compose profiles from the installed closure and throws on any
// service-reduction flag, so pinning either in CI makes the job fail before Docker starts.
for (const forbidden of ['COMPOSE_PROFILES:', 'FULLSTACK_API_CRITICAL_ONLY', 'FULLSTACK_CRITICAL_ONLY']) {
  assert.ok(
    !gitlabJob('docker-fullstack-mongodb', 'storybook-tests').includes(forbidden),
    `.gitlab-ci.yml docker-fullstack-mongodb must let setup derive the fullstack selection: ${forbidden}`,
  );
}
for (const forbidden of ['COMPOSE_PROFILES: mongodb,postgres', 'COMPOSE_PROFILES: postgres,mongodb']) {
  assert.ok(!gitlabCi.includes(forbidden), `.gitlab-ci.yml must not enable both database providers: ${forbidden}`);
}

const gitlabHelmJob = gitlabJob('helm-validation', 'fast-check');
for (const required of [
  'HELM_SELECTION: provider-free',
  "SETUP_ARGS: '--replace --app landing-app --non-interactive'",
  'HELM_SELECTION: postgres',
  "SETUP_ARGS: '--replace --app auth-app-api --capability postgres --non-interactive'",
  'HELM_SELECTION: mongodb',
  "SETUP_ARGS: '--replace --app auth-app-api --capability mongodb --non-interactive'",
]) {
  assert.ok(gitlabHelmJob.includes(required), `.gitlab-ci.yml Helm matrix missing selected closure: ${required}`);
}
assertOrderedCommands('helm-validation', gitlabHelmJob, [
  'pnpm nrb setup $SETUP_ARGS',
  'pnpm run deploy:validate:helm',
]);
assert.ok(
  !gitlabHelmJob.includes('- pnpm run deploy:validate\n'),
  '.gitlab-ci.yml Helm validation must not use generic deployment validation without explicit ownership.',
);

const gitlabDockerSmokeJob = gitlabJob('docker-smoke-test', 'docker-fullstack');
assertOrderedCommands('docker-smoke-test', gitlabDockerSmokeJob, [
  'pnpm nrb closure materialize --all-reference --provider postgres',
  'pnpm nrb closure materialize --all-reference --provider mongodb',
  'pnpm run test:docker-smoke',
]);
assert.ok(
  gitlabDockerSmokeJob.includes("NRB_CLOSURE_CONTEXT: '$CI_PROJECT_DIR/.nrb/reference/postgres'"),
  '.gitlab-ci.yml Docker smoke must pass its explicit PostgreSQL all-reference context.',
);

const gitlabPostgresFullstackJob = gitlabJob('docker-fullstack', 'docker-fullstack-mongodb');
assertOrderedCommands('docker-fullstack', gitlabPostgresFullstackJob, [
  'pnpm run tooling:install',
  'pnpm nrb setup --replace --app fullstack-e2e --capability postgres --non-interactive',
  'pnpm nrb closure install',
  'pnpm run test:fullstack',
]);
assert.ok(
  gitlabPostgresFullstackJob.includes("NRB_CLOSURE_CONTEXT: '$CI_PROJECT_DIR/.nrb/closure'"),
  '.gitlab-ci.yml PostgreSQL fullstack must pass its installed selected closure context.',
);

const gitlabMongoFullstackJob = gitlabJob('docker-fullstack-mongodb', 'storybook-tests');
assertOrderedCommands('docker-fullstack-mongodb', gitlabMongoFullstackJob, [
  'pnpm run tooling:install',
  'pnpm nrb setup --replace --app fullstack-e2e --capability mongodb --non-interactive',
  'pnpm nrb closure install',
  'pnpm run test:fullstack',
]);
assert.ok(
  gitlabMongoFullstackJob.includes("NRB_CLOSURE_CONTEXT: '$CI_PROJECT_DIR/.nrb/closure'"),
  '.gitlab-ci.yml MongoDB fullstack must pass its installed selected closure context.',
);

for (const [command, expectedCount] of [
  ['pnpm run deploy:validate:helm', 1],
  ['pnpm run test:docker-smoke', 1],
  ['pnpm run test:fullstack', 2],
]) {
  assert.equal(
    gitlabCi.split(command).length - 1,
    expectedCount,
    `.gitlab-ci.yml has an unvalidated direct closure-required command: ${command}`,
  );
}

const { buildReleaseConfig, releaseNoteTypes } = await import('../release.config.mjs');
const pluginNames = (config) => config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
const githubReleaseConfig = buildReleaseConfig({ RELEASE_PROVIDER: 'github' });
const gitlabReleaseConfig = buildReleaseConfig({
  RELEASE_PROVIDER: 'gitlab',
  CI_REPOSITORY_URL: 'https://gitlab-ci-token:example@gitlab.example.com/group/project.git',
});
const configuredReleasePlugins = new Set([...pluginNames(githubReleaseConfig), ...pluginNames(gitlabReleaseConfig)]);
assert.ok(
  !configuredReleasePlugins.has('@semantic-release/git'),
  'semantic-release must not create an unverified release commit',
);
assert.ok(
  !configuredReleasePlugins.has('@semantic-release/changelog'),
  'semantic-release must not modify source after CI verification',
);
assert.deepEqual(
  releaseNoteTypes.map(({ type }) => type),
  ['feat', 'fix', 'perf', 'revert', 'refactor', 'docs', 'build', 'ci', 'test', 'chore'],
  'release notes must cover every accepted Conventional Commit type',
);
const declaredDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
for (const plugin of configuredReleasePlugins) {
  assert.ok(
    declaredDependencies[plugin],
    `release.config.mjs plugin must be a direct dependency under pnpm: ${plugin}`,
  );
  await import(plugin);
}
for (const [provider, config] of [
  ['GitHub', githubReleaseConfig],
  ['GitLab', gitlabReleaseConfig],
]) {
  assert.deepEqual(
    pluginNames(config).filter(
      (plugin) => plugin === '@semantic-release/changelog' || plugin === '@semantic-release/git',
    ),
    [],
    `${provider} releases must tag reviewed commits instead of pushing release commits to protected main`,
  );
}
assert.deepEqual(
  pluginNames(githubReleaseConfig).filter(
    (plugin) => plugin === '@semantic-release/github' || plugin === '@semantic-release/gitlab',
  ),
  ['@semantic-release/github'],
  'GitHub releases must not require GitLab authentication',
);
assert.deepEqual(
  pluginNames(gitlabReleaseConfig).filter(
    (plugin) => plugin === '@semantic-release/github' || plugin === '@semantic-release/gitlab',
  ),
  ['@semantic-release/gitlab'],
  'GitLab releases must not call GitHub publishing APIs',
);
assert.equal(
  gitlabReleaseConfig.repositoryUrl,
  'https://gitlab-ci-token:example@gitlab.example.com/group/project.git',
  'GitLab releases must target the checked-out GitLab repository',
);
for (const required of ['pnpm run ci:pr', 'pnpm run deploy:validate']) {
  assert.ok(ci.includes(required), `ci.yml missing required gate: ${required}`);
}
const qualityPresets = workflows.find((workflow) => workflow.name === 'quality-presets.yml')?.text ?? '';
const helmValidationJob = ci.slice(ci.indexOf('  helm-validation:'), ci.indexOf('  fast-check:'));
for (const required of [
  'selection: provider-free',
  'setup_args: --replace --app landing-app --non-interactive',
  'selection: postgres',
  'setup_args: --replace --app auth-app-api --capability postgres --non-interactive',
  'selection: mongodb',
  'setup_args: --replace --app auth-app-api --capability mongodb --non-interactive',
  'pnpm nrb setup ${{ matrix.setup_args }}',
  'pnpm run deploy:validate:helm',
]) {
  assert.ok(helmValidationJob.includes(required), `Helm CI matrix missing selected overlay contract: ${required}`);
}
assert.ok(
  !helmValidationJob.includes('pnpm run deploy:validate\n'),
  'Helm CI matrix must not invoke generic deployment validation without a selected closure.',
);

const assertDirectComposeBuildContext = (workflowName, job) => {
  const materialize = 'pnpm nrb closure materialize --all-reference --provider postgres';
  const build = 'docker compose -f docker/docker-compose.yml up -d --build';
  const context = 'NRB_CLOSURE_CONTEXT: ${{ github.workspace }}/.nrb/reference/postgres';
  assert.ok(job.includes(build), `${workflowName} runtime job must retain its direct Compose build.`);
  assert.ok(job.includes(materialize), `${workflowName} direct Compose build must materialize a closure context.`);
  assert.ok(job.includes(context), `${workflowName} direct Compose build must pass NRB_CLOSURE_CONTEXT.`);
  assert.ok(
    job.indexOf(materialize) < job.indexOf(build),
    `${workflowName} must materialize its closure context before direct Compose --build.`,
  );
};
const opsGatesJob = ci.slice(ci.indexOf('  ops-gates:'), ci.indexOf('  fullstack-e2e:'));
const qualityPresetsJob = qualityPresets.slice(qualityPresets.indexOf('  presets:'));
assertDirectComposeBuildContext('ci.yml ops-gates', opsGatesJob);
assertDirectComposeBuildContext('quality-presets.yml presets', qualityPresetsJob);
assert.ok(
  developmentCompose.includes(
    'nrb-closure: ${NRB_CLOSURE_CONTEXT:?run pnpm nrb closure install before Docker source builds}',
  ),
  'Development Compose must reject source builds when NRB_CLOSURE_CONTEXT is missing.',
);
assert.ok(
  scripts['quality:visual']?.includes('pnpm run test:visual:matrix'),
  'quality:visual must run the cross-browser/mobile visual regression matrix',
);
assert.ok(
  qualityPresets.includes('pnpm run quality:visual'),
  'scheduled quality workflow must run the pinned visual regression matrix',
);
const runtimeComposeProfiles =
  'COMPOSE_PROFILES: postgres,redis,nats,admin-app-api,user-app-api,auth-app-api,admin-app,user-app,landing-app';
for (const [workflowName, workflowText] of [
  ['ci.yml', ci],
  ['quality-presets.yml', qualityPresets],
]) {
  assert.ok(
    /ADMIN_BOOTSTRAP_ENABLED:\s*['"]true['"]/u.test(workflowText),
    `${workflowName} runtime QA stack must enable the e2e bootstrap admin`,
  );
  assert.ok(
    workflowText.includes('ADMIN_BOOTSTRAP_EMAILS: admin@example.com'),
    `${workflowName} runtime QA stack must seed the e2e bootstrap admin email`,
  );
  assert.ok(
    /AUTH_TELEGRAM_ENABLED:\s*['"]true['"]/u.test(workflowText),
    `${workflowName} runtime QA stack must enable the Telegram TMA fixture`,
  );
  assert.ok(
    /EXTERNAL_AUTH_AUTO_PROVISION_ENABLED:\s*['"]true['"]/u.test(workflowText),
    `${workflowName} runtime QA stack must enable external-auth fixture provisioning`,
  );
  assert.ok(
    workflowText.includes("TELEGRAM_BOT_TOKEN: '123456789:test-bot-token'"),
    `${workflowName} runtime QA stack must use the fullstack Telegram signing fixture`,
  );
  assert.ok(
    /RATE_LIMIT_MAX:\s*['"]1000['"]/u.test(workflowText),
    `${workflowName} runtime QA stack must budget for the five-project browser matrix`,
  );
  assert.ok(
    workflowText.includes(runtimeComposeProfiles),
    `${workflowName} runtime QA stack must activate every required Compose profile`,
  );
  assert.ok(
    /DATABASE_ENGINE:\s*postgres/u.test(workflowText) && /AUTH_PERSISTENCE:\s*postgres/u.test(workflowText),
    `${workflowName} PostgreSQL runtime lane must select only PostgreSQL persistence`,
  );
}
for (const required of [
  'readFullstackSelection',
  'validateFullstackEnvironment',
  'fullstackSelection?.services',
  "pickPort('MONGODB_PORT', 0)",
  'mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0&retryWrites=true',
  "selectedEnvironment.MONGODB_REPLICA_SET ?? 'rs0'",
  "'--entrypoint'",
  "'mongodb-init'",
  "'mongodb-migrate'",
]) {
  assert.ok(fullstackCompose.includes(required), `fullstack Compose helper missing provider contract: ${required}`);
}
assert.ok(
  fullstackSpec.includes('@critical @api-critical registration and login preserve the durable API session'),
  'fullstack e2e must retain the API-only critical auth/session smoke for browserless CI runners',
);
for (const required of [
  'mongodb-validation:',
  'MongoDB migrations, transactions, and adapters',
  'packages/tooling/src/commands/db/mongo-migrate.component.test.ts',
  '--projects=@app/backend-mongodb-main,@app/backend-mongodb-main-auth,@app/backend-mongodb-main-feature-flags,@app/backend-mongodb-main-notification',
  '--projects=@app/backend-feature-auth-main,@app/backend-feature-admin-main,@app/backend-feature-notification-main',
  'database: postgres',
  'database: mongodb',
  'setup_args: --replace --app fullstack-e2e --capability postgres --non-interactive',
  'setup_args: --replace --app fullstack-e2e --capability mongodb --non-interactive',
  'Materialize clean selected fullstack closure',
]) {
  assert.ok(ci.includes(required), `ci.yml missing MongoDB validation contract: ${required}`);
}
assert.ok(
  ci.includes('pnpm exec nx run @app/backend-feature-auth-test:component-test'),
  'The PostgreSQL component lane must not start MongoDB Testcontainers',
);
for (const forbidden of [
  'profiles: mongodb,postgres',
  'profiles: postgres,mongodb',
  'COMPOSE_PROFILES: mongodb,postgres',
  'COMPOSE_PROFILES: postgres,mongodb',
]) {
  assert.ok(!ci.includes(forbidden), `ci.yml must not enable both database providers in one lane: ${forbidden}`);
  assert.ok(!qualityPresets.includes(forbidden), `quality-presets.yml must not enable both providers: ${forbidden}`);
}
for (const required of [
  'non-runtime-validation',
  'bun-compat',
  'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
  'bun-version-file: ${{ env.BUN_VERSION_FILE }}',
  'pnpm run bun:check',
  'closure: provider-free',
  'closure: standalone-user-api',
  'closure: standalone-admin-api',
  'closure: standalone-discord-api',
  'closure: standalone-telegram-api',
  'closure: preset-minimal',
  'closure: preset-web',
  'closure: preset-fullstack',
  'closure: preset-enterprise',
  'closure: preset-bots',
  'closure: mongodb-core',
  'closure: mongodb-bots',
  'pnpm nrb closure install',
  'pnpm run db:migrations:check',
  'pnpm run lib:configs:check',
  'pnpm run api:contracts:check',
  'pnpm run api:clients:check',
  'pnpm run api:openapi:lint',
  'pnpm run api:contracts:consumer',
  'pnpm run api:openapi:fuzz',
  'pnpm run test:property',
  'pnpm run storybook:build',
  'pnpm run test:storybook',
  'pnpm run test:visual',
]) {
  assert.ok(ci.includes(required), `ci.yml missing non-runtime validation gate: ${required}`);
}
for (const required of [
  'Materialize explicit provider reference build contexts',
  'pnpm nrb closure materialize --all-reference --provider postgres',
  'pnpm nrb closure materialize --all-reference --provider mongodb',
  'NRB_CLOSURE_CONTEXT: ${{ github.workspace }}/.nrb/reference/postgres',
]) {
  assert.ok(ci.includes(required), `Docker smoke CI missing explicit named closure context wiring: ${required}`);
}
for (const required of ['pnpm run tooling:install', 'Install clean product-selected closure']) {
  assert.ok(
    releaseImagesWorkflow.includes(required),
    `release-images.yml missing isolated closure install: ${required}`,
  );
}
assert.ok(
  !releaseImagesWorkflow.includes('docker:manifests:check'),
  'release-images.yml must not validate the retired Docker workspace manifest tree',
);
assert.ok(
  releaseImagesWorkflow.indexOf('pnpm run tooling:install') < releaseImagesWorkflow.indexOf('pnpm nrb closure install'),
  'release-images.yml must bootstrap tooling before replacing it with the clean selected closure tree',
);
assert.ok(
  releaseImagesWorkflow.includes('docker buildx bake -f docker-bake.json'),
  'Release images must execute the generated Bake plan with its nrb-closure contexts.',
);
assert.ok(
  !releaseImagesWorkflow.includes('docker/build-push-action') && !releaseImagesWorkflow.includes('target: workspace'),
  'Release images must not prime a direct Docker target outside the generated selected Bake plan.',
);
assert.ok(
  releaseImagesWorkflow.indexOf('pnpm nrb closure install') <
    releaseImagesWorkflow.indexOf('generate-bake-file.mjs --only'),
  'Release Bake generation must follow selected normalized closure installation.',
);
assert.ok(
  !releaseImagesWorkflow.includes('run: pnpm install --frozen-lockfile'),
  'release-images.yml must not retain a masking full-workspace install in product build lanes',
);
const bunJob = ci.slice(ci.indexOf('  bun-compat:'), ci.indexOf('  quality:'));
for (const frontendClosure of [
  'provider-free',
  'standalone-site',
  'standalone-user-frontend',
  'standalone-admin-frontend',
  'standalone-mobile',
]) {
  assert.ok(bunJob.includes(`closure: ${frontendClosure}`), `Bun matrix must isolate ${frontendClosure}`);
}
assert.ok(
  bunJob.indexOf('pnpm run tooling:install') < bunJob.indexOf('pnpm nrb closure install'),
  'Bun lanes must bootstrap tooling before replacing it with the clean selected closure tree',
);
for (const script of ['lint', 'typecheck']) {
  assert.ok(scripts[script]?.includes('nrb closure run'), `${script} must default to the selected closure`);
  assert.ok(scripts[`${script}:all`]?.includes('--all'), `${script}:all must remain an explicit all-project sweep`);
}
for (const forbidden of ['bun add', 'bun install', 'bun pm', 'bun remove', 'bun update', 'bunx']) {
  assert.ok(!ci.includes(forbidden), `ci.yml must keep pnpm as the package manager: ${forbidden}`);
  assert.ok(
    !bunCompatibilityCommand.includes(forbidden),
    `Bun compatibility must keep pnpm as the package manager: ${forbidden}`,
  );
}
for (const required of [
  'pnpm run tooling:static-check',
  'pnpm run test:security:secrets',
  'pnpm run test:security:sast',
  'pnpm run audit:ci',
]) {
  assert.ok(scripts['ci:pr']?.includes(required), `package.json ci:pr missing required gate: ${required}`);
}

console.log(JSON.stringify({ status: 'ok', workflows: workflows.length }));
