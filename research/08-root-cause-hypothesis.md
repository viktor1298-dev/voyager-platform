# 08 - Root Cause: CONFIRMED

## 🏆 ROOT CAUSE: connectionConfig stored as empty `{}` — kubeconfig never saved

### Evidence:
1. DB `connection_config` = `{"__encrypted": "7977fdd3a..."}` 
2. Decrypting with the pod's `CLUSTER_CRED_ENCRYPTION_KEY` returns: **`{}`** (empty object)
3. The cluster was created without passing `connectionConfig` in the request body
4. In `routers/clusters.ts` create mutation: `connectionConfig: encryptConnectionConfig(input.connectionConfig ?? {})` — defaults to `{}`
5. When health-sync or live endpoints try to use this cluster:
   - `ClusterClientPool.getClient()` decrypts → gets `{}`
   - `createKubeConfigForCluster('kubeconfig', {})` → `kubeconfigConnectionConfigSchema.parse({})` 
   - Zod fails: `kubeconfig` field (required string) is undefined → **"expected string, received undefined"**
6. health-sync catches error → sets `status: 'unreachable'`, `nodes_count: 0`

### The fix:
**Update the cluster with actual kubeconfig content:**
```bash
# Get the kubeconfig
KUBECONFIG_CONTENT=$(cat ~/.kube/config | base64 -w0)
# Or use the tRPC update endpoint to set connectionConfig with the kubeconfig YAML
```

Specifically, call `clusters.update` with:
```json
{
  "id": "ad817d2f-df42-4c92-be83-3bfa2e092b0d",
  "connectionConfig": {
    "kubeconfig": "<full kubeconfig YAML string>"
  },
  "endpoint": "https://192.168.49.2:8443"
}
```

### Secondary issue: endpoint is wrong
- Stored: `https://kubernetes.default.svc` (in-cluster DNS)
- Should be: `https://192.168.49.2:8443` (or whatever's in kubeconfig)
- This is cosmetic but confusing

### Tertiary issue: alert-evaluator uses string name 'test-cluster' instead of UUID
- Causes separate DB error: `invalid input syntax for type uuid: "test-cluster"`

### Prevention:
1. Make `connectionConfig` required (not optional) in create mutation for `kubeconfig` provider
2. Add validation: if provider=kubeconfig, connectionConfig MUST have kubeconfig field
3. The `providerConnectionInputSchema` discriminated union exists but is only checked IF connectionConfig is provided — the `undefined` case bypasses it
