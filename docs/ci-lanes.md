# CI lanes

The list of gates that must pass before a change merges lives in
[`scripts/ci/gates.json`](../scripts/ci/gates.json), not in either forge YAML
file. GitHub Actions and GitLab CI are handwritten renderings of that
descriptor. `node scripts/ci/check-pipelines.mjs` fails when a configured forge
drops a gate, misses the aggregate job, or loses a release supply-chain control.

Add a gate to the descriptor first, then wire the same command into every forge
that should run it. A forge that cannot run a gate must say so with `forges`
plus `reason`.

## Lanes

| Lane                | When it runs                 | What it proves                                         |
| ------------------- | ---------------------------- | ------------------------------------------------------ |
| `pr`                | Pull request / merge request | Evidence for the requirements the change touches       |
| `main`              | Default-branch push          | The same merge-blocking set on the integrated revision |
| `nightly`           | Scheduled                    | Full-inventory `spec:verify --all`                     |
| `runtime`           | Manual / scheduled runtime   | Evidence that needs a live stack                       |
| `scheduled-quality` | Nightly extras               | Visual matrix and broader quality presets              |
| `release`           | Tag                          | Signed, scanned, attested images                       |

## Shared pins

Helm and Mongo versions are owned by
[`scripts/delivery-inventory.mjs`](../scripts/delivery-inventory.mjs). Both
forges must use those pins. pnpm is owned by `packageManager` in the root
`package.json` and checked by `packages/tooling/src/commands/ci/pnpm-pins.ts`.

## What is not a second gate

`pnpm run ci:pr` already runs the native secret scan, SAST, and
`audit:ci`. Extra forge jobs that repeat those commands are not additional
evidence.

Promotion uses `scripts/update-deploy-tags.mjs` against the selected closure
and `.helm/values-selection.yaml`. There is no second updater.

Product images compile only when `NRB_IMAGE_COMPILE=1` (release and nightly).
Merge CI and `pnpm run deploy --preset=single-server` pull or render; they do
not bake. The compile driver is `node scripts/build-images.mjs`.
