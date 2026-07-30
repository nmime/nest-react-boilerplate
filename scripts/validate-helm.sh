#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_DIR="${ROOT_DIR}/.helm"
PROD_VALUES="${CHART_DIR}/values-production.yaml"
SELECTION_VALUES="${HELM_SELECTION_VALUES:-}"
RELEASE_NAME="${HELM_RELEASE_NAME:-nest-react-boilerplate}"
NAMESPACE="${HELM_NAMESPACE:-default}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if [[ -z "${SELECTION_VALUES}" || ! -f "${SELECTION_VALUES}" ]]; then
  echo "HELM_SELECTION_VALUES must name a setup-generated or explicit all-reference Helm values file." >&2
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "helm is required. Install Helm 4 or run in CI where azure/setup-helm is used." >&2
  exit 127
fi

HELM_VERSION_OUTPUT="$(helm version --short)"
HELM_MAJOR="${HELM_VERSION_OUTPUT#v}"
HELM_MAJOR="${HELM_MAJOR%%.*}"
if [[ ! "${HELM_MAJOR}" =~ ^[0-9]+$ ]] || (( HELM_MAJOR < 4 )); then
  echo "Helm 4 or newer is required; found ${HELM_VERSION_OUTPUT}." >&2
  exit 1
fi
echo "==> ${HELM_VERSION_OUTPUT}"

echo "==> Helm closure selection fixtures"
node "${ROOT_DIR}/scripts/validate-helm-selection.mjs" --write-all-reference-dir "${TMP_DIR}"
POSTGRES_REFERENCE_VALUES="${TMP_DIR}/postgres-all-reference.yaml"
MONGODB_REFERENCE_VALUES="${TMP_DIR}/mongodb-all-reference.yaml"

SELECTED_PROVIDER="$(node - "${SELECTION_VALUES}" <<'NODE'
const fs = require('node:fs');

const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/u);
let inDeployment = false;
let provider;
for (const line of lines) {
  if (/^deployment:\s*$/u.test(line)) {
    inDeployment = true;
    continue;
  }
  if (inDeployment && /^\S/u.test(line)) break;
  const match = inDeployment ? line.match(/^  provider:\s*(.*?)\s*$/u) : undefined;
  if (match) {
    provider = match[1].replace(/^(['"])(.*)\1$/u, '$2');
    break;
  }
}
if (!['', 'postgres', 'mongodb'].includes(provider)) {
  throw new Error('selection values must declare deployment.provider as empty, postgres, or mongodb');
}
process.stdout.write(provider || 'provider-free');
NODE
)"

echo "==> Helm lint/template (actual selected ${SELECTED_PROVIDER} production overlay)"
SELECTED_ARGS=()
if [[ "${SELECTED_PROVIDER}" == "mongodb" ]]; then
  SELECTED_ARGS+=(--set-string database.mongodb.replicaSet=ci-selected-rs)
fi
helm lint "${CHART_DIR}" \
  -f "${PROD_VALUES}" \
  -f "${SELECTION_VALUES}" \
  "${SELECTED_ARGS[@]}"
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  -f "${PROD_VALUES}" \
  -f "${SELECTION_VALUES}" \
  "${SELECTED_ARGS[@]}" \
  > "${TMP_DIR}/production.yaml"

case "${SELECTED_PROVIDER}" in
  provider-free)
    if grep -Eq 'kind: (Job|CronJob)|DATABASE_ENGINE:|POSTGRES_|MONGODB_' "${TMP_DIR}/production.yaml"; then
      echo "provider-free selected render must not contain migrations, backups, or database configuration" >&2
      exit 1
    fi
    ;;
  postgres)
    if ! grep -Fq 'DATABASE_ENGINE: "postgres"' "${TMP_DIR}/production.yaml" || \
      ! grep -Fq 'app.kubernetes.io/component: migrate' "${TMP_DIR}/production.yaml" || \
      grep -Fq 'MONGODB_' "${TMP_DIR}/production.yaml"; then
      echo "PostgreSQL selected render must contain PostgreSQL migration ownership without MongoDB configuration" >&2
      exit 1
    fi
    ;;
  mongodb)
    if ! grep -Fq 'DATABASE_ENGINE: "mongodb"' "${TMP_DIR}/production.yaml" || \
      ! grep -Fq 'app.kubernetes.io/component: migrate' "${TMP_DIR}/production.yaml" || \
      grep -Eq 'POSTGRES_|port: 5432' "${TMP_DIR}/production.yaml"; then
      echo "MongoDB selected render must contain MongoDB migration ownership without PostgreSQL configuration" >&2
      exit 1
    fi
    ;;
