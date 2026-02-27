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
    badgeClass: 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60',
  },
  staging: {
    label: 'Staging / QA',
    sectionLabel: 'Staging / QA',
    color: 'rgb(103 166 178)',
    badgeClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/50',
  },
  dev: {
    label: 'Dev / Minikube',
    sectionLabel: 'Dev / Minikube',
    color: 'rgb(152 120 198)',
    badgeClass: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
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

export function normalizeHealth(status: string | null | undefined): 'healthy' | 'degraded' {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready' || s === 'ok') return 'healthy'
  return 'degraded'
}
