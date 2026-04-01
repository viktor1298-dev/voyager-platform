/** Parse K8s CPU resource string to millicores (e.g., "500m" → 500, "2" → 2000) */
export function parseCpuMillicores(value: string | null): number {
  if (!value) return 0
  if (value.endsWith('m')) return Number.parseInt(value, 10) || 0
  const cores = Number.parseFloat(value)
  return Number.isNaN(cores) ? 0 : Math.round(cores * 1000)
}

/** Parse K8s memory resource string to MiB (e.g., "512Mi" → 512, "2Gi" → 2048) */
export function parseMemoryMi(value: string | null): number {
  if (!value) return 0
  if (value.endsWith('Mi')) return Number.parseInt(value, 10) || 0
  if (value.endsWith('Gi')) return (Number.parseFloat(value) || 0) * 1024
  if (value.endsWith('Ki')) return Math.round((Number.parseInt(value, 10) || 0) / 1024)
  const bytes = Number.parseInt(value, 10)
  return Number.isNaN(bytes) ? 0 : Math.round(bytes / 1048576)
}
