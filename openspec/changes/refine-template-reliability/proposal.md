# Repair template reliability and evidence boundaries

## Why

The complete template audit found setup and runtime paths that can discard
product ownership or report success without the promised evidence. Repair the
existing paths before the upgraded template receives final review.

## What Changes

- Preserve product namespaces across every setup selection path.
- Probe fresh PostgreSQL migration state without parsing an absent relation.
- Validate runtime library scope/layer and exhausted application ports before writes.
- Keep destructive payment component fixtures on containers they own and fail if that fixture cannot start.
- Require a valid selected runtime configuration and every expected service before readiness can pass.
- Fail CI parity when every declared pipeline is absent and align GitLab merge dependencies with schedule-only jobs.
- Render Telegram account-link actions from the bot's owned locale catalog.
- Resolve the remaining source-supported runtime, generator, fixture, quality,
  frontend, and documentation gaps as individually specified in this change.
- Keep proof boundaries explicit: local tests, CI, deployments, external
  providers, and native acceptance cannot substitute for one another.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-scaffolding`: `REQ-SCAFFOLD-INIT-004` retains product namespaces and
  safely distinguishes a fresh database from applied or unknown migration state.
  `REQ-SCAFFOLD-GENERATORS-003` validates runtime inputs and finite port allocation;
  `REQ-SCAFFOLD-SAFETY-008` isolates destructive component fixture ownership.
- `runtime-operations`: `REQ-RUNTIME-DELIVERY-009` refuses empty, missing, failed,
  and malformed selected runtime readiness.
- `repository-assurance`: `REQ-ASSURANCE-RELEASE-003` requires configured CI
  evidence and valid merge-lane dependencies.
- `social-integrations`: `REQ-SOCIAL-CONFIG-004` retains owned bot copy for
  account-link menu and callback fallbacks in each supported locale.

## Impact

Existing repository tooling and its setup/reconfiguration evidence initially.
Further traced owners and requirements are added before their implementation.
No main merge, deployment, or production mutation is authorized by this change.
