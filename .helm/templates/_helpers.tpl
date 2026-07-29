{{- define "boilerplate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "boilerplate.databaseEngine" -}}
{{- include "boilerplate.validateSelection" . -}}
{{- $engine := default "" .Values.database.engine -}}
{{- if and $engine (not (has $engine (list "postgres" "mongodb"))) -}}
{{- fail "database.engine must be empty, postgres, or mongodb" -}}
{{- end -}}
{{- if and $engine (ne (default "external-db" .Values.database.ownership) "external-db") -}}
{{- fail "this application chart supports database.ownership=external-db only" -}}
{{- end -}}
{{- if eq $engine "mongodb" -}}
{{- include "boilerplate.validateMongoSecretNames" . -}}
{{- end -}}
{{- $engine -}}
{{- end -}}

{{- define "boilerplate.validateSelection" -}}
{{- $selected := .Values.deployment.selectedApps | default (list) -}}
{{- if eq (len $selected) 0 -}}
{{- fail "deployment.selectedApps is required; include the setup-generated .helm/values-selection.yaml" -}}
{{- end -}}
{{- if ne (len $selected) (len (uniq $selected)) -}}
{{- fail "deployment.selectedApps must not contain duplicates" -}}
{{- end -}}
{{- $known := list -}}
{{- $durableEnabled := false -}}
{{- range $name, $app := .Values.apps -}}
{{- $appId := required (printf "apps.%s.appId is required" $name) $app.appId -}}
{{- $known = append $known $appId -}}
{{- if and $app.enabled (not (has $appId $selected)) -}}
{{- fail (printf "apps.%s enables unselected application %s" $name $appId) -}}
{{- end -}}
{{- if and $app.enabled (or (eq $app.kind "backend") (eq $app.kind "background")) -}}
{{- $durableEnabled = true -}}
{{- end -}}
{{- end -}}
{{- range $appId := $selected -}}
{{- if not (has $appId $known) -}}
{{- fail (printf "deployment.selectedApps contains unknown application %s" $appId) -}}
{{- end -}}
{{- end -}}
{{- $provider := default "" .Values.deployment.provider -}}
{{- if and $provider (not (has $provider (list "postgres" "mongodb"))) -}}
{{- fail "deployment.provider must be empty, postgres, or mongodb" -}}
{{- end -}}
{{- if ne $provider (default "" .Values.database.engine) -}}
{{- fail "database.engine must match deployment.provider from the selected closure" -}}
{{- end -}}
{{- if and $durableEnabled (not $provider) -}}
{{- fail "enabled backend/background applications require a selected durable provider" -}}
{{- end -}}
{{- if and (not $provider) (or .Values.migrations.enabled .Values.backups.enabled) -}}
{{- fail "migrations and backups require a selected durable provider" -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.hasBackendWorkloads" -}}
{{- $enabled := false -}}
{{- range $app := .Values.apps -}}
{{- if and $app.enabled (or (eq $app.kind "backend") (eq $app.kind "background")) -}}
{{- $enabled = true -}}
{{- end -}}
{{- end -}}
{{- $enabled -}}
{{- end -}}

{{- define "boilerplate.appEnabled" -}}
{{- $enabled := false -}}
{{- range $app := .root.Values.apps -}}
{{- if and $app.enabled (eq $app.appId $.appId) -}}
{{- $enabled = true -}}
{{- end -}}
{{- end -}}
{{- $enabled -}}
{{- end -}}

{{- define "boilerplate.validateMongoSecretNames" -}}
{{- $runtimeSecret := include "boilerplate.secretName" . -}}
{{- $migrationSecret := "" -}}
{{- if or .Values.migrations.enabled .Values.migrations.mongodbExistingSecret -}}
{{- $migrationSecret = include "boilerplate.mongodbMigrationSecretName" . -}}
{{- end -}}
{{- $backupRestoreSecret := "" -}}
{{- if or .Values.backups.enabled .Values.backups.mongodb.existingSecret -}}
{{- $backupRestoreSecret = include "boilerplate.mongodbBackupRestoreSecretName" . -}}
{{- end -}}
{{- if and $migrationSecret (eq $runtimeSecret $migrationSecret) -}}
{{- fail "resolved runtime and migration Secret names must be distinct for MongoDB" -}}
{{- end -}}
{{- if and $backupRestoreSecret (eq $runtimeSecret $backupRestoreSecret) -}}
{{- fail "resolved runtime and backup/restore Secret names must be distinct for MongoDB" -}}
{{- end -}}
{{- if and $migrationSecret $backupRestoreSecret (eq $migrationSecret $backupRestoreSecret) -}}
{{- fail "resolved migration and backup/restore Secret names must be distinct for MongoDB" -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.percentDecodeMongoIdentityComponent" -}}
{{- $parsed := urlParse (printf "http://identity.invalid/%s" .) -}}
{{- trimPrefix "/" $parsed.path -}}
{{- end -}}

{{- define "boilerplate.mongodbPrincipalIdentity" -}}
{{- $uri := required "MongoDB principal URI is required" . -}}
{{- if not (regexMatch `(?i)^mongodb(\+srv)?://[^:/@]+(:[^@]*)?@[^/]+(/.*)?$` $uri) -}}
{{- fail "MongoDB principal URI must include a username" -}}
{{- end -}}
{{- $encodedUsername := regexReplaceAll `(?i)^mongodb(\+srv)?://([^:/@]+)(:[^@]*)?@.*$` $uri `${2}` -}}
{{- $username := include "boilerplate.percentDecodeMongoIdentityComponent" $encodedUsername -}}
{{- $authDatabase := "admin" -}}
{{- $authSourceOption := regexFind `(?i)[?&]authsource=[^&]+` $uri -}}
{{- if $authSourceOption -}}
{{- $authDatabase = regexReplaceAll `(?i)^[?&]authsource=` $authSourceOption "" -}}
{{- else -}}
{{- $databasePath := regexReplaceAll `(?i)^mongodb(\+srv)?://[^/]+/([^?]*).*$` $uri `${2}` -}}
{{- if and $databasePath (ne $databasePath $uri) -}}
{{- $authDatabase = $databasePath -}}
{{- end -}}
{{- end -}}
{{- $authDatabase = include "boilerplate.percentDecodeMongoIdentityComponent" $authDatabase -}}
{{- toJson (list $username $authDatabase) -}}
{{- end -}}

{{- define "boilerplate.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" (include "boilerplate.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.labels" -}}
app.kubernetes.io/name: {{ include "boilerplate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "boilerplate.secretName" -}}
{{- default (printf "%s-secrets" (include "boilerplate.fullname" .)) .Values.secrets.existingSecret -}}
{{- end -}}

{{- define "boilerplate.mongodbMigrationSecretName" -}}
{{- if .Values.migrations.mongodbExistingSecret -}}
{{- .Values.migrations.mongodbExistingSecret -}}
{{- else if .Values.secrets.create -}}
{{- printf "%s-mongodb-migration" (include "boilerplate.fullname" .) -}}
{{- else -}}
{{- fail "migrations.mongodbExistingSecret is required for MongoDB unless secrets.create=true" -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.mongodbBackupRestoreSecretName" -}}
{{- if .Values.backups.mongodb.existingSecret -}}
{{- .Values.backups.mongodb.existingSecret -}}
{{- else if .Values.secrets.create -}}
{{- printf "%s-mongodb-backup-restore" (include "boilerplate.fullname" .) -}}
{{- else -}}
{{- fail "backups.mongodb.existingSecret is required when MongoDB backups are enabled unless secrets.create=true" -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.image" -}}
{{- $name := .name -}}
{{- $image := .image -}}
{{- $repository := required (printf "%s.image.repository is required" $name) $image.repository -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $repository $image.digest -}}
{{- else -}}
{{- $tag := required (printf "%s.image.tag or %s.image.digest is required" $name $name) $image.tag -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end -}}
