{{- define "boilerplate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "boilerplate.fullname" -}}
{{- .Values.fullnameOverride | default .Release.Name | trunc 63 | trimSuffix "-" -}}
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

{{- define "boilerplate.validatePublicHostname" -}}
{{- $hostname := toString . -}}
{{- $labelPattern := "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" -}}
{{- if or (gt (len $hostname) 253) (ne $hostname (lower $hostname)) -}}
{{- fail (printf "ingress host %q must be a lowercase DNS hostname" $hostname) -}}
{{- end -}}
{{- range $label := splitList "." $hostname -}}
{{- if or (gt (len $label) 63) (not (regexMatch $labelPattern $label)) -}}
{{- fail (printf "ingress host %q must be a valid DNS hostname" $hostname) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "boilerplate.landingAppDestination" -}}
{{- $root := .root -}}
{{- $service := .service -}}
{{- $fallback := .fallback -}}
{{- $landingHost := "" -}}
{{- $destinationHost := "" -}}
{{- $destinationPath := "/" -}}
{{- range $host := $root.Values.ingress.hosts -}}
{{- $enabled := or (not (hasKey $host "enabled")) $host.enabled -}}
{{- if and $enabled (eq $host.service "landing-app") -}}
{{- $landingHost = toString $host.host -}}
{{- end -}}
{{- if and $enabled (eq $host.service $service) -}}
{{- $destinationHost = toString $host.host -}}
{{- if $host.paths -}}
{{- $destinationPath = toString (index $host.paths 0) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if not $destinationHost -}}
{{- $fallback -}}
{{- else -}}
{{- include "boilerplate.validatePublicHostname" $destinationHost -}}
{{- if not (regexMatch "^/[A-Za-z0-9._~%/-]*$" $destinationPath) -}}
{{- fail (printf "ingress path %q for %s is not a safe public application path" $destinationPath $service) -}}
{{- end -}}
{{- if and $landingHost (eq $destinationHost $landingHost) -}}
{{- if eq $destinationPath "/" -}}
{{- fail (printf "%s must use a non-root ingress path when it shares the landing-app host" $service) -}}
{{- end -}}
{{- $destinationPath -}}
{{- else if eq $destinationPath "/" -}}
{{- printf "https://%s" $destinationHost -}}
{{- else -}}
{{- printf "https://%s%s" $destinationHost $destinationPath -}}
{{- end -}}
{{- end -}}
{{- end -}}
