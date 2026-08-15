## Why

A full Bake still recompiled the selected Nx graph per image because
`RUNTIME_PROJECT` sat in the Dockerfile builder stage. Operators also had no
read-only way to inspect a one-VPS host over SSH before pulling images.

## What Changes

- Keep the shared `NX_BUILD_PROJECTS` union; stop the builder compile `RUN`
  from depending on per-image `RUNTIME_PROJECT`.
- Add `scripts/verify-single-server-ssh.mjs` for a BatchMode, no-deploy SSH
  probe of architecture, Docker, and image-source pins.
- Extend `REQ-RUNTIME-DELIVERY-009` with a shared-builder scenario and an SSH
  thin-host scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-operations`: Bake compile-once layer sharing and read-only SSH host
  verification.

## Impact

- `Dockerfile` builder stage
- `scripts/build-images.spec.mjs`, `scripts/validate-deployment-config.mjs`
- `scripts/verify-single-server-ssh.mjs` and its tests
- `openspec/specs/runtime-operations/spec.md` and `verification.yaml`
- command matrix and single-server runbook
