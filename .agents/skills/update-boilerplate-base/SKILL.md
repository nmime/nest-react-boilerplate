---
name: update-boilerplate-base
description: Update a downstream product repository onto a newer nest-react-boilerplate release while preserving product ownership and published history. Use when rebasing, merging, resynchronizing, or migrating an existing product from an older boilerplate commit or copied snapshot, including shared-history and unrelated-root repositories.
---

# Update a boilerplate base

## Read first

- Read `../../../AGENTS.md`, `../../../docs/ai/agent-policy.md`,
  `../../../docs/scaffolding-and-extension.md`,
  `../../../docs/database-migrations.md`, and
  `../../../docs/local-verification.md`.
- Inspect the product's closest `AGENTS.md` and README files,
  `.nrb/workspace.json`, root manifests, lockfile, Nx graph, migrations,
  generated-artifact sources, deployment configuration, durable OpenSpec specs
  and verification sidecars, active changes, and current CI state.
- Obtain the exact old boilerplate base and target release tag or commit. Prefer
  a release tag over a moving upstream branch.

## Establish safe state

1. Verify the product repository, branch, `HEAD`, current local and remote
   `main`, remotes, the toolchain pinned by its root manifest, and working-tree
   ownership.
2. Fetch the product remote and a read-only `boilerplate` remote, including
   tags. Record the old product `main`, old base, target tag, and target SHA.
3. Create a focused integration branch from current product `main`. Never
   rewrite or force-push published `main`.
4. Classify history before changing it:
   - **Shared ancestry:** `git merge-base` finds the old boilerplate base.
   - **Separable snapshot:** no common ancestor exists, but one commit is a
     pure imported boilerplate snapshot followed by product-only commits.
   - **Mixed or unrelated root:** the initial history combines scaffold and
     product work, or no clean snapshot boundary exists.
5. Stop when the old base, target, dirty-tree ownership, or deployed migration
   history cannot be established safely.

## Choose the integration method

### Preserve published commit identities

Prefer merging the target tag into the integration branch when product `main`
is already shared and retaining commit identities matters. Resolve the merge by
ownership and validate the resulting tree. Do not use an unrelated-history
merge merely to silence missing ancestry.

### Replay product-only commits

For shared ancestry, rebase product commits after the exact old base:

```bash
git rebase --rebase-merges --onto <target-tag> <old-base>
```

For a separable copied snapshot, exclude the pure snapshot commit and replay
only later product commits:

```bash
git rebase --rebase-merges --onto <target-tag> <snapshot-commit>
```

Use `git rebase --rebase-merges --root --onto <target-tag>` only for a genuinely
mixed or unrelated root. Use interactive rebase when necessary to drop obsolete
scaffold snapshot commits. Never resolve a repository-wide add/add conflict by
blindly selecting one side.

If the rewritten branch no longer shares ancestry with old product `main` but
published history must remain reachable, create a reviewed history bridge from
the fully validated rebased tree using an `ours` merge of old product `main`.
Then integrate without force-pushing.

## Resolve by ownership

1. Start from the new boilerplate for repository tooling, CI, shared bootstrap,
   generator policy, and unmodified scaffold infrastructure; reapply only
   intentional product customization.
2. Retain product domain behavior, selected applications, routes, authorization,
   contracts, UI, operations, and deployment topology while adapting them to
   changed upstream contracts.
3. Merge package manifests deliberately, then regenerate `pnpm-lock.yaml` with
   pnpm. Never hand-edit the lockfile.
4. Preserve every deployed product migration. Never replace product migration
   history with upstream migration history or run destructive schema commands.
5. Resolve generated artifacts at their source, then regenerate OpenAPI,
   contracts, clients, catalogs, or other derived output.
6. Preserve `.nrb/workspace.json` selection and product identity. Never use
   `pnpm nrb init` as an upgrade mechanism. Use setup only for an explicitly
   requested application or capability selection change.
7. Reconcile environment examples variable-by-variable without reading,
   printing, copying, or committing real secrets.
8. Compare meaningful release boundaries one at a time when the product spans
   several boilerplate minor releases.
9. Reconcile specification ownership deliberately. Preserve product requirement
   IDs, Cucumber dispositions, project scopes, and product-owned evidence;
   import or modify upstream requirements only when the migrated product really
   adopts that behavior.

## Specification lifecycle

When the update changes observable product behavior, establish or update the
governing requirements with `$specify-behavior`, then synchronize the migrated
source, executable tests, Gherkin examples, and sidecars through
`$implement-specified-change`. For source-preserving migrations, prove that the
existing requirements and evidence still describe the resulting product.

## Verification

1. Review every conflict resolution and use `git range-diff` or equivalent
   history comparison to prove that product-only commits were retained.
2. Install with `pnpm install --frozen-lockfile`, run `pnpm nrb doctor`, and run
   focused lint, typecheck, tests, builds, migration checks, and deployment
   validation for every affected selected project.
3. Run generated contract/client checks when their sources or consumers
   changed. Run `pnpm run agent:verify` when setup, generators, ownership, agent
   guidance, or scaffolding changed.
4. Run `pnpm run spec:validate`, inspect specification impact, and execute the
   selected evidence lane when source, tests, projects, skills, or assurance
   metadata changed.
5. Broaden to `pnpm run check:fast` when the reconciled surface is
   repository-wide. Always run `git diff --check`.
6. Before integration, fetch product `origin/main` again and prove the expected
   head, tree, divergence, CI state, and absence of accidental secrets or
   unrelated files. Separate local validation from CI and deployment readiness.

## Completion contract

Report the old product head, old boilerplate base, target tag and SHA, history
classification, integration method, conflicts and ownership decisions,
regenerated artifacts, migrations preserved or added, validation results, and
remaining blockers. Do not claim success merely because Git completed the
rebase. Do not push, merge, deploy, publish, or force-update a remote unless the
user explicitly authorizes that action.