esac

echo "==> Helm lint (synthetic PostgreSQL all-reference)"
helm lint "${CHART_DIR}" \
  -f "${POSTGRES_REFERENCE_VALUES}" \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci

echo "==> Helm template (synthetic PostgreSQL all-reference)"
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  -f "${POSTGRES_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci \
  > "${TMP_DIR}/default.yaml"

echo "==> Helm template (synthetic PostgreSQL all-reference backup compatibility)"
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  -f "${POSTGRES_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci \
  > "${TMP_DIR}/postgres-backup.yaml"
if ! grep -Fq 'pg_dump --format=custom' "${TMP_DIR}/postgres-backup.yaml" || \
  grep -Fq 'MONGODB_BACKUP_RESTORE_URI' "${TMP_DIR}/postgres-backup.yaml"; then
  echo "PostgreSQL backup render must keep pg_dump and must not require MongoDB credentials" >&2
  exit 1
fi

echo "==> Helm lint/template (synthetic MongoDB all-reference backup compatibility)"
helm lint "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://ci:ci@mongo/ci?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://migration:ci@mongo/ci?replicaSet=ci-rs'
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set networkPolicy.enabled=true \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://ci:ci@mongo/ci?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://migration:ci@mongo/ci?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbBackupRestoreUri=mongodb://backup:ci@mongo/?authSource=admin&replicaSet=ci-rs' \
  > "${TMP_DIR}/mongodb.yaml"

echo "==> Helm rejects reused MongoDB principal identities"
if helm template reused-mongodb-principal "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://shared:runtime-password@mongo/runtime?authSource=identity-db&replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://shared:migration-password@mongo/migration?authSource=identity-db&replicaSet=ci-rs' \
  >/dev/null 2>&1; then
  echo "MongoDB runtime and migration URIs must reject the same username/auth database identity" >&2
  exit 1
fi
if helm template reused-runtime-backup-principal "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://shared:runtime-password@mongo/runtime?authSource=admin&replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://migration:migration-password@mongo/migration?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbBackupRestoreUri=mongodb://shared:backup-password@mongo/?authSource=admin&replicaSet=ci-rs' \
  >/dev/null 2>&1; then
  echo "MongoDB runtime and backup URIs must reject the same username/auth database identity" >&2
  exit 1
fi
if helm template reused-migration-backup-principal "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://shared:migration-password@mongo/migration?authSource=admin&replicaSet=ci-rs' \
  --set-string 'secrets.mongodbBackupRestoreUri=mongodb://shared:backup-password@mongo/?authSource=admin&replicaSet=ci-rs' \
  >/dev/null 2>&1; then
  echo "MongoDB migration and backup URIs must reject the same username/auth database identity" >&2
  exit 1
fi
if helm template percent-encoded-mongodb-principal "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://%73hared:runtime-password@mongo/runtime?authSource=identity%2Ddb&replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://shared:migration-password@mongo/migration?authSource=identity-db&replicaSet=ci-rs' \
  >/dev/null 2>&1; then
  echo "MongoDB principal identity comparison must percent-decode username and authSource" >&2
  exit 1
fi

echo "==> Helm accepts the same MongoDB username in distinct authentication databases"
helm template distinct-mongodb-auth-databases "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://%73hared:runtime-password@mongo/runtime?authSource=runtime%2Dauth&replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://shared:migration-password@mongo/migration?authSource=migration-auth&replicaSet=ci-rs' \
  >/dev/null

