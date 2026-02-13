export function formatCPU(millicores: number | null | undefined): string {
  if (millicores == null) return '—'
  if (millicores >= 1000) return `${(millicores / 1000).toFixed(1)} cores`
  return `${millicores}m`
}

export function formatMemory(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export function formatTimestamp(ts: string | Date): string {
  const d = new Date(ts)
  return d.toLocaleString('en-IL', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
