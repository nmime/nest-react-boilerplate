# Product identity

This boilerplate ships with its own name, owner, domain, and database names baked
into roughly 200 files. A product built from it must replace all of them. This
document is the single source of truth for **which strings are identity**, **where
they live**, **how to replace them repeatably**, and **what proves the replacement
happened**.

Read this before the first deploy of a fork. Getting it wrong is not cosmetic:
`BACKUP_PREFIX` and `S3_BUCKET` decide where production backups land, and the
GitOps manifests decide which repository the cluster syncs from.

## The identity value set

Identity is exactly seven declared values. Everything else in the repository is
derived from them.

| Value           | Boilerplate literal      | Shape           | Owns                                                             |
| --------------- | ------------------------ | --------------- | ---------------------------------------------------------------- |
| `appTitle`      | `Nest React Boilerplate` | Title Case      | OpenAPI titles, README prose, dashboard titles                   |
| `appSlug`       | `nest-react-boilerplate` | kebab-case      | Helm release, Compose project, S3 bucket, NATS/Mongo app names   |
| `dbName`        | `nest_react_boilerplate` | snake_case      | Postgres/Mongo database names and role names                     |
| `className`     | `NestReactBoilerplate`   | PascalCase      | Generated class and type names                                   |
| `owner`         | `your-github-org`        | forge namespace | Image registry path, GitOps `repoURL`, container image prefixes  |
| `domain`        | `example.com`            | DNS base name   | Every public hostname, TLS SAN, CSP origin, return-URL allowlist |
| `upstreamOwner` | `nmime`                  | forge account   | Advisory URLs, CODEOWNERS, commit-author policy, `.mailmap`      |

`appSlug`, `dbName`, and `className` are conventionally derived from `appTitle`,
but each can be overridden independently — a product may want a short slug and a
long title.

