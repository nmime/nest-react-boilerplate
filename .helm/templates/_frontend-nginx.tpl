{{- define "boilerplate.frontendSecurityHeaders" -}}
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Vary "Accept" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src {{ .Values.frontendNginx.cspConnectSrc }}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;
{{- end -}}

{{- define "boilerplate.frontendUncachedHeaders" -}}
{{ include "boilerplate.frontendSecurityHeaders" . }}
add_header Cache-Control "private, no-cache, no-store, must-revalidate" always;
add_header Expires "Sat, 01 Jan 2000 00:00:00 GMT" always;
add_header Pragma "no-cache" always;
{{- end -}}
