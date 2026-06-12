#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_DIR="${ROOT_DIR}/.helm"
PROD_VALUES="${CHART_DIR}/values-production.yaml"
RELEASE_NAME="${HELM_RELEASE_NAME:-nest-react-boilerplate}"
NAMESPACE="${HELM_NAMESPACE:-default}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if ! command -v helm >/dev/null 2>&1; then
  echo "helm is required. Install Helm 3 or run in CI where azure/setup-helm is used." >&2
  exit 127
fi

echo "==> Helm lint (default values with synthetic in-chart Secret)"
helm lint "${CHART_DIR}" \
  --set secrets.create=true \
  --set-string secrets.authJwtSecret=ci-only-auth-jwt-secret-minimum-32-characters \
  --set-string secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci

echo "==> Helm template (default values)"
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --set secrets.create=true \
  --set-string secrets.authJwtSecret=ci-only-auth-jwt-secret-minimum-32-characters \
  --set-string secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci \
  > "${TMP_DIR}/default.yaml"

echo "==> Helm lint (production values)"
helm lint "${CHART_DIR}" -f "${PROD_VALUES}"

echo "==> Helm template (production values)"
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  -f "${PROD_VALUES}" \
  > "${TMP_DIR}/production.yaml"

if grep -nE 'image: .*:latest"?$' "${TMP_DIR}/production.yaml"; then
  echo "production render must not contain :latest image tags" >&2
  exit 1
fi

if grep -nE 'proxy_pass http://(auth-app-api|user-app-api|admin-app-api)(:|/)' "${TMP_DIR}/production.yaml"; then
  echo "frontend nginx config must use Helm Service DNS names, not docker-compose upstream names" >&2
  exit 1
fi

for expected in \
  'proxy_pass http://nest-react-boilerplate-auth-api:3000;' \
  'proxy_pass http://nest-react-boilerplate-user-api:3000;' \
  'proxy_pass http://nest-react-boilerplate-admin-api:3000;'
do
  if ! grep -Fq "${expected}" "${TMP_DIR}/production.yaml"; then
    echo "missing expected Kubernetes nginx upstream: ${expected}" >&2
    exit 1
  fi
done

if command -v kubeconform >/dev/null 2>&1; then
  echo "==> kubeconform"
  kubeconform -strict -ignore-missing-schemas "${TMP_DIR}/production.yaml"
elif command -v kubectl >/dev/null 2>&1 && kubectl cluster-info >/dev/null 2>&1; then
  echo "==> kubectl client-side dry-run"
  kubectl apply --dry-run=client --validate=false -f "${TMP_DIR}/production.yaml" >/dev/null
else
  echo "==> kubeconform/kubectl cluster unavailable; skipped Kubernetes schema dry-run"
fi

echo "Helm validation passed. Rendered manifests are in ${TMP_DIR} until script exit."
