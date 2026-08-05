# ADR 0003: Explicit selection model with no default deployable

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

This template ships eleven application surfaces (admin/user React SPAs, an
Astro landing app, a Vike SSR site, an Expo mobile app, admin/user/auth APIs,
Discord/Telegram APIs, and notification workers). Most products fork the
template and use a strict subset. An implicit "default app" would silently run
unwanted services, inflate install/build/test time, and make `pnpm run dev`
start infrastructure nobody asked for.

## Decision

`pnpm nrb setup` records an explicit selection of apps and capabilities in
`nrb.config.json` and generates `.nrb/workspace.json`, `.nrb/state.json`, and
`.nrb/closure.json` from it. Product commands (`dev`, `lint`, `typecheck`,
`test`) run through the closure and refuse to operate without a current
selection. CI materializes selections explicitly via `nrb setup --replace`
instead of inventing defaults. The upstream template commits a 10-app reference
selection only so maintainers can run every surface; product forks replace it.

## Consequences

- Every deployable has an explicit home; closure commands fail closed on stale
  or missing selections.
- `pnpm run dev` refuses to start before setup completes, which can surprise
  evaluators until they run setup (documented in `docs/quick-start.md`).
- Presets (`minimal`, `web`, `fullstack`, `enterprise`, `bots`) are exact
  shortcuts that expand into explicit selections, never implicit defaults.

## Alternatives Considered

- Ship a working default app: rejected because it hides configuration and runs
  unselected services.
- Infer the selection from file presence: rejected because it is ambiguous and
  not rerunnable.

## Validation

`pnpm nrb doctor` reports `nrb-config`, `nrb-state`, `capability-wiring`, and
`selected-closure` checks; `docs/setup/cli-reference.md` documents the setup
flags, and the closure fail-closed behavior is exercised by the tooling static
checks (`pnpm run tooling:static-check`).