echo "==> Helm rejects reused MongoDB external Secret names"
for collision in runtime-migration runtime-backup migration-backup; do
  runtime_secret=runtime-mongodb
  migration_secret=migration-mongodb
  backup_secret=backup-mongodb
  case "${collision}" in
    runtime-migration) migration_secret="${runtime_secret}" ;;
    runtime-backup) backup_secret="${runtime_secret}" ;;
    migration-backup) backup_secret="${migration_secret}" ;;
  esac
  if helm template "reused-${collision}" "${CHART_DIR}" \
    -f "${MONGODB_REFERENCE_VALUES}" \
    --set deployment.provider=mongodb \
    --set database.engine=mongodb \
    --set-string database.mongodb.replicaSet=ci-rs \
    --set backups.enabled=true \
    --set backups.destination.pvc.enabled=true \
    --set-string backups.destination.pvc.claimName=nrb-ci-backups \
    --set-string secrets.existingSecret="${runtime_secret}" \
    --set-string migrations.mongodbExistingSecret="${migration_secret}" \
    --set-string backups.mongodb.existingSecret="${backup_secret}" \
    >/dev/null 2>&1; then
    echo "MongoDB external Secret collision was not rejected: ${collision}" >&2
    exit 1
  fi
done

echo "==> Helm rejects elevated external Secrets that collide with generated names"
if helm template generated-runtime-collision "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set fullnameOverride=generated-runtime \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string migrations.mongodbExistingSecret=generated-runtime-secrets \
  >/dev/null 2>&1; then
  echo "External migration Secret must not collide with the generated runtime Secret name" >&2
  exit 1
fi
if helm template generated-migration-collision "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set fullnameOverride=generated-migration \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string 'secrets.mongodbMigrationUri=mongodb://migration:migration-password@mongo/migration?replicaSet=ci-rs' \
  --set-string backups.mongodb.existingSecret=generated-migration-mongodb-migration \
  >/dev/null 2>&1; then
  echo "External backup Secret must not collide with the generated migration Secret name" >&2
  exit 1
fi
if helm template generated-backup-collision "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set fullnameOverride=generated-backup \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string migrations.mongodbExistingSecret=generated-backup-mongodb-backup-restore \
  --set-string 'secrets.mongodbBackupRestoreUri=mongodb://backup:backup-password@mongo/?authSource=admin&replicaSet=ci-rs' \
  >/dev/null 2>&1; then
  echo "External migration Secret must not collide with the generated backup Secret name" >&2
  exit 1
fi

echo "==> Helm template (generated runtime with separate external elevated Secrets)"
helm template generated-runtime-external-elevated "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set fullnameOverride=generated-hybrid \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string migrations.mongodbExistingSecret=external-migration \
  --set-string backups.mongodb.existingSecret=external-backup \
  > "${TMP_DIR}/mongodb-generated-runtime.yaml"
node - "${TMP_DIR}/mongodb-generated-runtime.yaml" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const documents = fs.readFileSync(process.argv[2], 'utf8').split(/^---\s*$/mu);
const secrets = documents.filter((document) => /^kind: Secret$/mu.test(document));
assert.equal(secrets.length, 1, 'hybrid render must create only the runtime Secret');
assert.match(secrets[0], /name: generated-hybrid-secrets/mu);
assert.doesNotMatch(secrets[0], /external-(migration|backup)/mu);
const migrationJob = documents.find(
  (document) => /^kind: Job$/mu.test(document) && /app.kubernetes.io\/component: migrate/mu.test(document),
);
assert.match(migrationJob, /name: external-migration/mu);
const backupCronJob = documents.find((document) => /^kind: CronJob$/mu.test(document));
assert.match(backupCronJob, /name: external-backup/mu);
NODE

echo "==> Helm template (generated backup with external migration Secret)"
helm template generated-backup-external-migration "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set fullnameOverride=generated-backup-hybrid \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set secrets.create=true \
  --set-string secrets.sessionSecret=ci-only-session-secret-minimum-32-characters \
  --set-string secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters \
  --set-string 'secrets.mongodbUri=mongodb://runtime:runtime-password@mongo/runtime?replicaSet=ci-rs' \
  --set-string migrations.mongodbExistingSecret=external-migration \
  --set-string 'secrets.mongodbBackupRestoreUri=mongodb://backup:backup-password@mongo/?authSource=admin&replicaSet=ci-rs' \
  > "${TMP_DIR}/mongodb-generated-backup.yaml"