`upstreamOwner` is the one value the automated rewrite does **not** currently
handle. See [Known gaps](#known-gaps).

## Where identity lives

Every literal below is load-bearing. Counts are for tracked files, excluding
`pnpm-lock.yaml` and generated caches.

| Surface                              | Tokens present                                     | Notes                                                               |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------- |
| `.env*.example` (5 files)            | `appSlug`, `dbName`, `owner`, `domain`, `appTitle` | Header block in each file lists the identity-derived variables      |
| `.helm/**`                           | `appSlug`, `dbName`, `owner`, `domain`             | Image repositories, release name, namespace, TLS secret, dashboards |
| `deploy/argocd/**`, `deploy/flux/**` | `appSlug`, `owner`                                 | `repoURL` / `url` point at the sync source — wrong value = no sync  |
| `docker/**`                          | `appSlug`, `dbName`, `upstreamOwner`               | Compose project name, Grafana dashboard, alert runbook URLs         |
| `scripts/**`                         | `appSlug`, `dbName`, `upstreamOwner`               | Validators assert the literals; see [Known gaps](#known-gaps)       |
| `packages/tooling/**`                | `dbName`, `upstreamOwner`                          | Planner-generated env URLs, git-convention owner constants          |
| `docs/**`, root Markdown             | all                                                | Prose; harmless but confusing if stale                              |
| Filenames                            | `appSlug`                                          | Two dashboard files are named after the boilerplate                 |

The two identity-named **files** are:

- `.helm/dashboards/nest-react-boilerplate.json`
- `docker/grafana/dashboards/nest-react-boilerplate.json`

## The rename path

### 1. Declare the identity

`nrb init` takes every value as a flag — there is no interactive prompt, so pass
all of them explicitly and keep the invocation in a checked-in script:

```bash
pnpm nrb init \
  --name "Acme Platform" \
  --app-slug acme-platform \
  --db-name acme_platform \
  --owner acme-inc \
  --domain acme.example \
  --apex-app landing-app \
  --dry-run
```

`--dry-run` prints the full file diff without writing. Read it. Then re-run
without `--dry-run`.

`nrb init` walks every text file, applies the replacement map in order, and
resolves the apex-host selection so the app that owns the apex domain gets the
bare hostname and every other deployable gets `<app-id>.<domain>`. It also
rewrites the root `package.json` name to `--package-name`.

It refuses to run against a dirty worktree. Commit or stash first; `--force`
overrides the guard but also disables conflict detection, so prefer committing.

### 2. Rename the identity-named files

`nrb init` rewrites file _contents_, not file _names_. Rename the two dashboards
and update their references:

```bash
git mv .helm/dashboards/nest-react-boilerplate.json .helm/dashboards/acme-platform.json
git mv docker/grafana/dashboards/nest-react-boilerplate.json docker/grafana/dashboards/acme-platform.json
```

### 3. Replace the contributor identity

`.mailmap` canonicalises the **boilerplate's** historical contributors. It is
upstream history, not product history. A fork that squashes the boilerplate into
one initial commit should truncate `.mailmap` to its own contributors.

The commit-author policy in [AGENTS.md](../AGENTS.md) and the git-convention
checker both name the upstream owner. Change both to the product's owner, or the
convention gate will reject every product commit.

### 4. Prove it

```bash
pnpm run onboarding:verify
```

This must report zero surviving placeholders. See
[the residue gate](#the-placeholder-residue-gate) for exactly what it checks.

### 5. Repeat after every upstream merge

This is the part a one-shot rewrite gets wrong. Merging a new boilerplate release
re-introduces upstream literals in every file the merge touched. `nrb init` is
idempotent — the replacement map only matches boilerplate literals, so re-running
it against an already-renamed tree is a no-op except for the newly merged files.

Run `pnpm nrb init --dry-run` with the **same arguments** after every upstream
merge, and keep those arguments in a checked-in script so they cannot drift.

## Record the fork point

Do this before the first product commit; it cannot be reconstructed later.

Land the boilerplate snapshot as **one initial commit** whose message records the
exact upstream SHA, then keep all product work on top of it:

```bash
git commit -m "chore: import nest-react-boilerplate at <upstream-sha>"
```

Everything after that commit is product-authored, so `git diff <upstream-sha>`
answers "what did we change" in one command, and the next upstream merge has a
real base.

The failure mode is not hypothetical. A fork that squashes the import into
several plausible-looking feature commits attributes inherited boilerplate
config — quality gates, Playwright and Stryker configuration, e2e fixtures — to
product commits that did not write it. Comparing against upstream then means
diffing filesystems against a guessed fork point instead of reading `git`.

Do not backdate those commits, and do not spread the import across commits
authored by different people. Both make the synthetic history look real.

## The placeholder-residue gate

A rename that nobody checks is a rename that silently did not happen. The
`onboarding:verify` lane owns the check.

**Fails when** any tracked file contains `Nest React Boilerplate`,
`nest-react-boilerplate`, `nest_react_boilerplate`, `NestReactBoilerplate`,
`your-github-org`, or a tracked filename contains `nest-react-boilerplate`.

**`example.com` is checked separately** and only outside documentation:
`example.com` is a reserved example domain (RFC 2606) and is legitimate in prose,
in test fixtures, and in negative test cases. It is not legitimate in
`.env*.example`, `.helm/**`, or `deploy/**`.

**Allowlist.** The check must not fire inside the boilerplate itself. Exempt:

- `packages/tooling/src/commands/project/init-project.ts` and its tests — the
  replacement map necessarily contains the literals it replaces.
- `docs/product-identity.md` — this file documents the literals.
- `CHANGELOG.md` and `openspec/changes/archive/**` — upstream history.
- `LICENSE` — the upstream copyright line.

**Gating condition.** The check is skipped when the workspace is the boilerplate
itself. Detection is by `nrb.config.json`: a workspace that has not declared a
product identity is assumed to be upstream. Once a product identity is declared,
residue is a hard failure.

**Both forges must run it.** `onboarding:verify` currently runs in one pipeline
only. A fork that adopts the other forge inherits no gate at all — which is
exactly how a product ships GitOps manifests pointing at `your-github-org`.

## Known gaps

These are real and currently require hand edits. Do not assume `nrb init` covers
them.

1. **`upstreamOwner` is not in the replacement map.** `nrb init` does not touch
   `nmime`, so the security-advisory URL, `CODEOWNERS`, the release-repository
   default, the `.mailmap` canonical identity, and the git-convention author
   constants all keep the upstream account. 38 tracked files contain it.
2. **Identity is not a declared value yet.** `nrb.config.json` carries
   `deployment.publicDomain` but no `product.identity` block, so the values passed
   to `nrb init` are not recorded anywhere and cannot be replayed after an upstream
   merge. Until they are, keep them in a checked-in script.
3. **Validators assert the literals.** Several scripts under `scripts/` compare
   against `nest-react-boilerplate` / `nest_react_boilerplate` directly rather
   than against a configured value, so a renamed product must update the
   validators too.
4. **`nrb init` cannot rename files.** It emits content changes only.

## Related

- [Setup and configuration](setup/configuration.md) — the `nrb.config.json` contract.
- [GitOps](../GITOPS.md) — the manifests whose `repoURL` must be product-owned.
- [Environment variables](environment-variables.md) — the full variable reference.
- [Deployment platforms](deployment-platforms.md) — where identity reaches infrastructure.
