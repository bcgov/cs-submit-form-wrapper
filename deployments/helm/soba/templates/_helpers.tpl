{{/*
Chart name, truncated to 63 chars.
*/}}
{{- define "soba.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name: <chart>-<release>.
If release name already contains the chart name, avoid duplication.
Truncated to 63 chars (K8s label limit).
*/}}
{{- define "soba.fullname" -}}
{{- if .Values.fullnameOverride }}
  {{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
  {{- $name := default .Chart.Name .Values.nameOverride }}
  {{- if contains $name .Release.Name }}
    {{- .Release.Name | trunc 63 | trimSuffix "-" }}
  {{- else }}
    {{- printf "%s-%s" $name .Release.Name | trunc 63 | trimSuffix "-" }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
Common labels applied to every resource.
Usage: {{ include "soba.labels" (dict "root" . "component" "backend") }}
*/}}
{{- define "soba.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "soba.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- if .component }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
{{- end }}

{{/*
Selector labels (immutable, used in matchLabels and pod template).
Usage: {{ include "soba.selectorLabels" (dict "root" . "component" "backend") }}
*/}}
{{- define "soba.selectorLabels" -}}
app.kubernetes.io/name: {{ include "soba.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- if .component }}
app.kubernetes.io/component: {{ .component }}
{{- end }}
{{- end }}

{{/*
Resource-policy annotation: "keep" unless global.forceCleanup is true.
*/}}
{{- define "soba.keepPolicy" -}}
{{- if not .Values.global.forceCleanup }}
"helm.sh/resource-policy": keep
{{- end }}
{{- end }}

{{/*
Construct the Form.io base URL.
If formio is internal, point at the in-cluster service; otherwise use formio.external.url.
*/}}
{{- define "soba.formioBaseUrl" -}}
{{- if .Values.formio.internal.enabled }}
  {{- printf "http://%s-formio:%v" (include "soba.fullname" .) (.Values.formio.service.port | default 3001) }}
{{- else }}
  {{- .Values.formio.external.url }}
{{- end }}
{{- end }}

{{/*
Construct the MongoDB URI.
If mongodb is internal, point at the in-cluster service; otherwise use mongodb.external.uri.
*/}}
{{- define "soba.mongodbUri" -}}
{{- if .Values.mongodb.internal.enabled }}
  {{- printf "mongodb://%s-mongodb:%v/formio-ce" (include "soba.fullname" .) (.Values.mongodb.service.port | default 27017) }}
{{- else }}
  {{- .Values.mongodb.external.uri }}
{{- end }}
{{- end }}

{{/*
Public host for a named frontend app (Route / Ingress).
Per-app `host` override wins; otherwise <fullname>-<name>.<domain>.
Usage: {{ include "soba.frontendHostFor" (dict "root" $ "name" $name "app" $app) }}
*/}}
{{- define "soba.frontendHostFor" -}}
{{- if .app.host -}}
{{- .app.host -}}
{{- else -}}
{{- printf "%s-%s.%s" (include "soba.fullname" .root) .name .root.Values.global.domain -}}
{{- end -}}
{{- end }}

{{/*
Comma-separated https:// origins for every enabled frontend app.
Feeds the backend CORS allowlist so both modes can call the API.
*/}}
{{- define "soba.frontendOrigins" -}}
{{- $root := . -}}
{{- $origins := list -}}
{{- range $name, $app := .Values.frontend.apps -}}
{{- if ne $app.enabled false -}}
{{- $host := include "soba.frontendHostFor" (dict "root" $root "name" $name "app" $app) -}}
{{- $origins = append $origins (printf "https://%s" $host) -}}
{{- end -}}
{{- end -}}
{{- join "," $origins -}}
{{- end }}

{{/*
Backend public URL host (browser and NEXT_PUBLIC_SOBA_API_BASE_URL).
*/}}
{{- define "soba.backendHost" -}}
{{- printf "%s-api.%s" (include "soba.fullname" .) .Values.global.domain }}
{{- end }}

{{/*
Cluster-internal API base URL for Next.js SSR (Server Components) — plain HTTP to backend Service.
See frontend SOBA_API_INTERNAL_URL in runtimeConfig. Override with frontend.internalApiBaseUrl if needed.
*/}}
{{- define "soba.sobaApiInternalBaseUrl" -}}
{{- printf "http://%s-backend.%s.svc.cluster.local:%v/api/v1" (include "soba.fullname" .) .Release.Namespace (.Values.backend.service.port) }}
{{- end }}

{{/*
Database secret name and key.
*/}}
{{- define "soba.dbSecretName" -}}
{{- if .Values.database.existingSecretName }}
{{- .Values.database.existingSecretName }}
{{- else }}
{{- printf "%s-db" (include "soba.fullname" .) }}
{{- end }}
{{- end }}

{{- define "soba.dbSecretKey" -}}
{{- if .Values.database.existingSecretName }}
{{- .Values.database.existingSecretKey }}
{{- else }}
DATABASE_URL
{{- end }}
{{- end }}

{{/*
Truthy ("true") only when the tempstorage-mount plugin is selected. Gates the
temp PVC, its mount, and PLUGIN_TEMPSTORAGE_MOUNT_DIR off one value so they
cannot drift apart. Any other code (e.g. tempstorage-os) needs no PVC.
*/}}
{{- define "soba.tempStorageUsesMount" -}}
{{- if eq .Values.backend.config.tempStorageDefaultCode "tempstorage-mount" -}}true{{- end -}}
{{- end }}

{{/*
Truthy ("true") only when the backend scans with clamav. Gates the clamav alias
Service and the PLUGIN_VIRUSSCAN_CLAMAV_* env together so they cannot drift apart.
Any other code (e.g. virusscan-noop) needs no clamav wiring.
*/}}
{{- define "soba.virusScanUsesClamav" -}}
{{- if eq .Values.backend.config.virusScanDefaultCode "virusscan-clamav" -}}true{{- end -}}
{{- end }}
