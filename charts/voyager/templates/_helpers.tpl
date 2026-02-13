{{- define "voyager.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "voyager.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "voyager.selectorLabels.web" -}}
app: voyager-web
{{- end }}

{{- define "voyager.selectorLabels.api" -}}
app: voyager-api
{{- end }}
