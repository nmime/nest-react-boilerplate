#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-RELEASE-003 REQ-SCAFFOLD-QUALITY-006
// Security, operations, and quality-lane evidence.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { configuredForges } = await jiti.import('../packages/tooling/src/commands/ci/check-pipelines.ts');

// The checkout under validation. It is this script's own parent by default; `--root=` points it at
// a materialized checkout instead, which is how the stand-down below is proved against a tree that
// ships a different forge than this one.
const rootArgument = process.argv.find((arg) => arg.startsWith('--root='))?.split('=', 2)[1];
const rootDir = resolve(rootArgument ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const workspaceUrl = pathToFileURL(`${rootDir}/`);

// Everything below hardens GitHub Actions, so it is evidence only where that forge is configured.
// A checkout that keeps another forge has to be told that in words: crashing on the missing
// directory makes the merge-blocking spec-evidence gate unsatisfiable, and exiting quietly would
// claim an assertion that never ran. Which gates each configured forge still owes is the job of
// ci-pipeline-parity, which reads the same descriptor consulted here.
if (!configuredForges(rootDir).some((forge) => forge.id === 'github')) {
  console.log(
    JSON.stringify({
      status: 'not-applicable',
      reason: 'scripts/ci/gates.json declares no configured github forge in this checkout',
    }),
  );
  process.exit(0);
}

const workflowDir = new URL('.github/workflows', workspaceUrl);
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

const packageJson = JSON.parse(readFileSync(new URL('package.json', workspaceUrl), 'utf8'));
const scripts = packageJson.scripts ?? {};
const ci = workflows.find((workflow) => workflow.name === 'ci.yml')?.text ?? '';
const release = workflows.find((workflow) => workflow.name === 'release.yml')?.text ?? '';
const releaseImagesWorkflow = workflows.find((workflow) => workflow.name === 'release-images.yml')?.text ?? '';
const deployWorkflow = workflows.find((workflow) => workflow.name === 'deploy.yml')?.text ?? '';
assert.ok(
  releaseImagesWorkflow
    .replace(/\\\s*\n\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .includes('--workflow ci.yml --commit "$VERIFIED_SHA" --event push --branch main --status success'),
  'release-images.yml requires successful main CI for its exact revision',
);
assert.ok(
  releaseImagesWorkflow.includes('test "$(git rev-parse FETCH_HEAD)" = "$VERIFIED_SHA"'),
  'release-images.yml refuses a stale main revision',
);
assert.ok(releaseImagesWorkflow.includes('syft-version: v1.52.0'), 'release-images.yml pins the reviewed Syft CLI');
assert.ok(releaseImagesWorkflow.includes('cosign-release: v3.1.3'), 'release-images.yml pins the reviewed Cosign CLI');
assert.ok(releaseImagesWorkflow.includes('version: v0.74.0'), 'release-images.yml pins the reviewed Trivy CLI');
const githubReleaseNotes = readFileSync(new URL('.github/release.yml', workspaceUrl), 'utf8');
const gitleaksBaseConfigPath = 'packages/tooling/config/gitleaks.base.toml';
const gitleaksProductConfigPath = '.gitleaks.toml';
const gitleaksBaseConfig = readFileSync(new URL(gitleaksBaseConfigPath, workspaceUrl), 'utf8');
const gitleaksProductConfig = readFileSync(new URL(gitleaksProductConfigPath, workspaceUrl), 'utf8');
const nxCacheAction = readFileSync(new URL('.github/actions/nx-cache/action.yml', workspaceUrl), 'utf8');
const nxCacheDocs = readFileSync(new URL('docs/ci-cache.md', workspaceUrl), 'utf8');
const fullstackCompose = readFileSync(new URL('apps/e2e/fullstack/src/compose.ts', workspaceUrl), 'utf8');
const fullstackSelectionSource = readFileSync(new URL('apps/e2e/fullstack/src/selection.ts', workspaceUrl), 'utf8');
const fullstackSpec = readFileSync(new URL('apps/e2e/fullstack/src/fullstack.spec.ts', workspaceUrl), 'utf8');
const developmentCompose = readFileSync(new URL('docker/docker-compose.yml', workspaceUrl), 'utf8');
assert.ok(
  nxCacheAction.includes('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'),
  'Nx cache composite action must pin actions/cache to a full commit SHA',
);
assert.ok(nxCacheAction.includes('path: .nx/cache'), 'Nx cache composite action must cache only Nx task outputs');
assert.ok(!nxCacheAction.includes('secrets.'), 'Nx cache composite action must not receive secrets');
assert.ok(ci.includes('NX_CACHE_DIRECTORY: .nx/cache'), 'CI must use the explicit Nx cache directory');
// GitHub's trimmed fast gate is the only job left that restores the Nx cache.
for (const scope of ['fast']) {
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
assert.ok(
  release.includes("vars.RELEASE_ENABLED == 'true'"),
  'release.yml requires explicit operator opt-in before publication',
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
assert.ok(ciJobNames.length >= 3, `ci.yml job list could not be parsed (found ${ciJobNames.length})`);
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
// Gate coverage per forge is scripts/ci/check-pipelines.mjs's job (see its header): this
// file polices hardening and release contracts. GitHub renders only the fast gate, the
// secret scan and the release machinery -- every gate it does not render is recorded in
// scripts/ci/gates.json with `forges` and `reason` -- so the fast gate must run the parity
// and hardening checks themselves.
for (const required of [
  'pnpm run ci:pr',
  'node scripts/ci/check-pipelines.mjs',
  'node scripts/validate-github-workflows.mjs',
]) {
  assert.ok(ci.includes(required), `ci.yml missing fast-gate contract: ${required}`);
}
assert.ok(
  !/nx run-many -t e2e --all(?! --exclude(?:=| )fullstack-e2e)/u.test(JSON.stringify(scripts)),
  'package.json e2e aggregates must exclude fullstack-e2e; the Docker-managed Playwright suite rejects forwarded flags and needs a Compose stack',
);



// The reporter itself owns the behaviour the per-workflow contracts used to
// assert inline.
const scheduledFailureAction = readFileSync(
  new URL('.github/actions/report-scheduled-failure/action.yml', workspaceUrl),
  'utf8',
);
for (const required of ['gh issue create', 'gh issue comment', 'gh issue reopen', 'Consecutive failing runs']) {
  assert.ok(
    scheduledFailureAction.includes(required),
    `scheduled-failure reporter missing required contract: ${required}`,
  );
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

assert.ok(
  ci.includes(`GITLEAKS_CONFIG: ${'.gitleaks.toml'}`),
  'ci.yml must name the gitleaks config so both forges scan with the same one',
);
assert.match(
  scripts['test:e2e:coverage:all'] ?? '',
  /--all --exclude=fullstack-e2e -- --coverage/u,
  'Static e2e coverage must exclude the Docker-owned fullstack Playwright target',
);
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
  'idempotency-key\\.decorator\\.spec\\.ts',
  'charge-12345678',
  'discord-app-api\\.module\\.spec\\.ts',
  'discord-command-registration\\.service\\.spec\\.ts',
  'discord-config\\.spec\\.ts',
  '123456789012345678',
]) {
  assert.ok(
    gitleaksBaseConfig.includes(required),
    `${gitleaksBaseConfigPath} missing narrow fixture allowlist: ${required}`,
  );
}
// The split is only a seam while the product file composes over the base. A product config that
// spends its one `[extend]` slot on `useDefault` still scans - with the default rules alone, and
// with none of the boilerplate allowlists above - so every fixture in this repository starts
// failing the gate and the pressure is to widen something.
assert.ok(
  gitleaksProductConfig.includes(`path = "${gitleaksBaseConfigPath}"`),
  `${gitleaksProductConfigPath} must extend ${gitleaksBaseConfigPath} rather than replace it`,
);
assert.doesNotMatch(
  gitleaksProductConfig,
  /^\s*useDefault/mu,
  `${gitleaksProductConfigPath} must reach the default rules through ${gitleaksBaseConfigPath}; a config declares either path or useDefault, never both`,
);
for (const section of ['Breaking Changes', 'Features', 'Bug Fixes', 'Performance', 'Security', 'Maintenance']) {
  assert.ok(githubReleaseNotes.includes(`title: ${section}`), `.github/release.yml missing ${section} category`);
}
assert.ok(
  !workflows.some((workflow) => workflow.name === 'release-gitlab.yml'),
  'GitLab releases must run in GitLab CI, not as a second workflow on every GitHub push',
);

const gitlabCi = readFileSync(new URL('.gitlab-ci.yml', workspaceUrl), 'utf8');
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
  'zricethezav/gitleaks:v8.30.1',
  // Root auto-discovery finds the product config today, but nothing states it, so a config renamed
  // or relocated downstream degrades the job to the bare default rule set without a word.
  `--config ${gitleaksProductConfigPath}`,
  'node:24.21.0-alpine',
  'mcr.microsoft.com/playwright:v1.63.0-noble',
  'docker:29.4.0-dind',
  'postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24',
  'docker-cli-compose',
  'DOCKER_HOST: tcp://docker:2375',
  "DOCKER_TLS_CERTDIR: ''",
  'mongodb-validation:',
  'docker-fullstack-mongodb:',
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
  'pnpm run docker:prod:config:check',
  'node scripts/validate-compose-modes.mjs',
]);

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
for (const staleOverride of [
  'AUTH_PERSISTENCE:',
  'COMPOSE_PROFILES:',
  'DATABASE_ENGINE:',
  'FULLSTACK_API_CRITICAL_ONLY:',
  'FULLSTACK_CRITICAL_ONLY:',
  'MONGODB_DATABASE:',
  'MONGODB_REPLICA_SET:',
  'MONGODB_URI:',
]) {
  assert.ok(
    !gitlabMongoFullstackJob.includes(staleOverride),
    `.gitlab-ci.yml MongoDB fullstack must derive ${staleOverride} from its selected closure and managed stack.`,
  );
}

for (const [command, expectedCount] of [
  ['pnpm run deploy:validate:helm', 1],
  ['pnpm run docker:prod:config:check', 1],
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


// Every runtime lane starts the stack through one composite action. Keeping the
// start sequence in a single place is the fix for quality-presets and
// spec-assurance-nightly having drifted away from ci.yml's retry and then
// failing on every scheduled run for a month.
// That action is an entry point, not an implementation: asserting its start
// sequence literally is what froze the unsequenced `up -d --build` in place,
// because the contract test enforced the very line that raced the migrator.
// Assert the delegation and the inputs it forwards; scripts/ci/runtime-stack.spec.mjs
// owns the behaviour of what it delegates to.
const runtimeStackAction = readFileSync(new URL('.github/actions/runtime-stack/action.yml', workspaceUrl), 'utf8');
for (const required of [
  'node scripts/ci/runtime-stack.mjs',
  'COMPOSE_FILE_PATH: ${{ inputs.compose-file }}',
  'START_ATTEMPTS: ${{ inputs.attempts }}',
  'READINESS_TIMEOUT: ${{ inputs.readiness-timeout }}',
]) {
  assert.ok(runtimeStackAction.includes(required), `runtime-stack action missing required contract: ${required}`);
}
// Checked against executable lines only: the action documents why it delegates,
// and that explanation must not trip its own guard.
const runtimeStackCommands = runtimeStackAction
  .split('\n')
  .filter((line) => !/^\s*#/u.test(line))
  .join('\n');
assert.ok(
  !/docker compose/u.test(runtimeStackCommands),
  'runtime-stack action must not run Compose itself; the shared driver owns the start sequence.',
);

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




for (const forbidden of [
  'profiles: mongodb,postgres',
  'profiles: postgres,mongodb',
  'COMPOSE_PROFILES: mongodb,postgres',
  'COMPOSE_PROFILES: postgres,mongodb',
]) {
  assert.ok(!ci.includes(forbidden), `ci.yml must not enable both database providers in one lane: ${forbidden}`);

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
for (const script of ['lint', 'typecheck']) {
  assert.ok(scripts[script]?.includes('nrb closure run'), `${script} must default to the selected closure`);
  assert.ok(scripts[`${script}:all`]?.includes('--all'), `${script}:all must remain an explicit all-project sweep`);
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
