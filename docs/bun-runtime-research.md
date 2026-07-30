# Bun runtime support

- Research date: 2026-07-19
- Runtime contract updated: 2026-07-31
- Tested Bun: `1.3.14`

## Decision

The repository supports Bun 1.3.14 as an alternative JavaScript runtime for a
setup-selected compatibility contract. Node.js 24 remains the canonical build,
coverage, and deployment runtime. pnpm 11.15.1 remains the only package manager
and the only owner of dependency resolution, installs, lockfiles, workspace
policy, and deployment dependency trees.

The repository does not maintain Bun package-manager metadata or a second
lockfile. Running JavaScript under Bun must not change how dependencies are
resolved or installed. `pnpm run tooling:static-check` enforces this one-to-one
contract by rejecting Bun lock/config files, duplicate workspace declarations,
and Bun package-manager commands while allowing `bun run --bun` runtime
execution.

## Supported command

The contract is pinned by `.bun-version` and runs with:

```bash
pnpm run bun:check
```

Before running it, select any preset or custom closure and materialize its clean
pnpm dependency tree:

```bash
# Provider-free static custom selection
pnpm nrb setup --replace --app landing-app --non-interactive
pnpm nrb closure install
pnpm run bun:check

# Any preset, including minimal, web, fullstack, enterprise, and bots
pnpm nrb setup --preset bots --non-interactive
pnpm nrb closure install
pnpm run bun:check

# MongoDB custom selection
pnpm nrb setup --replace --app auth-app-api --app user-app-api \
  --capability mongodb --non-interactive
pnpm nrb closure install
pnpm run bun:check
```

The selected lane verifies the Nx graph, applicable Vite/Vike/Nest builds and
tests, live Vike/Nest or headless process behavior, and runtime identity. Expo
web export, Cucumber acceptance, and the fullstack `node:test` suite remain
explicit Node child-tool boundaries. The Nest readiness probe verifies that
runtime health reports Bun rather than Bun's Node compatibility version.

Provider-backed lanes require Docker Compose. CI runs every preset; isolated
landing, site, user frontend, admin frontend, mobile, user/admin API,
Discord/Telegram selections; and separate MongoDB core and bot selections. The
standalone frontend lanes prevent one renderer from masking another renderer's
missing dependency. One lane never activates both database providers.

## Contract

The command fails closed unless `.nrb/closure.json` matches the live Nx graph
and `.nrb/closure/pnpm-lock.yaml` is current. It then:

1. Verifies that the selected project and external-package closure contains no
   opposite-provider ownership.
2. Lists only closure projects, then runs available selected build/export, test,
   and applicable auth API e2e targets under Bun, except for explicitly
   Node-owned child tools. Coverage remains in the canonical Node lane because
   Bun's Node compatibility does not provide the repository's inspector-backed
   V8 coverage contract. Ordinary unit-test targets do not inherit production
   provider selectors or connection values.
3. Rebuilds the runtime projects through canonical pnpm/Node Nx execution so
   backend deployment manifests and pruned pnpm lockfiles are authoritative.
4. Stages each selected runtime in a temporary directory outside the workspace.
   Backend artifacts include their transitive built outputs; the bundled Vike
   runtime includes only its explicit application output. The staged process
   environment removes `NODE_PATH` so undeclared workspace dependencies cannot
   leak in.
5. Installs each staged production dependency tree with pnpm only, keeping
   canonical Node first for pnpm's child process.
6. Runs every selected staged runtime artifact under both Node and Bun. A
   selected Vike app gets health and rendered-route probes. Every selected
   backend API or bot root gets a real process startup, `/live`, `/ready`,
   runtime-identity, and graceful lifecycle probe. Notification consumers and
   schedulers remain headless application-context startup/lifecycle probes. A
   successful build, stage, or dependency install is never counted as runtime
   proof. Provider-free backend selections fail closed; durable selections also
   run their selected provider migration.
7. Removes temporary artifacts and provider data when the probe finishes.

This distinction matters because invoking an Nx launcher without Bun's shebang
override can still execute Nx under Node. The command forces supported Nx and
child JavaScript tools to use the pinned Bun runtime, preserves explicit
Node-owned boundaries such as Expo/Metro, Cucumber, and `node:test`, and keeps
pnpm as the package manager.

## Deployment relationship

Docker source builds consume the same selected closure metadata and lock. They
reject build projects outside `releaseImages`, stage each backend runtime's
transitive output closure or the site's explicit bundled output, and install
runtime dependencies outside the source workspace. The migrator manifest is
filtered to the selected PostgreSQL or MongoDB dependency set. Final runtime
images do not copy the workspace-wide `dist` tree or inherit `NODE_PATH`.

The final migrator image is intentionally different from local database
commands. Its dependency set is selected while building the image, but runtime
provider dispatch uses only matching explicit `DATABASE_ENGINE` and
`AUTH_PERSISTENCE` values. It neither reads nor ships `.nrb`. Local `pnpm db:*`
commands continue to require a fresh selected closure and reject environment
drift from that closure.

The Bun check proves runtime compatibility of those staged artifacts; it does
not publish Bun images or change production commands from Node. A production
Bun rollout still requires explicit image, telemetry, load/soak, graceful
shutdown, native dependency, and rollback evidence.

## Known boundary

- Node/pnpm CI, generated lockfiles, audits, coverage, releases, and deployment
  remain mandatory.
- OpenTelemetry JavaScript production support is still evaluated in the Node
  lane; the Bun smoke disables exporters rather than claiming telemetry parity.
- Passing HTTP and application-context smokes is not certification for every
  native module, worker path, or long-running production workload.
- Package-manager migration is outside this contract. Do not add a second
  lockfile or duplicate pnpm's supply-chain policy for Bun.

See [Local Verification](local-verification.md) for the focused command sequence
and [Command Matrix](command-matrix.md) for the stable command owner.
