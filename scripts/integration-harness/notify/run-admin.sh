#!/usr/bin/env bash
export PATH="$HOME/.local/node/bin:$PATH"
# Harness helper: boot admin-app-api (admin notification HTTP surface) with the lane .env
set -a
. "$(dirname "$0")/../../../.env"
set +a
# Explicit port per repo convention (getPortEnvVarName): every service has its own port.
export ADMIN_APP_API_PORT=3001
# Mock TLS CA is generated on demand; only export it when present (mocks speak plain HTTP).
CA="$(dirname "$0")/tls/mock-ca.pem"
if [ -f "$CA" ]; then export NODE_EXTRA_CA_CERTS="$CA"; fi
exec pnpm exec nx serve admin-app-api
