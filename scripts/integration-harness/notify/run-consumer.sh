#!/usr/bin/env bash
export PATH="$HOME/.local/node/bin:$PATH"
# Harness helper: boot notification-consumer with the lane .env
set -a
. "$(dirname "$0")/../../../.env"
set +a
# Mock TLS CA is generated on demand; only export it when present (mocks speak plain HTTP).
CA="$(dirname "$0")/tls/mock-ca.pem"
if [ -f "$CA" ]; then export NODE_EXTRA_CA_CERTS="$CA"; fi
exec pnpm exec nx serve notification-consumer
