---
name: deploy-local
description: Deploy voyager-platform to local minikube — fresh Helm install with seed verification and E2E readiness check. Use when deploying locally or after chart/image changes.
disable-model-invocation: true
---

# Local Deploy Workflow

Deploy voyager-platform to local minikube following the project's iron rules: fresh install every time, seed after empty DB, verify before E2E.

## Prerequisites Check

Before deploying, verify:
1. minikube is running: `minikube status`
2. Docker images are built: `docker images | grep voyager`
3. Helm values exist: check `charts/voyager/values-local.yaml` exists (copy from `values-local.example.yaml` if missing)
4. kubectl context is minikube: `kubectl config current-context`

## Deploy Steps

### Step 1: Clean Previous Installation
```bash
helm uninstall voyager -n voyager 2>/dev/null || true
kubectl delete namespace voyager --wait=true 2>/dev/null || true
kubectl create namespace voyager 2>/dev/null || true
```

**IRON RULE: NEVER use `helm upgrade`. Always fresh install.**

### Step 2: Install
```bash
helm install voyager charts/voyager/ \
  -n voyager \
  -f charts/voyager/values.yaml \
  -f charts/voyager/values-local.yaml \
  --wait --timeout 5m
```

### Step 3: Wait for Pods
```bash
kubectl -n voyager wait --for=condition=ready pod --all --timeout=300s
```

Check all pods are Running:
```bash
kubectl -n voyager get pods
```

### Step 4: Check Database State
```bash
kubectl exec -n voyager deploy/postgres -- psql -U voyager -d voyager -c "SELECT count(*) FROM users;"
```

If count is 0 (empty DB after fresh install), seed is required:
```bash
# Port-forward to postgres
kubectl port-forward -n voyager svc/postgres 5432:5432 &
PF_PID=$!

# Run seed
pnpm db:seed
pnpm --filter api seed:admin

# Cleanup port-forward
kill $PF_PID
```

### Step 5: Verify Bundle
```bash
# Check API health
kubectl exec -n voyager deploy/api -- curl -s http://localhost:4000/health | jq .

# Check web is serving
kubectl exec -n voyager deploy/web -- curl -s http://localhost:3000 | head -5
```

### Step 6: E2E Readiness
Report the deploy status and remind:
- BASE_URL must be set to `http://voyager-platform.voyagerlabs.co`
- Run E2E with: `BASE_URL=http://voyager-platform.voyagerlabs.co pnpm test:e2e`
- E2E gate: 0 failures required

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Pods in CrashLoopBackOff | Check logs: `kubectl -n voyager logs deploy/<name>` |
| DB connection refused | Check postgres pod is ready, verify DATABASE_URL in configmap |
| Redis connection refused | Check redis pod is ready |
| Web 502 | API might not be ready yet — wait and retry |
| "relation does not exist" | init.sql didn't run — check postgres init container logs |
