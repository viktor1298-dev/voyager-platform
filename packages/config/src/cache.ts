/** Cache TTL constants used across the API */

export const CACHE_TTL = {
  /** K8s resource queries (pods, services, namespaces) — seconds */
  K8S_RESOURCES_SEC: 30,
  /** Cluster client pool entry lifetime — ms */
  CLUSTER_CLIENT_MS: 5 * 60 * 1000,
  /** Maximum token TTL (GKE/AKS) — ms */
  TOKEN_MAX_TTL_MS: 60 * 60 * 1000,
  /** Minimum token TTL (EKS) — ms */
  TOKEN_MIN_TTL_MS: 15 * 60 * 1000,
  /** Karpenter cache — ms */
  KARPENTER_MS: 60_000,
  /** SSO provider config cache — ms */
  SSO_PROVIDER_MS: 60_000,
  /** Presence tracking — ms */
  PRESENCE_MS: 60_000,
} as const
