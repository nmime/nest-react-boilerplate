#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => {
  const absolutePath = join(rootDir, path);
  assert.ok(existsSync(absolutePath), `Missing GitOps file: ${path}`);
  return readFileSync(absolutePath, 'utf8');
};
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected GitOps config: ${label}`);

const argo = read('deploy/argocd/application.yaml');
const argoKustomization = read('deploy/argocd/kustomization.yaml');
const fluxSource = read('deploy/flux/source.yaml');
const fluxRelease = read('deploy/flux/release.yaml');
const fluxKustomization = read('deploy/flux/kustomization.yaml');
const releaseWorkflow = read('.github/workflows/release-images.yml');
const promotionWorkflow = read('.github/workflows/deploy.yml');
const tagUpdater = read('scripts/update-deploy-tags.py');
const releaseImagePlan = read('scripts/release-image-plan.mjs');

for (const expected of [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: Application',
  'namespace: argocd',
  'path: .helm',
  'targetRevision: main',
  'values-selection.yaml',
  'CreateNamespace=true',
  'prune: true',
  'selfHeal: true',
]) {
  has(argo, expected, `Argo CD ${expected}`);
}
has(argoKustomization, '- application.yaml', 'Argo CD kustomization resource');

for (const expected of [
  'apiVersion: source.toolkit.fluxcd.io/v1',
  'kind: GitRepository',
  'namespace: flux-system',
  'branch: main',
]) {
  has(fluxSource, expected, `Flux source ${expected}`);
}
for (const expected of [
  'apiVersion: helm.toolkit.fluxcd.io/v2',
  'kind: HelmRelease',
  'namespace: flux-system',
  'targetNamespace: nest-react-boilerplate',
  'chart: ./.helm',
  'kind: GitRepository',
  'values.yaml',
  'values-production.yaml',
  'values-selection.yaml',
  'createNamespace: true',
  'strategy: rollback',
]) {
  has(fluxRelease, expected, `Flux release ${expected}`);
}
for (const resource of ['source.yaml', 'release.yaml']) {
  has(fluxKustomization, `- ${resource}`, `Flux kustomization includes ${resource}`);
}

const argoRepo = argo.match(/repoURL:\s*(\S+)/u)?.[1];
const fluxRepo = fluxSource.match(/url:\s*(\S+)/u)?.[1];
assert.ok(argoRepo, 'Argo CD source must declare repoURL.');
assert.equal(fluxRepo, argoRepo, 'Argo CD and Flux must reconcile the same repository.');
assert.match(
  argoRepo,
  /^https:\/\/github\.com\/your-github-org\/nest-react-boilerplate\.git$/u,
  'Template GitOps repository must be owned by init-project replacements.',
);
assert.ok(!/github\.com\/example\//u.test(argoRepo), 'GitOps repository must not use an example owner.');

has(releaseWorkflow, 'sha-${GITHUB_SHA}', 'release images use the full GitHub SHA');
has(releaseWorkflow, 'image-plan', 'release workflow builds only selected images');
has(releaseWorkflow, '[[ "$GITHUB_REF" == refs/tags/* ]]', 'tag releases build a promotable complete selected set');
has(releaseWorkflow, 'pnpm nrb closure install', 'release workflow validates and installs the selected closure');
has(
  releaseWorkflow,
  'pnpm run deploy:validate:helm',
  'release workflow validates Helm through fresh selected deployment ownership',
);
has(releaseWorkflow, 'node-version-file: .nvmrc', 'release image planner uses the repository Node version');
has(releaseWorkflow, 'generate-bake-file.mjs --only', 'release workflow generates a selected Bake plan');
has(releaseWorkflow, 'docker buildx bake -f docker-bake.json', 'release workflow builds only through Bake');
assert.ok(
  !releaseWorkflow.includes('docker/build-push-action') && !releaseWorkflow.includes('target: workspace'),
  'Product release must not prime a direct Docker target without the selected nrb-closure context.',
);
has(releaseWorkflow, 'cache-to=type=gha,mode=max,scope=release-', 'release workflow exports BuildKit cache');
for (const expected of [
  'cosign sign --yes "$ref"',
  'cosign attest --yes --type spdxjson',
  'cosign attest --yes --type slsaprovenance1',
  'cosign attest --yes --type "$SCAN_PREDICATE_TYPE"',
  'result: "pass"',
  'severities: ["CRITICAL", "HIGH"]',
]) {
  has(releaseWorkflow, expected, `release workflow signed evidence ${expected}`);
}
assert.ok(
  !releaseWorkflow.includes('types: [published]'),
  'release image workflow must not duplicate tag builds on release publication',
);
has(promotionWorkflow, '^[0-9a-f]{40}$', 'promotion accepts only a full 40-character SHA');
has(promotionWorkflow, 'docker manifest inspect --verbose', 'promotion verifies candidate image digests');
for (const expected of [
  'cosign verify \\',
  'cosign verify-attestation --type slsaprovenance1',
  'cosign verify-attestation --type spdxjson',
  'cosign verify-attestation --type "$SCAN_PREDICATE_TYPE"',
  '--certificate-github-workflow-repository "$certificate_repository"',
  '--certificate-github-workflow-sha "$RELEASE_SHA"',
  '.predicate.result == "pass"',
  '.predicate.buildDefinition.resolvedDependencies[]?; .digest.gitCommit == $sha',
  'release/gitops-sha-$SHA',
  'git config user.name "nmime"',
  'git config user.email "66474195+nmime@users.noreply.github.com"',
  'chore(deploy): promote',
]) {
  has(promotionWorkflow, expected, `promotion verification ${expected}`);
}
assert.ok(
  !promotionWorkflow.includes('gitops/sha-') && !promotionWorkflow.includes('github-actions[bot]'),
  'promotion must use a policy-compliant branch and repository identity',
);
has(promotionWorkflow, 'release-image-plan.mjs --names', 'promotion uses the canonical release-image inventory');
has(promotionWorkflow, 'pnpm nrb closure check', 'promotion validates the candidate selected closure');
has(promotionWorkflow, '--print-required', 'promotion intersects fresh closure and enabled deployment ownership');
has(promotionWorkflow, '--selected-image', 'promotion passes fresh closure ownership to the tag updater');
has(
  promotionWorkflow,
  'cmp -s /tmp/nrb-helm-values.yaml .helm/values-selection.yaml',
  'promotion rejects stale deployment ownership on main',
);
has(
  promotionWorkflow,
  '--selection-values-file /tmp/nrb-helm-values.yaml',
  'promotion uses the matching setup-generated Helm ownership overlay',
);
has(
  promotionWorkflow,
  'Missing immutable candidate digests for selected and enabled images',
  'promotion rejects missing required candidate digests',
);
assert.ok(
  !releaseWorkflow.includes('--all-reference') && !promotionWorkflow.includes('--all-reference'),
  'Product release and promotion workflows must not use all-reference image planning.',
);
has(promotionWorkflow, 'gh pr create', 'promotion opens a pull request');
assert.ok(!promotionWorkflow.includes('workflow_run:'), 'promotion must not create a self-triggering main-commit loop');
assert.ok(!promotionWorkflow.includes('HEAD:main'), 'promotion must never push directly to main');
has(tagUpdater, "re.fullmatch(r'[0-9a-fA-F]{40}', args.sha)", 'tag updater requires the release workflow full SHA');
has(tagUpdater, "re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest)", 'tag updater requires immutable image digests');
has(
  tagUpdater,
  "default='.helm/values-selection.yaml'",
  'tag updater defaults to the tracked setup-generated Helm ownership overlay',
);
has(
  tagUpdater,
  'selected & enabled_deployment_images',
  'tag updater derives selected and enabled deployment ownership',
);
has(
  tagUpdater,
  'missing immutable digests for selected and enabled images',
  'tag updater rejects incomplete promotions',
);
has(
  tagUpdater,
  'image digests are outside selected and enabled deployment ownership',
  'tag updater rejects unselected or disabled digest updates',
);
has(releaseImagePlan, 'selectReleaseImages', 'release inventory has testable affected-image selection');

const kubectlAvailable = spawnSync('kubectl', ['version', '--client'], { cwd: rootDir, stdio: 'ignore' }).status === 0;
if (!kubectlAvailable) {
  if (process.env.REQUIRE_KUBECTL === 'true') {
    console.error('kubectl is required for GitOps kustomize validation but is unavailable.');
    process.exit(127);
  }
  console.log('gitops static assertions passed; kubectl kustomize skipped because kubectl is unavailable');
  process.exit(0);
}

for (const directory of ['deploy/argocd', 'deploy/flux']) {
  const result = spawnSync('kubectl', ['kustomize', directory], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  assert.ok(result.stdout.trim(), `${directory} must render at least one GitOps resource.`);
}

console.log(JSON.stringify({ status: 'ok', controllers: ['argocd', 'flux'] }));
