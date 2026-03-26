export function slugifyClusterName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getClusterRouteSegment(cluster: { id: string; name?: string | null }): string {
  const id = cluster.id.trim()
  const slug = cluster.name ? slugifyClusterName(cluster.name) : ''
  return slug ? `${id}--${slug}` : id
}

export function getClusterIdFromRouteSegment(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed) return trimmed
  const separatorIndex = trimmed.indexOf('--')
  return separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex)
}
