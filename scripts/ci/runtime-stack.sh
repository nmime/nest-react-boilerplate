#!/usr/bin/env bash
# Forge-neutral entry point for the Compose runtime stack.
#
# The sequence itself lives in scripts/ci/runtime-stack.mjs, which
# .github/actions/runtime-stack invokes too. This file used to carry a copy of
# that sequence in bash, and the copies drifted; there is nothing left here to
# keep in sync.
#
# COMPOSE_FILE_PATH, START_ATTEMPTS, and READINESS_TIMEOUT are read from the
# environment by the shared driver.
set -uo pipefail

exec node "$(dirname "$0")/runtime-stack.mjs"
