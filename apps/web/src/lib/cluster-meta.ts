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
    color: 'rgb(180 120 130)',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-200 border-rose-200 dark:border-rose-800/40',
  },
  staging: {
    label: 'Staging / QA',
    sectionLabel: 'Staging / QA',
    color: 'rgb(180 160 100)',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800/40',
  },
  dev: {
    label: 'Dev / Minikube',
    sectionLabel: 'Dev / Minikube',
    color: 'rgb(120 140 200)',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800/40',
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
