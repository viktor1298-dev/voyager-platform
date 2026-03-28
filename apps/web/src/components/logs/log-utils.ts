export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | null

export function detectLogLevel(line: string): LogLevel {
  const upper = line.toUpperCase()
  if (/\bERROR\b|\bFATAL\b|\bCRIT(ICAL)?\b/.test(upper)) return 'ERROR'
  if (/\bWARN(ING)?\b/.test(upper)) return 'WARN'
  if (/\bINFO\b/.test(upper)) return 'INFO'
  if (/\bDEBUG\b|\bTRACE\b/.test(upper)) return 'DEBUG'
  return null
}

export function extractTimestamp(line: string): { timestamp: string | null; content: string } {
  // Match ISO 8601 and common log formats
  const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?)\s*(.*)/)
  if (isoMatch) return { timestamp: isoMatch[1]!, content: isoMatch[2]! }
  // Match epoch-style timestamps at start
  const epochMatch = line.match(/^(\d{10,13})\s+(.*)/)
  if (epochMatch)
    return { timestamp: new Date(Number(epochMatch[1])).toISOString(), content: epochMatch[2]! }
  return { timestamp: null, content: line }
}

export function isJsonLine(content: string): boolean {
  const trimmed = content.trim()
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  )
}

export function formatRelativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime()
  if (diff < 1000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}
