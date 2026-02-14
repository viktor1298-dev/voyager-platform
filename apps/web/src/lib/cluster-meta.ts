export type ClusterEnvironment = 'prod' | 'staging' | 'dev'

export const ENV_META: Record<
  ClusterEnvironment,
  {
    label: string
    sectionLabel: string
    color: string
    softBg: string
    ring: string
  }
> = {
  prod: {
    label: 'Production',
    sectionLabel: 'Production',
    color: 'var(--color-status-error)',
    softBg: 'color-mix(in srgb, var(--color-status-error) 10%, transparent)',
    ring: 'color-mix(in srgb, var(--color-status-error) 40%, transparent)',
  },
  staging: {
    label: 'Staging / QA',
    sectionLabel: 'Staging / QA',
    color: 'var(--color-status-warning)',
    softBg: 'color-mix(in srgb, var(--color-status-warning) 10%, transparent)',
    ring: 'color-mix(in srgb, var(--color-status-warning) 40%, transparent)',
  },
  dev: {
    label: 'Dev / Minikube',
    sectionLabel: 'Dev / Minikube',
    color: 'var(--color-status-active)',
    softBg: 'color-mix(in srgb, var(--color-status-active) 10%, transparent)',
    ring: 'color-mix(in srgb, var(--color-status-active) 40%, transparent)',
  },
}

/**
 * Derives the cluster environment from naming/provider conventions.
 *
 * Heuristic:
 * - `prod` when the combined cluster name/provider contains production-like keywords
 *   (`prod`, `production`, `live`)
 * - `staging` for pre-production keywords (`stage`, `staging`, `qa`, `uat`, `preprod`)
 * - defaults to `dev` when no known keyword is detected
 */
export function getClusterEnvironment(name: string, provider?: string | null): ClusterEnvironment {
  const text = `${name} ${provider ?? ''}`.toLowerCase()
  // TODO: Replace with DB-backed environment field when cluster model supports it
  if (/(prod|production|live)/.test(text)) return 'prod'
  if (/(stage|staging|qa|uat|preprod)/.test(text)) return 'staging'
  return 'dev'
}

export function getClusterTags(input: {
  name: string
  provider?: string | null
  source?: 'live' | 'db'
}): string[] {
  const tags = new Set<string>()
  const fullText = `${input.name} ${input.provider ?? ''}`.toLowerCase()

  if (input.source === 'live') tags.add('live')
  if (fullText.includes('minikube')) tags.add('minikube')
  if (fullText.includes('k3s')) tags.add('k3s')
  if (fullText.includes('edge')) tags.add('edge')

  const env = getClusterEnvironment(input.name, input.provider)
  tags.add(env)

  return Array.from(tags)
}

export function normalizeHealth(status: string | null | undefined): 'healthy' | 'warning' | 'degraded' {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning') return 'warning'
  return 'degraded'
}
