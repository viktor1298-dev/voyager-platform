# Voyager Platform 🚀

Unified Kubernetes operations platform — monitor cluster health, track deployments, view events, and manage alerts from a single dashboard.

## Features

- **Cluster Dashboard** — Real-time health status, resource utilization, and node metrics
- **Deployment Management** — List, scale, and restart deployments across namespaces
- **Event Stream** — Kubernetes events with filtering and search
- **Alert System** — Create and manage alerts with configurable thresholds
- **Node Monitoring** — CPU, memory, and pod capacity per node
- **Log Viewer** — Stream container logs with namespace/pod filtering
- **Auth** — JWT-based authentication with admin role support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | pnpm workspaces + Turborepo |
| **Frontend** | Next.js 16 + React 19 + shadcn/ui + Tailwind CSS + Recharts |
| **Backend** | Fastify 5 + tRPC 11 + TypeScript |
| **Database** | PostgreSQL 17 + TimescaleDB + Drizzle ORM |
| **Cache/Queue** | Redis 7 + BullMQ 5 |
| **Infrastructure** | Docker + Kubernetes + Helm + Ingress NGINX |
| **CI/CD** | GitHub Actions |
| **Linter** | Biome |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker
- Minikube (for local K8s)

### Development Setup

```bash
# Clone the repo
git clone git@github.com:viktor1298-dev/voyager-platform.git
cd voyager-platform

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the API server (development)
pnpm --filter @voyager/api dev

# Start the web app (development)
pnpm --filter @voyager/web dev
```

### Environment Variables

Create `.env` files in `apps/api/` and `apps/web/` as needed:

**API (`apps/api/.env`)**:
```
PORT=4000
JWT_SECRET=your-secret
ADMIN_PASSWORD=your-admin-password
DATABASE_URL=postgresql://user:pass@localhost:5432/voyager
REDIS_URL=redis://localhost:6379
```

**Web (`apps/web/.env.local`)**:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Architecture

```
voyager-platform/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # Fastify + tRPC backend
├── packages/
│   ├── db/               # Drizzle ORM schemas & migrations
│   ├── ui/               # Shared UI components (shadcn)
│   ├── config/           # Shared configs (tsconfig, biome)
│   └── types/            # Shared TypeScript types
├── charts/
│   └── voyager/          # Helm chart for K8s deployment
├── docker/
│   ├── Dockerfile.api    # API multi-stage build
│   └── Dockerfile.web    # Web multi-stage build
└── .github/
    └── workflows/        # CI/CD pipelines
```

### Data Flow

```
Browser → Next.js (SSR/CSR) → tRPC Client
                                    ↓
                              tRPC Server (Fastify)
                              ↙        ↘
                     PostgreSQL      Kubernetes API
                     (Drizzle)       (@kubernetes/client-node)
                         ↑
                      Redis (cache)
```

## API Endpoints

All API endpoints are exposed via tRPC at `/trpc/*`. See [docs/API.md](docs/API.md) for full documentation.

| Router | Key Procedures | Auth |
|--------|---------------|------|
| `auth` | `login`, `me` | Public / Protected |
| `clusters` | `list`, `get`, `live`, `liveNodes` | Public |
| `nodes` | `list`, `get` | Public |
| `deployments` | `list`, `scale`, `restart` | Public / Protected |
| `events` | `list`, `dismiss` | Public / Protected |
| `alerts` | `list`, `create`, `update`, `delete` | Public / Protected |
| `health` | `status`, `check`, `update` | Public / Protected |
| `logs` | `stream`, `list` | Public |

## Deployment

### Docker (Local)

```bash
# Build images
docker build -f docker/Dockerfile.api -t voyager-api:dev .
docker build -f docker/Dockerfile.web -t voyager-web:dev .
```

### Minikube

```bash
# Build into minikube's Docker daemon
eval $(minikube docker-env)
docker build -f docker/Dockerfile.api -t voyager-api:dev .
docker build -f docker/Dockerfile.web -t voyager-web:dev .

# Deploy with Helm
helm upgrade --install voyager ./charts/voyager \
  -f charts/voyager/values-dev.yaml \
  --namespace voyager --create-namespace

# Verify
kubectl get pods -n voyager
```

### CI/CD

- **CI** (`ci.yml`) — Runs on push to `main` and `feat/*` branches. Lints, builds, and tests. Docker build verification on `main`.
- **Release** (`release.yml`) — Manual dispatch with a release tag for production builds.

## License

Private — All rights reserved.
