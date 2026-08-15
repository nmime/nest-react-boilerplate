# ADR 0004: Dual durable-provider strategy (PostgreSQL or MongoDB, mutually exclusive)

- Status: Accepted
- Date: 2026-08-04
- Owners: @nmime

## Context

The template must support two very different durable persistence stacks:
PostgreSQL (relational, MikroORM) and MongoDB (document, transactions require a
replica set). Features such as auth sessions, feature flags, and notifications
need one durable store; the codebase cannot afford per-feature forks of both
implementations, nor a silent "either works" runtime fallback.

## Decision

Durable providers are modeled as mutually exclusive selection entries: the
`postgres` and `mongodb` capabilities cannot be combined. Feature code depends
on provider ports; each provider supplies its own implementation library
(for example the `libs/backend/postgres/*` and the MongoDB equivalents).
Setup writes both `DATABASE_ENGINE` and `AUTH_PERSISTENCE`, and production
Compose and Helm validate that the pairing agrees. The standalone migrator
image fails before database access when either selector is missing or
conflicts; only the selected provider's dependency set is installed.

## Consequences

- A closure with PostgreSQL never installs MongoDB packages, and vice versa,
  keeping images and installs small and scan-clean.
- Migrations, backups, restores, and rollback drills are provider-dispatched
  (`pnpm nrb db:*`) instead of engine-specific commands.
- Bundled MongoDB is a one-node replica set (transaction-capable, not HA);
  production HA requires an external managed/multi-node replica set
  (`docs/deployment.md`).

## Alternatives Considered

- A single PostgreSQL-only template: rejected because several target products
  require MongoDB.
- Runtime auto-detection of the database: rejected because implicit fallback
  caused the exact class of misdeployment this design removes.

## Validation

`pnpm nrb doctor` plus the closure checks enforce provider pairing; the
durable-provider proof matrix is documented in `docs/testing.md`, and the
migrator fail-closed contract is covered by the deployment validation specs
(`pnpm run deploy:validate`).
