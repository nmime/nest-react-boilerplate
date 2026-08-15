## Actors

- Release operator compiling selected product images on a build machine.
- One-VPS operator inspecting an Ubuntu/Debian compose host over SSH.

## Rules

- Bake compiles selected apps once for a shared `NX_BUILD_PROJECTS` union.
- Per-image slice args (`RUNTIME_PROJECT`, `BUILD_OUTPUT`, `FRONTEND_OUTPUT`)
  apply after compile.
- SSH probe is read-only: BatchMode, no deploy, no Bake, no secret dump.
- Live SSH is opt-in (`NRB_SSH_HOST` or `--host`). CI without a host stays green.

## Examples

- Two Bake targets with the same union share one builder compile layer.
- `IMAGE_TAG=local` or `COMPOSE_IMAGE_SOURCE=local` on a probed compose host fails.
- Registry refs containing credentials are redacted to `redacted`.

## Counterexamples

- The probe does not `docker compose up`, `bake`, or print `DATABASE_URL`.
- Native PM2 hosts are out of scope for this compose probe.

## Unresolved

None. Live authentication remains an operator-supplied key; this change does
not add credentials.
