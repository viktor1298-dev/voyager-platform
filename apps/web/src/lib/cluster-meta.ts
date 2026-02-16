export type ClusterEnvironment = 'prod' | 'staging' | 'dev'

export const ENV_META: Record<
  ClusterEnvironment,
  {
    label: string
    sectionLabel: string
    color: string
    badgeClass: string
  }
> = {
  prod: {
    label: 'Production',
    sectionLabel: 'Production',
    color: 'rgb(107 114 128)',
    badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  },
  staging: {
    label: 'Staging / QA',
    sectionLabel: 'Staging / QA',
    color: 'rgb(59 130 246)',
    badgeClass: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  dev: {
    label: 'Dev / Minikube',
    sectionLabel: 'Dev / Minikube',
    color: 'rgb(168 85 247)',
    badgeClass: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
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
