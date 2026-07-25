#!/usr/bin/env node
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
const githubReleaseNotes = readFileSync(new URL('../.github/release.yml', import.meta.url), 'utf8');
const gitleaksConfig = readFileSync(new URL('../.gitleaks.toml', import.meta.url), 'utf8');
const nxCacheAction = readFileSync(new URL('../.github/actions/nx-cache/action.yml', import.meta.url), 'utf8');
const nxCacheDocs = readFileSync(new URL('../docs/ci-cache.md', import.meta.url), 'utf8');
assert.ok(
  nxCacheAction.includes('actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'),
  'Nx cache composite action must pin actions/cache to a full commit SHA',
);
assert.ok(nxCacheAction.includes('path: .nx/cache'), 'Nx cache composite action must cache only Nx task outputs');
assert.ok(!nxCacheAction.includes('secrets.'), 'Nx cache composite action must not receive secrets');
assert.ok(ci.includes('NX_CACHE_DIRECTORY: .nx/cache'), 'CI must use the explicit Nx cache directory');
for (const scope of ['fast', 'non-runtime', 'bun', 'quality', 'e2e']) {
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
// The release repository and identity are overridable via Actions variables so
// forks/adopters can enable CD, but the upstream `nmime` default must be preserved
// (unset variable => this repo keeps releasing exactly as before).
assert.ok(
  release.includes("vars.RELEASE_REPOSITORY || 'nmime/nest-react-boilerplate'"),
  'release.yml must gate releases on RELEASE_REPOSITORY with the nmime default',
);
assert.ok(
  release.includes("GIT_AUTHOR_NAME: ${{ vars.RELEASE_GIT_AUTHOR_NAME || 'nmime' }}"),
  'release.yml must preserve the nmime release author default (overridable via RELEASE_GIT_AUTHOR_NAME)',
);
assert.ok(
  release.includes("GIT_COMMITTER_NAME: ${{ vars.RELEASE_GIT_AUTHOR_NAME || 'nmime' }}"),
  'release.yml must preserve the nmime release committer default (overridable via RELEASE_GIT_AUTHOR_NAME)',
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
for (const required of [
  'stage: release',
  'pnpm exec semantic-release',
  'RELEASE_PROVIDER: gitlab',
  '$GITLAB_TOKEN != null || $GL_TOKEN != null',
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
]) {
  assert.ok(gitlabCi.includes(required), `.gitlab-ci.yml missing pinned CI contract: ${required}`);
}

const { buildReleaseConfig, releaseNoteTypes } = await import('../release.config.mjs');
const pluginNames = (config) => config.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
const githubReleaseConfig = buildReleaseConfig({ RELEASE_PROVIDER: 'github' });
const gitlabReleaseConfig = buildReleaseConfig({
  RELEASE_PROVIDER: 'gitlab',
  CI_REPOSITORY_URL: 'https://gitlab-ci-token:example@gitlab.example.com/group/project.git',
});
const configuredReleasePlugins = new Set([...pluginNames(githubReleaseConfig), ...pluginNames(gitlabReleaseConfig)]);
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
assert.ok(
  scripts['quality:visual']?.includes('pnpm run test:visual:matrix'),
  'quality:visual must run the cross-browser/mobile visual regression matrix',
);
assert.ok(
  qualityPresets.includes('pnpm run quality:visual'),
  'scheduled quality workflow must run the pinned visual regression matrix',
);
const runtimeComposeProfiles =
  'COMPOSE_PROFILES: postgres,admin-app-api,user-app-api,auth-app-api,admin-app,user-app,landing-app';
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
    workflowText.includes(runtimeComposeProfiles),
    `${workflowName} runtime QA stack must activate every required Compose profile`,
  );
}
for (const required of [
  'non-runtime-validation',
  'bun-compat',
  'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
  'bun-version-file: ${{ env.BUN_VERSION_FILE }}',
  'pnpm run bun:check',
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
  'pnpm run tooling:static-check',
  'pnpm run test:security:secrets',
  'pnpm run test:security:sast',
  'pnpm run audit:ci',
]) {
  assert.ok(scripts['ci:pr']?.includes(required), `package.json ci:pr missing required gate: ${required}`);
}

console.log(JSON.stringify({ status: 'ok', workflows: workflows.length }));
