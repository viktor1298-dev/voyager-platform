import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

<<<<<<< HEAD
function mapSelector(selector: k8s.V1LabelSelector | undefined): Record<string, string> | null {
  if (!selector?.matchLabels) return null
  return (selector.matchLabels as Record<string, string>) ?? null
}

function mapPeer(peer: k8s.V1NetworkPolicyPeer): {
  podSelector: Record<string, string> | null
  namespaceSelector: Record<string, string> | null
  ipBlock: { cidr: string; except?: string[] } | null
} {
  return {
    podSelector: mapSelector(peer.podSelector),
    namespaceSelector: mapSelector(peer.namespaceSelector),
    ipBlock: peer.ipBlock ? { cidr: peer.ipBlock.cidr ?? '', except: peer.ipBlock.except } : null,
  }
}

function mapPorts(
  ports: k8s.V1NetworkPolicyPort[] | undefined,
): { port: string | number; protocol: string }[] {
  return (ports ?? []).map((p) => ({
    port: p.port ?? '',
    protocol: p.protocol ?? 'TCP',
  }))
}

=======
>>>>>>> worktree-agent-ac39d609
export const networkPoliciesRouter = router({
  list: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
<<<<<<< HEAD
        const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api)

        const response = await cached(CACHE_KEYS.k8sNetworkPolicies(input.clusterId), 15_000, () =>
          networkingApi.listNetworkPolicyForAllNamespaces(),
        )

        return response.items.map((np) => {
          const ingressRules = (np.spec?.ingress ?? []).map((rule) => ({
            from: (
              ((rule as Record<string, unknown>).from as Array<Record<string, unknown>>) ?? []
            ).map(mapPeer),
            ports: mapPorts(rule.ports),
          }))

          const egressRules = (np.spec?.egress ?? []).map((rule) => ({
            to: (rule.to ?? []).map(mapPeer),
            ports: mapPorts(rule.ports),
          }))

          return {
            name: np.metadata?.name ?? '',
            namespace: np.metadata?.namespace ?? '',
            podSelector: mapSelector(np.spec?.podSelector) ?? {},
            policyTypes: np.spec?.policyTypes ?? [],
            ingressRules,
            egressRules,
            createdAt: np.metadata?.creationTimestamp
              ? new Date(np.metadata.creationTimestamp as unknown as string).toISOString()
              : null,
            labels: (np.metadata?.labels as Record<string, string>) ?? {},
          }
        })
=======
        const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api)
        const response = await cached(CACHE_KEYS.k8sNetworkPolicies(input.clusterId), 15_000, () =>
          networkingV1.listNetworkPolicyForAllNamespaces(),
        )

        return (response.items ?? []).map((np) => ({
          name: np.metadata?.name ?? '',
          namespace: np.metadata?.namespace ?? '',
          createdAt: np.metadata?.creationTimestamp
            ? new Date(np.metadata.creationTimestamp as unknown as string).toISOString()
            : null,
          podSelector: (np.spec?.podSelector?.matchLabels as Record<string, string>) ?? {},
          policyTypes: np.spec?.policyTypes ?? [],
          ingressRules: (np.spec?.ingress ?? []).map((rule) => ({
            from: (rule._from ?? []).map((peer) => ({
              podSelector: (peer.podSelector?.matchLabels as Record<string, string>) ?? null,
              namespaceSelector:
                (peer.namespaceSelector?.matchLabels as Record<string, string>) ?? null,
              ipBlock: peer.ipBlock
                ? { cidr: peer.ipBlock.cidr, except: peer.ipBlock.except ?? [] }
                : null,
            })),
            ports: (rule.ports ?? []).map((p) => ({
              protocol: p.protocol ?? 'TCP',
              port: p.port != null ? String(p.port) : null,
            })),
          })),
          egressRules: (np.spec?.egress ?? []).map((rule) => ({
            to: (rule.to ?? []).map((peer) => ({
              podSelector: (peer.podSelector?.matchLabels as Record<string, string>) ?? null,
              namespaceSelector:
                (peer.namespaceSelector?.matchLabels as Record<string, string>) ?? null,
              ipBlock: peer.ipBlock
                ? { cidr: peer.ipBlock.cidr, except: peer.ipBlock.except ?? [] }
                : null,
            })),
            ports: (rule.ports ?? []).map((p) => ({
              protocol: p.protocol ?? 'TCP',
              port: p.port != null ? String(p.port) : null,
            })),
          })),
          labels: (np.metadata?.labels as Record<string, string>) ?? {},
        }))
>>>>>>> worktree-agent-ac39d609
      } catch (err) {
        handleK8sError(err, 'list network policies')
      }
    }),
})
