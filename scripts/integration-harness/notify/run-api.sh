#!/usr/bin/env bash
export PATH="$HOME/.local/node/bin:$PATH"
# Harness helper: boot auth-app-api (auth + product-notification HTTP surface;
# the former social-agents-api was split into per-domain apps on main) with the lane .env
set -a
. "$(dirname "$0")/../../../.env"
set +a
export AUTH_APP_API_PORT=3003
# Mock TLS CA is generated on demand; only export it when present (mocks speak plain HTTP).
CA="$(dirname "$0")/tls/mock-ca.pem"
if [ -f "$CA" ]; then export NODE_EXTRA_CA_CERTS="$CA"; fi
exec pnpm exec nx serve auth-app-api
