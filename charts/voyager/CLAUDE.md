# charts/voyager — Helm Chart

Helm chart for deploying Voyager Platform to Kubernetes.

## Structure

```
charts/voyager/
├── Chart.yaml                    # Chart metadata
├── values.yaml                   # Default values
├── values-dev.yaml               # Dev environment overrides
├── values-production.yaml        # Production overrides
├── values-local.example.yaml     # Template for local secrets (gitignored after copy)
├── sql/
│   └── init.sql                  # 🔴 DB schema source of truth (NOT Drizzle files)
└── templates/                    # K8s manifests (deployments, services, configmaps, etc.)
```

## Deploy Pattern

**Always `helm uninstall` + `helm install`** — NEVER `helm upgrade`. Fresh install every time. This is Iron Rule #3.

```bash
helm uninstall voyager -n voyager
helm install voyager ./charts/voyager -n voyager -f charts/voyager/values-local.yaml
```

Bundle verify after every deploy before running E2E tests.

## Local Secrets

```bash
cp charts/voyager/values-local.example.yaml charts/voyager/values-local.yaml
# Edit values-local.yaml with your secrets (gitignored)
```

## init.sql — Schema Source of Truth

`sql/init.sql` is the **authoritative database schema**. It runs:
- In production: via Helm ConfigMap mounted as init script
- Locally: via docker-compose mount into `/docker-entrypoint-initdb.d/`

The file is fully idempotent (CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING). The Drizzle ORM schema in `packages/db/` mirrors this file for TypeScript types but is NOT the source of truth.

**NEVER add `migrate()` or schema init to `server.ts`** — this is Iron Rule #1.
