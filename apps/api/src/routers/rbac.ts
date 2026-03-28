import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

/** Map K8s policy rule verbs to CRUD operations */
function extractVerbs(rules: k8s.V1PolicyRule[]): Map<string, Set<string>> {
  const resourceVerbMap = new Map<string, Set<string>>()

  for (const rule of rules) {
    const resources = rule.resources ?? []
    const verbs = rule.verbs ?? []

    for (const resource of resources) {
      if (!resourceVerbMap.has(resource)) {
        resourceVerbMap.set(resource, new Set())
      }
      const verbSet = resourceVerbMap.get(resource)!
      for (const verb of verbs) {
        if (verb === '*') {
          verbSet.add('get')
          verbSet.add('list')
          verbSet.add('create')
          verbSet.add('update')
          verbSet.add('patch')
          verbSet.add('delete')
          verbSet.add('watch')
        } else {
          verbSet.add(verb)
        }
      }
    }

    // Handle wildcard resources
    if (resources.includes('*')) {
      for (const verb of verbs) {
        if (!resourceVerbMap.has('*')) {
          resourceVerbMap.set('*', new Set())
        }
        resourceVerbMap.get('*')!.add(verb === '*' ? 'get' : verb)
        if (verb === '*') {
          const set = resourceVerbMap.get('*')!
          set.add('list')
          set.add('create')
          set.add('update')
          set.add('patch')
          set.add('delete')
          set.add('watch')
        }
      }
    }
  }

  return resourceVerbMap
}

/** Build a role rules lookup from ClusterRoles and Roles */
function buildRoleRulesMap(
  clusterRoles: k8s.V1ClusterRole[],
  roles: k8s.V1Role[],
): Map<string, k8s.V1PolicyRule[]> {
  const map = new Map<string, k8s.V1PolicyRule[]>()
  for (const cr of clusterRoles) {
    const name = cr.metadata?.name
    if (name) map.set(`clusterrole:${name}`, cr.rules ?? [])
  }
  for (const r of roles) {
    const name = r.metadata?.name
    const ns = r.metadata?.namespace
    if (name) map.set(`role:${ns}/${name}`, r.rules ?? [])
  }
  return map
}

/** Extract subjects from a binding */
function getSubjects(
  binding: k8s.V1ClusterRoleBinding | k8s.V1RoleBinding,
): { kind: string; name: string; namespace?: string }[] {
  return (binding.subjects ?? []).map((s) => ({
    kind: s.kind ?? 'User',
    name: s.name ?? '',
    namespace: s.namespace,
  }))
}

export const rbacRouter = router({
  matrix: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        namespace: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api)

        const [clusterRoles, clusterRoleBindings, roles, roleBindings] = await cached(
          CACHE_KEYS.k8sRbac(input.clusterId),
          60_000,
          () =>
            Promise.all([
              rbacApi.listClusterRole(),
              rbacApi.listClusterRoleBinding(),
              rbacApi.listRoleForAllNamespaces(),
              rbacApi.listRoleBindingForAllNamespaces(),
            ]),
        )

        const roleRulesMap = buildRoleRulesMap(clusterRoles.items, roles.items)

        // Build subject -> resource -> verbs mapping
        const matrix: Record<string, Record<string, string[]>> = {}
        const allResources = new Set<string>()

        function processBinding(
          binding: k8s.V1ClusterRoleBinding | k8s.V1RoleBinding,
          bindingNamespace?: string,
        ) {
          const roleRef = binding.roleRef
          if (!roleRef?.name) return

          // Filter by namespace if specified
          if (input.namespace && bindingNamespace && bindingNamespace !== input.namespace) return

          const roleKey =
            roleRef.kind === 'ClusterRole'
              ? `clusterrole:${roleRef.name}`
              : `role:${bindingNamespace}/${roleRef.name}`

          const rules = roleRulesMap.get(roleKey) ?? []
          const verbMap = extractVerbs(rules)

          const subjects = getSubjects(binding)
          for (const subject of subjects) {
            // Filter out system:* subjects by default
            if (subject.name.startsWith('system:')) continue

            const subjectKey =
              subject.kind === 'ServiceAccount'
                ? `${subject.kind}:${subject.namespace ?? 'default'}/${subject.name}`
                : `${subject.kind}:${subject.name}`

            if (!matrix[subjectKey]) matrix[subjectKey] = {}

            for (const [resource, verbs] of verbMap) {
              allResources.add(resource)
              if (!matrix[subjectKey][resource]) {
                matrix[subjectKey][resource] = []
              }
              const existing = new Set(matrix[subjectKey][resource])
              for (const v of verbs) existing.add(v)
              matrix[subjectKey][resource] = Array.from(existing)
            }
          }
        }

        for (const crb of clusterRoleBindings.items) {
          processBinding(crb)
        }
        for (const rb of roleBindings.items) {
          processBinding(rb, rb.metadata?.namespace)
        }

        const subjects = Object.keys(matrix).sort()
        const resources = Array.from(allResources).sort()

        return { subjects, resources, matrix }
      } catch (err) {
        handleK8sError(err, 'list RBAC')
      }
    }),

  bindingDetail: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        subject: z.string(),
        resource: z.string(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api)

        const [clusterRoles, clusterRoleBindings, roles, roleBindings] = await cached(
          CACHE_KEYS.k8sRbac(input.clusterId),
          60_000,
          () =>
            Promise.all([
              rbacApi.listClusterRole(),
              rbacApi.listClusterRoleBinding(),
              rbacApi.listRoleForAllNamespaces(),
              rbacApi.listRoleBindingForAllNamespaces(),
            ]),
        )

        const roleRulesMap = buildRoleRulesMap(clusterRoles.items, roles.items)
        const bindings: {
          roleName: string
          bindingName: string
          namespace?: string
          verbs: string[]
        }[] = []

        function checkBinding(
          binding: k8s.V1ClusterRoleBinding | k8s.V1RoleBinding,
          bindingNamespace?: string,
        ) {
          const roleRef = binding.roleRef
          if (!roleRef?.name) return

          const subjects = getSubjects(binding)
          const matchesSubject = subjects.some((s) => {
            const subjectKey =
              s.kind === 'ServiceAccount'
                ? `${s.kind}:${s.namespace ?? 'default'}/${s.name}`
                : `${s.kind}:${s.name}`
            return subjectKey === input.subject
          })

          if (!matchesSubject) return

          const roleKey =
            roleRef.kind === 'ClusterRole'
              ? `clusterrole:${roleRef.name}`
              : `role:${bindingNamespace}/${roleRef.name}`

          const rules = roleRulesMap.get(roleKey) ?? []
          const verbMap = extractVerbs(rules)
          const verbs = verbMap.get(input.resource) ?? verbMap.get('*')

          if (verbs && verbs.size > 0) {
            bindings.push({
              roleName: roleRef.name,
              bindingName: binding.metadata?.name ?? '',
              namespace: bindingNamespace,
              verbs: Array.from(verbs),
            })
          }
        }

        for (const crb of clusterRoleBindings.items) {
          checkBinding(crb)
        }
        for (const rb of roleBindings.items) {
          checkBinding(rb, rb.metadata?.namespace)
        }

        return { bindings }
      } catch (err) {
        handleK8sError(err, 'get RBAC binding detail')
      }
    }),
})
