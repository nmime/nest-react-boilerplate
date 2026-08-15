## Builder sharing

Declare `ARG RUNTIME_PROJECT` only in `backend-deps` and `site-deps`. The
builder compile `RUN` uses `PROJECTS="${NX_BUILD_PROJECTS:-$NX_PROJECT}"`.
Bake may still pass `RUNTIME_PROJECT` as a target arg; unused in the builder
stage, it does not bust the compile layer.

## SSH probe

`scripts/verify-single-server-ssh.mjs` builds a BatchMode `ssh` argv, runs a
POSIX remote script, parses `key=value` lines, redacts registry credentials,
and evaluates the thin compose contract. Tests inject `spawn`. Live connect
is opt-in via `--host` / `NRB_SSH_HOST`.