node - "${TMP_DIR}/mongodb-generated-backup.yaml" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const documents = fs.readFileSync(process.argv[2], 'utf8').split(/^---\s*$/mu);
const secrets = documents.filter((document) => /^kind: Secret$/mu.test(document));
assert.equal(secrets.length, 2, 'hybrid render must create only runtime and backup Secrets');
const runtimeSecret = secrets.find((document) => /name: generated-backup-hybrid-secrets$/mu.test(document));
assert.ok(runtimeSecret, 'hybrid render must create the runtime Secret');
assert.match(runtimeSecret, /MONGODB_URI:/mu);
assert.doesNotMatch(runtimeSecret, /MONGODB_MIGRATION_URI|MONGODB_BACKUP_RESTORE_URI/mu);
const backupSecret = secrets.find((document) => /name: generated-backup-hybrid-mongodb-backup-restore$/mu.test(document));
assert.ok(backupSecret, 'hybrid render must create the backup Secret');
assert.match(backupSecret, /MONGODB_BACKUP_RESTORE_URI:/mu);
assert.doesNotMatch(backupSecret, /MONGODB_URI:|MONGODB_MIGRATION_URI/mu);
assert.ok(!secrets.some((document) => /name: external-migration$/mu.test(document)), 'external migration Secret must not be rendered');
const migrationJob = documents.find(
  (document) => /^kind: Job$/mu.test(document) && /app.kubernetes.io\/component: migrate/mu.test(document),
);
assert.match(migrationJob, /name: external-migration/mu);
assert.match(migrationJob, /key: MONGODB_MIGRATION_URI/mu);
const backupCronJob = documents.find((document) => /^kind: CronJob$/mu.test(document));
assert.match(backupCronJob, /name: generated-backup-hybrid-mongodb-backup-restore/mu);
assert.match(backupCronJob, /key: MONGODB_BACKUP_RESTORE_URI/mu);
const runtimeDeployments = documents.filter(
  (document) => /^kind: Deployment$/mu.test(document) && /key: MONGODB_URI$/mu.test(document),
);
assert.ok(runtimeDeployments.length > 0, 'hybrid render must contain MongoDB runtime Deployments');
for (const deployment of runtimeDeployments) {
  assert.match(deployment, /name: generated-backup-hybrid-secrets/mu);
  assert.doesNotMatch(deployment, /MONGODB_MIGRATION_URI|MONGODB_BACKUP_RESTORE_URI/mu);
}
NODE

echo "==> Helm template (separate external MongoDB Secrets)"
helm template separate-mongodb-secrets "${CHART_DIR}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --namespace "${NAMESPACE}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=ci-rs \
  --set backups.enabled=true \
  --set backups.destination.pvc.enabled=true \
  --set-string backups.destination.pvc.claimName=nrb-ci-backups \
  --set-string secrets.existingSecret=runtime-mongodb \
  --set-string migrations.mongodbExistingSecret=migration-mongodb \
  --set-string backups.mongodb.existingSecret=backup-mongodb \
  > "${TMP_DIR}/mongodb-separate-secrets.yaml"
node - "${TMP_DIR}/mongodb-separate-secrets.yaml" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');

const documents = fs.readFileSync(process.argv[2], 'utf8').split(/^---\s*$/mu);
const byKind = (kind) => documents.filter((document) => new RegExp(`^kind: ${kind}$`, 'mu').test(document));
const runtimeDeployments = byKind('Deployment').filter((document) => /key: MONGODB_URI$/mu.test(document));
assert.ok(runtimeDeployments.length > 0, 'MongoDB render must contain backend runtime Deployments');
for (const deployment of runtimeDeployments) {
  assert.match(deployment, /name: runtime-mongodb/mu);
  assert.doesNotMatch(deployment, /MONGODB_MIGRATION_URI|MONGODB_BACKUP_RESTORE_URI/mu);
  assert.doesNotMatch(deployment, /name: (migration|backup)-mongodb/mu);
}
const migrationJob = byKind('Job').find((document) => /app.kubernetes.io\/component: migrate/mu.test(document));
assert.ok(migrationJob, 'MongoDB render must contain the migration Job');
assert.match(migrationJob, /name: migration-mongodb/mu);
assert.match(migrationJob, /key: MONGODB_MIGRATION_URI/mu);
assert.doesNotMatch(migrationJob, /name: (runtime|backup)-mongodb/mu);
const backupCronJob = byKind('CronJob')[0];
assert.ok(backupCronJob, 'MongoDB render must contain the backup CronJob');
assert.match(backupCronJob, /name: backup-mongodb/mu);
assert.match(backupCronJob, /key: MONGODB_BACKUP_RESTORE_URI/mu);
assert.doesNotMatch(backupCronJob, /name: (runtime|migration)-mongodb/mu);
NODE

helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  -f "${PROD_VALUES}" \
  -f "${MONGODB_REFERENCE_VALUES}" \
  --set deployment.provider=mongodb \
  --set database.engine=mongodb \
  --set-string database.mongodb.replicaSet=production-rs \
  --set backups.enabled=true \
  > "${TMP_DIR}/production-mongodb.yaml"

if grep -Eq 'POSTGRES_|port: 5432' "${TMP_DIR}/mongodb.yaml"; then
  echo "MongoDB render must not contain PostgreSQL environment or egress" >&2
  exit 1
fi
for expected in 'MONGODB_URI:' 'MONGODB_MIGRATION_URI:' 'MONGODB_BACKUP_RESTORE_URI:' 'MONGODB_REPLICA_SET:' 'port: 27017' 'mongodump --uri "${MONGODB_BACKUP_RESTORE_URI}" --archive="${backup_file}" --gzip --oplog' 'runAsUser: 1000' 'fsGroup: 1000'; do
  if ! grep -Fq "${expected}" "${TMP_DIR}/mongodb.yaml"; then
    echo "MongoDB render missing: ${expected}" >&2
    exit 1
  fi
done
if grep -Eq 'POSTGRES_|port: 5432|kind: StatefulSet' "${TMP_DIR}/production-mongodb.yaml"; then
  echo "production MongoDB render must use only an externally managed MongoDB replica set" >&2
  exit 1
fi

if helm template invalid-engine "${CHART_DIR}" -f "${POSTGRES_REFERENCE_VALUES}" --set database.engine=sqlite >/dev/null 2>&1; then
  echo "database.engine must reject unsupported providers" >&2
  exit 1
fi
if helm template bundled-database "${CHART_DIR}" -f "${POSTGRES_REFERENCE_VALUES}" --set database.ownership=bundled-db >/dev/null 2>&1; then
  echo "the application chart must reject chart-owned production databases" >&2
  exit 1
fi

if grep -nE 'image: .*:latest"?$' "${TMP_DIR}/production.yaml"; then
  echo "production render must not contain :latest image tags" >&2
  exit 1
fi

if grep -nE 'proxy_pass http://(auth-app-api|user-app-api|admin-app-api)(:|/)' "${TMP_DIR}/production.yaml"; then
  echo "frontend nginx config must use Helm Service DNS names, not docker-compose upstream names" >&2
  exit 1
fi

for expected in \
  'proxy_pass http://nest-react-boilerplate-auth-app-api:80;' \
  'proxy_pass http://nest-react-boilerplate-user-app-api:80;' \
  'proxy_pass http://nest-react-boilerplate-admin-app-api:80;'
do
  if ! grep -Fq "${expected}" "${TMP_DIR}/default.yaml"; then
    echo "missing expected Kubernetes nginx upstream: ${expected}" >&2
    exit 1
  fi
done

if [[ -n "${KUBECONFORM_BIN:-}" ]]; then
  KUBECONFORM="${KUBECONFORM_BIN}"
elif command -v kubeconform >/dev/null 2>&1; then
  KUBECONFORM="$(command -v kubeconform)"
else
  KUBECONFORM="$(node "${ROOT_DIR}/scripts/install-kubeconform.mjs" --print-path)"
fi

echo "==> kubeconform"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/production.yaml"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/production-mongodb.yaml"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/postgres-backup.yaml"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/mongodb-separate-secrets.yaml"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/mongodb-generated-runtime.yaml"
"${KUBECONFORM}" -strict -ignore-missing-schemas "${TMP_DIR}/mongodb-generated-backup.yaml"

echo "==> helm render assertions (node --test)"
node --test "${ROOT_DIR}/scripts/helm-template.spec.mjs"

echo "Helm validation passed. Rendered manifests are in ${TMP_DIR} until script exit."
