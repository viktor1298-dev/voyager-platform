# Voyager Platform — Database Schema Design

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Author:** Atlas — Database Architecture  
> **Status:** Ready for implementation  
> **Stack:** PostgreSQL 16 + TimescaleDB 2.x + OpenSearch 2.x + Redis 7.x  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [PostgreSQL Schema — Core Data](#2-postgresql-schema--core-data)
3. [TimescaleDB Hypertables — Time-Series](#3-timescaledb-hypertables--time-series)
4. [OpenSearch Index Mappings — Logs & Search](#4-opensearch-index-mappings--logs--search)
5. [Redis Data Structures](#5-redis-data-structures)
6. [Migration Strategy](#6-migration-strategy)
7. [Query Patterns — Top 20 Operations](#7-query-patterns--top-20-operations)
8. [Performance Considerations](#8-performance-considerations)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER OVERVIEW                           │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   PostgreSQL 16  │  │   TimescaleDB    │  │   OpenSearch     │   │
│  │   + RLS          │  │   (extension)    │  │   2.x            │   │
│  │                  │  │                  │  │                  │   │
│  │  • Organizations │  │  • node_metrics  │  │  • container     │   │
│  │  • Teams/Users   │  │  • pod_metrics   │  │    logs          │   │
│  │  • Clusters      │  │  • container_    │  │  • k8s_events    │   │
│  │  • Nodes         │  │    metrics       │  │  • security_     │   │
│  │  • Namespaces    │  │  • network_      │  │    events        │   │
│  │  • Workloads     │  │    metrics       │  │                  │   │
│  │  • Pods          │  │  • resource_     │  │  ILM policies    │   │
│  │  • Containers    │  │    costs         │  │  for retention   │   │
│  │  • Events        │  │  • namespace_    │  │                  │   │
│  │  • Alerts/Rules  │  │    costs         │  └──────────────────┘   │
│  │  • RBAC          │  │  • cluster_costs │                         │
│  │  • Registrations │  │  • security_     │  ┌──────────────────┐   │
│  │                  │  │    events        │  │   Redis 7.x      │   │
│  │  Row-Level       │  │  • vuln_scans    │  │                  │   │
│  │  Security (RLS)  │  │  • runtime_      │  │  • Metrics cache │   │
│  │  for multi-      │  │    alerts        │  │  • WS subs       │   │
│  │  tenant          │  │                  │  │  • Rate limits   │   │
│  │  isolation       │  │  Continuous      │  │  • Sessions      │   │
│  │                  │  │  aggregates +    │  │  • Pub/Sub       │   │
│  │                  │  │  compression +   │  │                  │   │
│  │                  │  │  retention       │  └──────────────────┘   │
│  └─────────────────┘  └──────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Multi-tenant from day one** — Every core table has `org_id`; PostgreSQL RLS enforces isolation at the database level so application bugs cannot leak data.
2. **Time-series separated from relational** — TimescaleDB hypertables for metrics/costs/security events; PostgreSQL for entity state and configuration.
3. **UUIDs everywhere** — All primary keys are `uuid` (v7 where possible for sortability). No sequential IDs to leak information or create hotspots.
4. **Soft deletes** — Critical entities use `deleted_at` timestamps instead of `DELETE`. Supports audit trails and accidental deletion recovery.
5. **Audit columns on everything** — `created_at`, `updated_at` on every table. `created_by` where applicable.
6. **JSONB for extensibility** — K8s labels, annotations, and provider-specific metadata stored as JSONB. Indexed with GIN for fast lookups.
7. **Consistent naming** — `snake_case` everywhere. Foreign keys named `{referenced_table_singular}_id`. Indexes named `idx_{table}_{columns}`.

---

## 2. PostgreSQL Schema — Core Data

### 2.1 Extensions & Setup

```sql
-- =============================================================================
-- MIGRATION 001: Extensions and base setup
-- =============================================================================

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation (fallback)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Trigram text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";       -- GIN index support for scalars
CREATE EXTENSION IF NOT EXISTS "timescaledb";     -- Time-series extension

-- Custom enum types used across the schema
CREATE TYPE cluster_provider AS ENUM (
    'aws_eks', 'azure_aks', 'gcp_gke', 'self_managed', 'k3s', 'kind', 'minikube', 'other'
);

CREATE TYPE cluster_status AS ENUM (
    'healthy', 'warning', 'critical', 'unreachable', 'provisioning', 'decommissioning'
);

CREATE TYPE node_status AS ENUM (
    'ready', 'not_ready', 'scheduling_disabled', 'unknown'
);

CREATE TYPE pod_phase AS ENUM (
    'pending', 'running', 'succeeded', 'failed', 'unknown'
);

CREATE TYPE workload_kind AS ENUM (
    'deployment', 'statefulset', 'daemonset', 'job', 'cronjob', 'replicaset'
);

CREATE TYPE container_state AS ENUM (
    'waiting', 'running', 'terminated'
);

CREATE TYPE alert_severity AS ENUM (
    'info', 'warning', 'critical', 'emergency'
);

CREATE TYPE alert_state AS ENUM (
    'pending', 'firing', 'resolved', 'silenced', 'acknowledged'
);

CREATE TYPE alert_domain AS ENUM (
    'ops', 'cost', 'security'
);

CREATE TYPE event_type AS ENUM (
    'normal', 'warning', 'error'
);

CREATE TYPE event_reason AS ENUM (
    -- Pod lifecycle
    'scheduled', 'pulled', 'created', 'started', 'killing', 'preempting',
    'back_off', 'exceeded_grace_period', 'failed_scheduling',
    -- Container issues
    'oom_killed', 'crash_loop_back_off', 'image_pull_error',
    'container_creating', 'container_started',
    -- Node events
    'node_not_ready', 'node_ready', 'node_allocatable_enforced',
    'starting', 'rebooted',
    -- Scaling
    'scaled_up', 'scaled_down', 'successful_rescale',
    -- Deployment
    'deployment_updated', 'rollback',
    -- Other
    'unhealthy', 'failed_mount', 'failed_attach_volume',
    'successful_create', 'successful_delete', 'other'
);

CREATE TYPE invitation_status AS ENUM (
    'pending', 'accepted', 'expired', 'revoked'
);

CREATE TYPE registration_status AS ENUM (
    'pending', 'active', 'disconnected', 'revoked', 'error'
);

CREATE TYPE vulnerability_severity AS ENUM (
    'negligible', 'low', 'medium', 'high', 'critical'
);

-- Helper function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 Organizations, Teams & Users

```sql
-- =============================================================================
-- MIGRATION 002: Organizations, teams, and users
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORGANIZATIONS
-- Top-level tenant entity. All data is scoped to an organization.
-- The org_id column on every table + RLS policies ensure strict data isolation.
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,               -- Display name
    slug            VARCHAR(100) NOT NULL UNIQUE,         -- URL-safe identifier (e.g., "acme-corp")
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',  -- free | team | pro | enterprise
    max_nodes       INTEGER NOT NULL DEFAULT 5,           -- Node limit for current plan
    max_clusters    INTEGER NOT NULL DEFAULT 1,           -- Cluster limit for current plan
    max_users       INTEGER NOT NULL DEFAULT 3,           -- User limit for current plan
    retention_days  INTEGER NOT NULL DEFAULT 7,           -- Data retention based on plan
    settings        JSONB NOT NULL DEFAULT '{}',          -- Org-wide settings (timezone, notifications, etc.)
    billing_email   VARCHAR(255),                         -- Billing contact email
    stripe_customer_id VARCHAR(255),                      -- Stripe customer ID for billing
    trial_ends_at   TIMESTAMPTZ,                          -- Trial expiration (NULL = no trial)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                           -- Soft delete
);

CREATE INDEX idx_organizations_slug ON organizations (slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_plan ON organizations (plan) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organizations IS 'Top-level tenant entity. All platform data is scoped to an organization. Multi-tenant isolation via RLS.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier, used in URLs and API paths.';
COMMENT ON COLUMN organizations.retention_days IS 'How long time-series data is retained. Determined by plan tier.';

-- -----------------------------------------------------------------------------
-- USERS
-- Platform users. A user can belong to multiple organizations via team_members.
-- Auth is handled externally (Clerk) — this stores profile & platform-specific data.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id     VARCHAR(255) UNIQUE,                  -- Clerk/Auth provider user ID
    email           VARCHAR(255) NOT NULL UNIQUE,          -- Primary email
    full_name       VARCHAR(255),                          -- Display name
    avatar_url      TEXT,                                  -- Profile picture URL
    timezone        VARCHAR(100) DEFAULT 'UTC',            -- User timezone preference
    preferences     JSONB NOT NULL DEFAULT '{}',           -- UI preferences (theme, default cluster, etc.)
    last_login_at   TIMESTAMPTZ,                           -- Last login timestamp
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,        -- Email verification status
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,      -- Voyager platform superadmin (not tenant admin)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                            -- Soft delete
);

CREATE INDEX idx_users_external_id ON users (external_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Platform user accounts. Auth handled by Clerk; this stores profile and preferences.';
COMMENT ON COLUMN users.external_id IS 'Maps to the auth provider (Clerk) user ID for SSO integration.';
COMMENT ON COLUMN users.is_platform_admin IS 'Voyager superadmin flag. NOT org-level admin — that is handled via RBAC roles.';

-- -----------------------------------------------------------------------------
-- TEAMS
-- Organizational unit within an org. Users belong to teams, which can be assigned
-- permissions on clusters/namespaces. Maps to real-world team structures.
-- -----------------------------------------------------------------------------
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,                -- Team name (e.g., "Platform Engineering")
    slug            VARCHAR(100) NOT NULL,                -- URL-safe name within the org
    description     TEXT,                                  -- What this team does
    color           VARCHAR(7),                            -- Hex color for UI (e.g., "#3B82F6")
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(org_id, slug)
);

CREATE INDEX idx_teams_org_id ON teams (org_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE teams IS 'Organizational grouping of users within an org. Teams map to real-world teams (SRE, backend, etc.) and can be assigned cluster/namespace permissions.';

-- -----------------------------------------------------------------------------
-- TEAM_MEMBERS
-- Join table: users <-> teams (many-to-many).
-- A user can be in multiple teams within the same org.
-- -----------------------------------------------------------------------------
CREATE TABLE team_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'member', -- member | lead
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_user_id ON team_members (user_id);
CREATE INDEX idx_team_members_team_id ON team_members (team_id);

COMMENT ON TABLE team_members IS 'Maps users to teams. A user can belong to multiple teams within the same organization.';

-- -----------------------------------------------------------------------------
-- ORG_MEMBERS
-- Direct org membership. Defines what role a user has within the organization.
-- Every user who can access an org has a row here.
-- -----------------------------------------------------------------------------
CREATE TABLE org_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID,                                  -- References rbac_roles(id), nullable for default role
    is_owner        BOOLEAN NOT NULL DEFAULT FALSE,        -- Org owner (billing, destructive actions)
    invited_by      UUID REFERENCES users(id),             -- Who invited this user
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON org_members (user_id);
CREATE INDEX idx_org_members_org_id ON org_members (org_id);

COMMENT ON TABLE org_members IS 'Maps users to organizations with their role. Every user accessing an org has exactly one row here.';
COMMENT ON COLUMN org_members.is_owner IS 'Org owner has full control including billing, member management, and org deletion.';

-- -----------------------------------------------------------------------------
-- INVITATIONS
-- Pending invitations to join an organization.
-- -----------------------------------------------------------------------------
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,                 -- Invitee email
    role_id         UUID,                                  -- Role to assign on acceptance
    invited_by      UUID NOT NULL REFERENCES users(id),    -- User who sent the invite
    status          invitation_status NOT NULL DEFAULT 'pending',
    token           VARCHAR(255) NOT NULL UNIQUE,          -- Secure token for invitation link
    expires_at      TIMESTAMPTZ NOT NULL,                  -- Invitation expiration
    accepted_at     TIMESTAMPTZ,                           -- When accepted (NULL if pending)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, email, status)                          -- One pending invite per email per org
);

CREATE INDEX idx_invitations_token ON invitations (token) WHERE status = 'pending';
CREATE INDEX idx_invitations_org_id ON invitations (org_id);

COMMENT ON TABLE invitations IS 'Pending invitations to join an organization. Token is sent via email for secure acceptance.';
```

### 2.3 RBAC: Roles & Permissions

```sql
-- =============================================================================
-- MIGRATION 003: RBAC — Roles and Permissions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RBAC_ROLES
-- Defines roles within an organization. Seeded with default roles (admin, member, viewer).
-- Orgs can create custom roles.
-- -----------------------------------------------------------------------------
CREATE TABLE rbac_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = system-wide default role
    name            VARCHAR(100) NOT NULL,                -- Role name (e.g., "Admin", "Developer", "Viewer")
    slug            VARCHAR(100) NOT NULL,                -- URL-safe identifier
    description     TEXT,                                  -- What this role can do
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,        -- System roles cannot be deleted
    priority        INTEGER NOT NULL DEFAULT 0,            -- Higher = more permissions (for conflict resolution)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, slug)
);

-- Add FK from org_members now that rbac_roles exists
ALTER TABLE org_members
    ADD CONSTRAINT fk_org_members_role
    FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE SET NULL;

-- Also add FK from invitations
ALTER TABLE invitations
    ADD CONSTRAINT fk_invitations_role
    FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE SET NULL;

CREATE INDEX idx_rbac_roles_org_id ON rbac_roles (org_id);

CREATE TRIGGER trg_rbac_roles_updated_at
    BEFORE UPDATE ON rbac_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rbac_roles IS 'RBAC roles within an organization. System roles (admin, member, viewer) are pre-seeded; orgs can create custom roles.';
COMMENT ON COLUMN rbac_roles.is_system IS 'System roles are seeded at org creation and cannot be deleted.';

-- -----------------------------------------------------------------------------
-- RBAC_PERMISSIONS
-- Granular permissions assigned to roles. Defines what actions a role can perform
-- on which resource types, optionally scoped to specific clusters/namespaces.
-- -----------------------------------------------------------------------------
CREATE TABLE rbac_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
    resource        VARCHAR(100) NOT NULL,                 -- Resource type: cluster, namespace, workload, pod, alert, cost, security, settings, user, team
    action          VARCHAR(50) NOT NULL,                   -- Action: read, write, delete, admin, execute (shell)
    scope           JSONB NOT NULL DEFAULT '{}',            -- Optional scope restriction: {"cluster_ids": [...], "namespaces": [...]}
    conditions      JSONB NOT NULL DEFAULT '{}',            -- Additional conditions (e.g., {"own_resources_only": true})
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(role_id, resource, action)
);

CREATE INDEX idx_rbac_permissions_role_id ON rbac_permissions (role_id);

COMMENT ON TABLE rbac_permissions IS 'Granular permission grants for RBAC roles. Each row grants one action on one resource type.';
COMMENT ON COLUMN rbac_permissions.resource IS 'K8s or platform resource type this permission applies to.';
COMMENT ON COLUMN rbac_permissions.action IS 'What can be done: read (view), write (create/update), delete, admin (manage), execute (shell/exec).';
COMMENT ON COLUMN rbac_permissions.scope IS 'Optional restriction to specific clusters or namespaces. Empty = all resources of this type.';

-- -----------------------------------------------------------------------------
-- AUDIT_LOG
-- Immutable audit trail of all significant actions within an organization.
-- Required for compliance (SOC2, ISO 27001) and security investigations.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),              -- NULL for system-initiated actions
    action          VARCHAR(100) NOT NULL,                   -- e.g., 'cluster.created', 'user.invited', 'alert.silenced'
    resource_type   VARCHAR(100) NOT NULL,                   -- e.g., 'cluster', 'user', 'alert_rule'
    resource_id     UUID,                                    -- ID of the affected resource
    details         JSONB NOT NULL DEFAULT '{}',             -- Action-specific details (old/new values, etc.)
    ip_address      INET,                                    -- Client IP address
    user_agent      TEXT,                                     -- Client user agent
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()       -- Immutable — no updated_at
);

-- Partition audit_log by month for performance
-- (We'll use declarative partitioning — see migration for partition creation)
CREATE INDEX idx_audit_log_org_id_created ON audit_log (org_id, created_at DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_action ON audit_log (action);

COMMENT ON TABLE audit_log IS 'Immutable audit trail. Every significant action (CRUD, auth, config change) is logged here. Never deleted, only aged-out by retention policy.';
```

### 2.4 Clusters, Nodes & Registrations

```sql
-- =============================================================================
-- MIGRATION 004: Clusters, nodes, and registrations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CLUSTERS
-- Represents a Kubernetes cluster connected to Voyager.
-- One org can have many clusters. Each cluster runs a Voyager Monitor DaemonSet.
-- -----------------------------------------------------------------------------
CREATE TABLE clusters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,               -- Human-readable cluster name
    display_name        VARCHAR(255),                        -- Optional friendly name
    provider            cluster_provider NOT NULL,           -- Cloud provider / platform
    region              VARCHAR(100),                        -- Cloud region (e.g., "us-east-1", "westeurope")
    kubernetes_version  VARCHAR(50),                         -- e.g., "1.29.2"
    status              cluster_status NOT NULL DEFAULT 'provisioning',
    last_heartbeat_at   TIMESTAMPTZ,                         -- Last time Voyager Monitor reported in
    agent_version       VARCHAR(50),                         -- Voyager Monitor version running on this cluster
    api_endpoint        TEXT,                                 -- K8s API endpoint (encrypted at rest)
    node_count          INTEGER NOT NULL DEFAULT 0,          -- Cached count — updated by metrics pipeline
    pod_count           INTEGER NOT NULL DEFAULT 0,          -- Cached count
    namespace_count     INTEGER NOT NULL DEFAULT 0,          -- Cached count
    labels              JSONB NOT NULL DEFAULT '{}',         -- User-defined labels for filtering
    annotations         JSONB NOT NULL DEFAULT '{}',         -- Internal annotations
    settings            JSONB NOT NULL DEFAULT '{}',         -- Cluster-specific settings
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    UNIQUE(org_id, name)
);

CREATE INDEX idx_clusters_org_id ON clusters (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clusters_status ON clusters (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_clusters_provider ON clusters (provider) WHERE deleted_at IS NULL;
CREATE INDEX idx_clusters_labels ON clusters USING GIN (labels) WHERE deleted_at IS NULL;
CREATE INDEX idx_clusters_last_heartbeat ON clusters (last_heartbeat_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_clusters_updated_at
    BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE clusters IS 'Kubernetes clusters connected to Voyager. Each runs a Voyager Monitor DaemonSet that reports metrics, logs, events, and security data.';
COMMENT ON COLUMN clusters.last_heartbeat_at IS 'Used for health detection. If stale > 5 min, cluster status transitions to warning; > 15 min to unreachable.';
COMMENT ON COLUMN clusters.node_count IS 'Denormalized count updated by the ingestion pipeline. Avoids COUNT(*) on nodes table for overview pages.';

-- -----------------------------------------------------------------------------
-- CLUSTER_REGISTRATIONS
-- Manages the lifecycle of connecting a cluster to Voyager.
-- Contains the bootstrap token used during Helm chart installation.
-- -----------------------------------------------------------------------------
CREATE TABLE cluster_registrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id      UUID REFERENCES clusters(id) ON DELETE SET NULL, -- Set after successful registration
    name            VARCHAR(255) NOT NULL,                  -- Intended cluster name
    registration_token VARCHAR(512) NOT NULL UNIQUE,        -- One-time token used by Helm chart to register
    status          registration_status NOT NULL DEFAULT 'pending',
    agent_version   VARCHAR(50),                            -- Required minimum agent version
    helm_values     JSONB NOT NULL DEFAULT '{}',            -- Generated Helm values for installation
    error_message   TEXT,                                    -- Error details if status = 'error'
    registered_at   TIMESTAMPTZ,                            -- When agent successfully connected
    expires_at      TIMESTAMPTZ NOT NULL,                   -- Token expiration (default: 24h)
    created_by      UUID NOT NULL REFERENCES users(id),    -- User who initiated registration
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cluster_registrations_org_id ON cluster_registrations (org_id);
CREATE INDEX idx_cluster_registrations_token ON cluster_registrations (registration_token) WHERE status = 'pending';
CREATE INDEX idx_cluster_registrations_status ON cluster_registrations (status);

CREATE TRIGGER trg_cluster_registrations_updated_at
    BEFORE UPDATE ON cluster_registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE cluster_registrations IS 'Manages cluster onboarding. User creates a registration, gets a token, uses it in Helm install. Agent calls back with the token to complete registration.';

-- -----------------------------------------------------------------------------
-- NODES
-- Kubernetes nodes within a cluster. Updated by Voyager Monitor heartbeats.
-- Stores current state; historical metrics are in TimescaleDB hypertables.
-- -----------------------------------------------------------------------------
CREATE TABLE nodes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id          UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,               -- K8s node name
    uid                 VARCHAR(255),                        -- K8s UID
    status              node_status NOT NULL DEFAULT 'unknown',
    role                VARCHAR(50) DEFAULT 'worker',        -- master | worker | infra
    instance_type       VARCHAR(100),                        -- Cloud instance type (e.g., "m5.xlarge")
    availability_zone   VARCHAR(100),                        -- AZ within the region
    os_image            VARCHAR(255),                        -- Node OS (e.g., "Amazon Linux 2")
    kernel_version      VARCHAR(100),                        -- Kernel version
    container_runtime   VARCHAR(100),                        -- e.g., "containerd://1.7.2"
    kubelet_version     VARCHAR(50),                         -- Kubelet version
    -- Capacity (total allocatable resources on this node)
    cpu_capacity_millicores     INTEGER,                     -- Total CPU in millicores
    memory_capacity_bytes       BIGINT,                      -- Total memory in bytes
    pod_capacity                INTEGER,                     -- Max pods
    ephemeral_storage_bytes     BIGINT,                      -- Ephemeral storage capacity
    gpu_capacity                INTEGER DEFAULT 0,           -- GPU count (if any)
    -- Current usage (updated by metrics pipeline — snapshot, not time-series)
    cpu_usage_millicores        INTEGER,
    memory_usage_bytes          BIGINT,
    pod_count                   INTEGER DEFAULT 0,           -- Current running pods
    -- Cost metadata
    spot_instance               BOOLEAN DEFAULT FALSE,       -- Whether this is a spot/preemptible instance
    hourly_cost_usd             NUMERIC(10, 6),              -- Cost per hour for this instance type
    -- Kubernetes metadata
    labels              JSONB NOT NULL DEFAULT '{}',         -- K8s labels
    annotations         JSONB NOT NULL DEFAULT '{}',         -- K8s annotations
    taints              JSONB NOT NULL DEFAULT '[]',         -- K8s taints array
    conditions          JSONB NOT NULL DEFAULT '[]',         -- K8s node conditions
    last_heartbeat_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    UNIQUE(cluster_id, name)
);

CREATE INDEX idx_nodes_org_id ON nodes (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_cluster_id ON nodes (cluster_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_status ON nodes (cluster_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_nodes_labels ON nodes USING GIN (labels) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE nodes IS 'Current state of Kubernetes nodes. One row per node. Historical metrics stored in TimescaleDB node_metrics hypertable.';
COMMENT ON COLUMN nodes.hourly_cost_usd IS 'Cost per hour sourced from cloud pricing APIs. Used for cost allocation calculations.';
```

### 2.5 Namespaces, Workloads, Pods & Containers

```sql
-- =============================================================================
-- MIGRATION 005: Namespaces, workloads, pods, and containers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- NAMESPACES
-- Kubernetes namespaces. Primary unit for cost allocation and access control.
-- -----------------------------------------------------------------------------
CREATE TABLE namespaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,                  -- K8s namespace name
    uid             VARCHAR(255),                           -- K8s UID
    status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- active | terminating
    labels          JSONB NOT NULL DEFAULT '{}',            -- K8s labels (includes cost-allocation labels)
    annotations     JSONB NOT NULL DEFAULT '{}',            -- K8s annotations
    -- Resource quotas (if set on the namespace)
    cpu_request_quota_millicores    INTEGER,                -- ResourceQuota CPU requests
    cpu_limit_quota_millicores      INTEGER,                -- ResourceQuota CPU limits
    memory_request_quota_bytes      BIGINT,                 -- ResourceQuota memory requests
    memory_limit_quota_bytes        BIGINT,                 -- ResourceQuota memory limits
    pod_quota                       INTEGER,                -- ResourceQuota pod count
    -- Denormalized counts (updated by sync pipeline)
    workload_count  INTEGER NOT NULL DEFAULT 0,
    pod_count       INTEGER NOT NULL DEFAULT 0,
    -- Ownership / cost allocation
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,  -- Team responsible for this namespace
    cost_center     VARCHAR(100),                           -- Custom cost center code
    budget_monthly_usd NUMERIC(12, 2),                     -- Monthly budget (NULL = no budget)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE(cluster_id, name)
);

CREATE INDEX idx_namespaces_org_id ON namespaces (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_namespaces_cluster_id ON namespaces (cluster_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_namespaces_team_id ON namespaces (team_id) WHERE deleted_at IS NULL AND team_id IS NOT NULL;
CREATE INDEX idx_namespaces_labels ON namespaces USING GIN (labels) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_namespaces_updated_at
    BEFORE UPDATE ON namespaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE namespaces IS 'Kubernetes namespaces. Primary unit for cost allocation, access scoping, and team ownership.';
COMMENT ON COLUMN namespaces.budget_monthly_usd IS 'Monthly cost budget. The alert engine fires warnings at 80% and critical at 100%.';

-- -----------------------------------------------------------------------------
-- WORKLOADS
-- Kubernetes workload controllers (Deployments, StatefulSets, DaemonSets, etc.).
-- Represents the "desired state" — pods are the "actual state."
-- -----------------------------------------------------------------------------
CREATE TABLE workloads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id          UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id        UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,                -- K8s workload name
    uid                 VARCHAR(255),                         -- K8s UID
    kind                workload_kind NOT NULL,               -- deployment, statefulset, daemonset, job, cronjob
    -- Replica state
    desired_replicas    INTEGER NOT NULL DEFAULT 1,
    ready_replicas      INTEGER NOT NULL DEFAULT 0,
    available_replicas  INTEGER NOT NULL DEFAULT 0,
    -- Container spec (primary container — for quick display)
    primary_image       TEXT,                                 -- Primary container image (e.g., "nginx:1.25")
    -- Resource requests/limits (aggregate across all containers in the pod template)
    cpu_request_millicores      INTEGER,
    cpu_limit_millicores        INTEGER,
    memory_request_bytes        BIGINT,
    memory_limit_bytes          BIGINT,
    -- Deployment strategy
    strategy            VARCHAR(50),                          -- RollingUpdate | Recreate | OnDelete
    -- Metadata
    labels              JSONB NOT NULL DEFAULT '{}',
    annotations         JSONB NOT NULL DEFAULT '{}',
    selector            JSONB NOT NULL DEFAULT '{}',          -- Label selector
    -- Status
    last_deployed_at    TIMESTAMPTZ,                          -- Last rollout time
    generation          BIGINT,                               -- K8s metadata.generation
    observed_generation BIGINT,                               -- status.observedGeneration
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    UNIQUE(cluster_id, namespace_id, kind, name)
);

CREATE INDEX idx_workloads_org_id ON workloads (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workloads_cluster_id ON workloads (cluster_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workloads_namespace_id ON workloads (namespace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workloads_kind ON workloads (kind) WHERE deleted_at IS NULL;
CREATE INDEX idx_workloads_labels ON workloads USING GIN (labels) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_workloads_updated_at
    BEFORE UPDATE ON workloads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE workloads IS 'Kubernetes workload controllers. Represents the declarative desired state. Pods represent actual running instances.';

-- -----------------------------------------------------------------------------
-- PODS
-- Individual Kubernetes pods. High-churn table — pods are created and destroyed
-- frequently. Only active pods are kept; terminated pods are moved to history
-- via the retention pipeline.
-- -----------------------------------------------------------------------------
CREATE TABLE pods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id          UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id        UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    node_id             UUID REFERENCES nodes(id) ON DELETE SET NULL,  -- NULL if not yet scheduled
    workload_id         UUID REFERENCES workloads(id) ON DELETE SET NULL, -- NULL for standalone pods
    name                VARCHAR(255) NOT NULL,                -- K8s pod name
    uid                 VARCHAR(255),                         -- K8s UID (unique across time)
    phase               pod_phase NOT NULL DEFAULT 'unknown',
    status_message      TEXT,                                 -- Human-readable status detail
    reason              VARCHAR(255),                         -- Status reason (e.g., "CrashLoopBackOff")
    -- Resource requests/limits (aggregate)
    cpu_request_millicores      INTEGER,
    cpu_limit_millicores        INTEGER,
    memory_request_bytes        BIGINT,
    memory_limit_bytes          BIGINT,
    -- Current usage (snapshot — time-series in pod_metrics)
    cpu_usage_millicores        INTEGER,
    memory_usage_bytes          BIGINT,
    -- Pod metadata
    ip                  INET,                                 -- Pod IP address
    host_ip             INET,                                 -- Node IP
    qos_class           VARCHAR(50),                          -- Guaranteed | Burstable | BestEffort
    priority            INTEGER,                              -- Scheduling priority
    service_account     VARCHAR(255),                         -- Service account name
    restart_count       INTEGER NOT NULL DEFAULT 0,           -- Total restarts across all containers
    labels              JSONB NOT NULL DEFAULT '{}',
    annotations         JSONB NOT NULL DEFAULT '{}',
    -- Timestamps
    started_at          TIMESTAMPTZ,                          -- Pod start time
    finished_at         TIMESTAMPTZ,                          -- Pod completion time (for Jobs)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,

    UNIQUE(cluster_id, uid)
);

CREATE INDEX idx_pods_org_id ON pods (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pods_cluster_id ON pods (cluster_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pods_namespace_id ON pods (namespace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pods_node_id ON pods (node_id) WHERE deleted_at IS NULL AND node_id IS NOT NULL;
CREATE INDEX idx_pods_workload_id ON pods (workload_id) WHERE deleted_at IS NULL AND workload_id IS NOT NULL;
CREATE INDEX idx_pods_phase ON pods (cluster_id, phase) WHERE deleted_at IS NULL;
CREATE INDEX idx_pods_labels ON pods USING GIN (labels) WHERE deleted_at IS NULL;
CREATE INDEX idx_pods_reason ON pods (reason) WHERE deleted_at IS NULL AND reason IS NOT NULL;

CREATE TRIGGER trg_pods_updated_at
    BEFORE UPDATE ON pods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE pods IS 'Kubernetes pods — the actual running instances. High-churn: rows are created/updated/soft-deleted as pods come and go.';
COMMENT ON COLUMN pods.restart_count IS 'Aggregate restart count across all containers. Individual container restarts tracked in containers table.';

-- -----------------------------------------------------------------------------
-- CONTAINERS
-- Individual containers within pods. Multiple containers per pod (init, sidecar, app).
-- -----------------------------------------------------------------------------
CREATE TABLE containers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pod_id              UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
    cluster_id          UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,               -- Container name within the pod
    image               TEXT NOT NULL,                        -- Full image reference (registry/repo:tag@sha256:...)
    image_id            TEXT,                                 -- Resolved image ID (sha256)
    container_type      VARCHAR(20) NOT NULL DEFAULT 'app',  -- app | init | ephemeral
    state               container_state NOT NULL DEFAULT 'waiting',
    state_reason        VARCHAR(255),                        -- Reason for current state (e.g., "CrashLoopBackOff")
    state_message       TEXT,                                 -- Human-readable message
    exit_code           INTEGER,                             -- Last exit code (NULL if running)
    -- Resource requests/limits (per container)
    cpu_request_millicores      INTEGER,
    cpu_limit_millicores        INTEGER,
    memory_request_bytes        BIGINT,
    memory_limit_bytes          BIGINT,
    -- Current usage snapshot
    cpu_usage_millicores        INTEGER,
    memory_usage_bytes          BIGINT,
    -- Ports
    ports               JSONB NOT NULL DEFAULT '[]',          -- [{containerPort, protocol, name}]
    -- Environment and mounts (security-relevant)
    env_count           INTEGER DEFAULT 0,                    -- Number of env vars (not the values — security)
    mount_count         INTEGER DEFAULT 0,                    -- Number of volume mounts
    privileged          BOOLEAN DEFAULT FALSE,                -- Running in privileged mode
    read_only_root_fs   BOOLEAN DEFAULT FALSE,                -- Read-only root filesystem
    run_as_non_root     BOOLEAN,                              -- Security context
    restart_count       INTEGER NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(pod_id, name)
);

CREATE INDEX idx_containers_org_id ON containers (org_id);
CREATE INDEX idx_containers_pod_id ON containers (pod_id);
CREATE INDEX idx_containers_cluster_id ON containers (cluster_id);
CREATE INDEX idx_containers_image ON containers (image);
CREATE INDEX idx_containers_state ON containers (state);

CREATE TRIGGER trg_containers_updated_at
    BEFORE UPDATE ON containers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE containers IS 'Individual containers within pods. Tracks state, resource config, security posture, and image reference.';
COMMENT ON COLUMN containers.privileged IS 'Security flag: privileged containers have full host access. Flagged in security dashboard.';
```

### 2.6 Events & Alerts

```sql
-- =============================================================================
-- MIGRATION 006: Events, alerts, and alert rules
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EVENTS
-- Kubernetes events (Normal, Warning). The events timeline is a core debugging
-- feature in Voyager — correlating events with metrics and security data.
-- Stored in PostgreSQL for structured queries and joined with other entities.
-- Also indexed in OpenSearch for full-text search.
-- -----------------------------------------------------------------------------
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    namespace_id    UUID REFERENCES namespaces(id) ON DELETE SET NULL,
    -- Source identification
    source_component VARCHAR(255),                          -- e.g., "kubelet", "kube-scheduler"
    source_host     VARCHAR(255),                           -- Source node name
    -- Involved object
    involved_object_kind VARCHAR(100),                      -- Pod, Node, Deployment, etc.
    involved_object_name VARCHAR(255),                      -- Object name
    involved_object_uid  VARCHAR(255),                      -- Object UID
    involved_object_namespace VARCHAR(255),                 -- Object namespace
    -- Event data
    event_type      event_type NOT NULL DEFAULT 'normal',
    reason          event_reason NOT NULL DEFAULT 'other',
    message         TEXT,                                    -- Human-readable event message
    -- Deduplication
    event_count     INTEGER NOT NULL DEFAULT 1,             -- Times this event occurred
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- First occurrence
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- Most recent occurrence
    -- K8s metadata
    uid             VARCHAR(255),                           -- K8s event UID
    labels          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No updated_at — events are append-only with count updates
);

-- Partition events by month for performance (high-volume table)
-- In practice, use declarative partitioning or TimescaleDB automatic partitioning
CREATE INDEX idx_events_org_cluster ON events (org_id, cluster_id, created_at DESC);
CREATE INDEX idx_events_namespace ON events (namespace_id, created_at DESC) WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_events_involved_object ON events (involved_object_kind, involved_object_name, created_at DESC);
CREATE INDEX idx_events_reason ON events (reason, created_at DESC);
CREATE INDEX idx_events_type ON events (event_type, created_at DESC);
CREATE INDEX idx_events_last_seen ON events (last_seen_at DESC);

COMMENT ON TABLE events IS 'Kubernetes events stream. Core data for the events timeline feature. Append-heavy; partitioned by time.';
COMMENT ON COLUMN events.event_count IS 'K8s coalesces repeated events into a single event with an incremented count.';

-- -----------------------------------------------------------------------------
-- ALERT_RULES
-- Defines alerting conditions across all domains (ops, cost, security).
-- Rules are evaluated by the alert engine against metrics/events/security data.
-- -----------------------------------------------------------------------------
CREATE TABLE alert_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,                  -- Rule name (e.g., "High CPU Usage")
    description     TEXT,                                    -- What this alert means and what to do
    domain          alert_domain NOT NULL,                   -- ops | cost | security
    severity        alert_severity NOT NULL DEFAULT 'warning',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,           -- Can be toggled off without deleting
    -- Rule definition
    condition_type  VARCHAR(100) NOT NULL,                   -- threshold, anomaly, event_match, absence
    condition       JSONB NOT NULL,                          -- Rule-specific condition definition
    -- Example conditions:
    -- Threshold: {"metric": "cpu_usage_percent", "operator": ">", "value": 90, "duration": "5m"}
    -- Event match: {"reason": "oom_killed", "count_threshold": 3, "window": "1h"}
    -- Cost: {"metric": "daily_cost_usd", "operator": ">", "value": 100, "scope": "namespace"}
    -- Security: {"event_type": "shell_in_container", "severity_min": "high"}
    --
    -- Scope (what this rule applies to)
    scope           JSONB NOT NULL DEFAULT '{}',             -- {"cluster_ids": [...], "namespaces": [...], "workload_names": [...]}
    -- Notification routing
    notification_channels JSONB NOT NULL DEFAULT '[]',       -- [{"type": "slack", "webhook": "..."}, {"type": "pagerduty", "key": "..."}]
    -- Timing
    evaluation_interval_seconds INTEGER NOT NULL DEFAULT 60, -- How often to evaluate this rule
    for_duration_seconds INTEGER NOT NULL DEFAULT 0,         -- Condition must be true for this long before firing
    -- Silencing
    silence_until   TIMESTAMPTZ,                             -- Temporarily silence this rule
    silence_reason  TEXT,
    -- Metadata
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,          -- System-provided rules (can be disabled, not deleted)
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_org_id ON alert_rules (org_id);
CREATE INDEX idx_alert_rules_domain ON alert_rules (org_id, domain);
CREATE INDEX idx_alert_rules_enabled ON alert_rules (org_id, enabled) WHERE enabled = TRUE;

CREATE TRIGGER trg_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE alert_rules IS 'Alert rule definitions. The alert engine evaluates these periodically against metrics, events, and security data.';
COMMENT ON COLUMN alert_rules.condition IS 'JSONB rule definition. Schema depends on condition_type. Validated at the application layer.';
COMMENT ON COLUMN alert_rules.for_duration_seconds IS 'Prevents flapping: condition must remain true for this duration before an alert fires.';

-- -----------------------------------------------------------------------------
-- ALERTS
-- Active and historical alert instances. Created when an alert_rule fires.
-- State machine: pending → firing → (acknowledged →) resolved | silenced
-- -----------------------------------------------------------------------------
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rule_id         UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    cluster_id      UUID REFERENCES clusters(id) ON DELETE SET NULL,
    namespace_id    UUID REFERENCES namespaces(id) ON DELETE SET NULL,
    -- State
    state           alert_state NOT NULL DEFAULT 'pending',
    severity        alert_severity NOT NULL,                 -- Copied from rule at creation time (can be overridden)
    domain          alert_domain NOT NULL,                   -- Copied from rule
    -- Details
    title           VARCHAR(500) NOT NULL,                   -- Generated alert title
    message         TEXT,                                    -- Alert details / description
    fingerprint     VARCHAR(255) NOT NULL,                   -- Dedup key: hash of (rule_id + scope values)
    labels          JSONB NOT NULL DEFAULT '{}',             -- Alert labels for routing/grouping
    annotations     JSONB NOT NULL DEFAULT '{}',             -- Additional context
    -- Affected resources
    affected_resource_type VARCHAR(100),                     -- pod, node, namespace, workload, cluster
    affected_resource_id   UUID,                             -- ID of the affected resource
    affected_resource_name VARCHAR(255),                     -- Name for display
    -- Resolution
    resolved_by     UUID REFERENCES users(id),              -- User who resolved (NULL = auto-resolved)
    resolved_reason TEXT,                                    -- Resolution notes
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    -- Notification tracking
    notifications_sent JSONB NOT NULL DEFAULT '[]',          -- [{channel, sent_at, status}]
    -- Timestamps
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- When condition first became true
    fired_at        TIMESTAMPTZ,                             -- When for_duration elapsed and alert fired
    resolved_at     TIMESTAMPTZ,                             -- When condition became false
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_org_id ON alerts (org_id, created_at DESC);
CREATE INDEX idx_alerts_state ON alerts (org_id, state) WHERE state IN ('pending', 'firing');
CREATE INDEX idx_alerts_rule_id ON alerts (rule_id);
CREATE INDEX idx_alerts_cluster_id ON alerts (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_alerts_fingerprint ON alerts (fingerprint, state);
CREATE INDEX idx_alerts_severity ON alerts (org_id, severity, state);
CREATE INDEX idx_alerts_domain ON alerts (org_id, domain, state);
CREATE INDEX idx_alerts_affected_resource ON alerts (affected_resource_type, affected_resource_id);

CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE alerts IS 'Alert instances generated when alert_rules fire. Tracks full lifecycle from pending to resolved.';
COMMENT ON COLUMN alerts.fingerprint IS 'Deduplication key. Prevents creating duplicate alerts for the same condition. Hash of rule_id + affected resource.';
```

### 2.7 Row-Level Security (RLS) Policies

```sql
-- =============================================================================
-- MIGRATION 007: Row-Level Security policies for multi-tenant isolation
-- =============================================================================
-- 
-- RLS ensures that every query is automatically scoped to the user's organization.
-- Even if the application has a bug, the database will not return cross-tenant data.
--
-- Strategy:
-- 1. Application sets a session variable: SET app.current_org_id = '<uuid>';
-- 2. RLS policies filter all rows where org_id != current_org_id.
-- 3. Platform admins bypass RLS via a separate role.
--
-- The application connection pool MUST set this variable on every connection checkout.
-- =============================================================================

-- Helper function to get current org_id from session variable
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function to get current user_id from session variable
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Create application role (used by the backend service)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'voyager_app') THEN
        CREATE ROLE voyager_app LOGIN;
    END IF;
END
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO voyager_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO voyager_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO voyager_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO voyager_app;

-- =============================================================================
-- Enable RLS and create policies for every org-scoped table
-- =============================================================================

-- Macro: For each table with org_id, we enable RLS and create two policies:
-- 1. SELECT: org_id = current_org_id()
-- 2. INSERT/UPDATE/DELETE: org_id = current_org_id()

-- ORGANIZATIONS (special: users can only see orgs they belong to)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON organizations
    FOR ALL
    TO voyager_app
    USING (id = current_org_id())
    WITH CHECK (id = current_org_id());

-- TEAMS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_isolation ON teams
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- ORG_MEMBERS
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_members_isolation ON org_members
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- INVITATIONS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_isolation ON invitations
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- RBAC_ROLES
ALTER TABLE rbac_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY rbac_roles_isolation ON rbac_roles
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id() OR org_id IS NULL)  -- NULL = system roles visible to all
    WITH CHECK (org_id = current_org_id());

-- RBAC_PERMISSIONS
ALTER TABLE rbac_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rbac_permissions_isolation ON rbac_permissions
    FOR ALL
    TO voyager_app
    USING (
        role_id IN (
            SELECT id FROM rbac_roles
            WHERE org_id = current_org_id() OR org_id IS NULL
        )
    );

-- CLUSTERS
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY cluster_isolation ON clusters
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- CLUSTER_REGISTRATIONS
ALTER TABLE cluster_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cluster_reg_isolation ON cluster_registrations
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- NODES
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY node_isolation ON nodes
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- NAMESPACES
ALTER TABLE namespaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY namespace_isolation ON namespaces
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- WORKLOADS
ALTER TABLE workloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY workload_isolation ON workloads
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- PODS
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pod_isolation ON pods
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- CONTAINERS
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;
CREATE POLICY container_isolation ON containers
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- EVENTS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_isolation ON events
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- ALERT_RULES
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_rules_isolation ON alert_rules
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- ALERTS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_isolation ON alerts
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- AUDIT_LOG
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_isolation ON audit_log
    FOR ALL
    TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- USERS table does NOT have org_id — it's cross-org.
-- Access is controlled at the application layer via org_members.
-- RLS policy: users can see themselves + users in same org.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_visibility ON users
    FOR SELECT
    TO voyager_app
    USING (
        id = current_app_user_id()
        OR id IN (
            SELECT om2.user_id FROM org_members om2
            WHERE om2.org_id = current_org_id()
        )
    );
CREATE POLICY users_self_update ON users
    FOR UPDATE
    TO voyager_app
    USING (id = current_app_user_id())
    WITH CHECK (id = current_app_user_id());

-- TEAM_MEMBERS: accessible if team belongs to current org
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_isolation ON team_members
    FOR ALL
    TO voyager_app
    USING (
        team_id IN (
            SELECT id FROM teams WHERE org_id = current_org_id()
        )
    );
```

---

## 3. TimescaleDB Hypertables — Time-Series

### 3.1 Metrics Tables

```sql
-- =============================================================================
-- MIGRATION 008: TimescaleDB hypertables — Metrics
-- =============================================================================

-- -----------------------------------------------------------------------------
-- NODE_METRICS
-- Time-series data for node-level resource utilization.
-- Collected every 15 seconds by Voyager Monitor.
-- Chunk interval: 1 day (balances query performance with chunk management).
-- Retention: per org plan (7d free, 30d team, 90d pro, 365d enterprise).
-- -----------------------------------------------------------------------------
CREATE TABLE node_metrics (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    node_id                 UUID NOT NULL,
    -- CPU
    cpu_usage_millicores    INTEGER NOT NULL,              -- Current CPU usage
    cpu_capacity_millicores INTEGER NOT NULL,              -- Node CPU capacity
    cpu_usage_percent       REAL NOT NULL,                 -- cpu_usage / capacity * 100
    -- Memory
    memory_usage_bytes      BIGINT NOT NULL,               -- Current memory usage
    memory_capacity_bytes   BIGINT NOT NULL,               -- Node memory capacity
    memory_usage_percent    REAL NOT NULL,
    -- Disk
    disk_usage_bytes        BIGINT,                        -- Root filesystem usage
    disk_capacity_bytes     BIGINT,
    disk_usage_percent      REAL,
    disk_iops_read          INTEGER,                       -- Disk IOPS (read)
    disk_iops_write         INTEGER,                       -- Disk IOPS (write)
    -- Network
    network_rx_bytes        BIGINT,                        -- Bytes received (cumulative counter)
    network_tx_bytes        BIGINT,                        -- Bytes transmitted (cumulative counter)
    -- Pod counts
    pod_count               INTEGER,
    pod_capacity            INTEGER,
    -- System load
    load_avg_1m             REAL,
    load_avg_5m             REAL,
    load_avg_15m            REAL
);

SELECT create_hypertable('node_metrics', by_range('time'));

-- Space partitioning for multi-cluster scale
-- Partitions data by cluster_id so queries scoped to one cluster hit fewer chunks
SELECT add_dimension('node_metrics', by_hash('cluster_id', 4));

CREATE INDEX idx_node_metrics_org_cluster ON node_metrics (org_id, cluster_id, time DESC);
CREATE INDEX idx_node_metrics_node ON node_metrics (node_id, time DESC);

-- Enable RLS
ALTER TABLE node_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY node_metrics_isolation ON node_metrics
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE node_metrics IS 'Time-series node resource metrics. 15s resolution. Compressed after 2h, downsampled via continuous aggregates.';

-- -----------------------------------------------------------------------------
-- POD_METRICS
-- Time-series data for pod-level resource utilization.
-- Higher cardinality than node_metrics (many pods per node).
-- Chunk interval: 1 day. Compressed aggressively after 2 hours.
-- -----------------------------------------------------------------------------
CREATE TABLE pod_metrics (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID NOT NULL,
    pod_id                  UUID NOT NULL,
    workload_id             UUID,                          -- NULL for standalone pods
    -- CPU
    cpu_usage_millicores    INTEGER NOT NULL,
    cpu_request_millicores  INTEGER,                       -- Request value at this point in time
    cpu_limit_millicores    INTEGER,
    cpu_throttled_seconds   REAL,                          -- CPU throttling time (cumulative)
    -- Memory
    memory_usage_bytes      BIGINT NOT NULL,
    memory_request_bytes    BIGINT,
    memory_limit_bytes      BIGINT,
    memory_working_set_bytes BIGINT,                       -- Working set (more accurate than usage)
    -- Restart tracking
    restart_count           INTEGER NOT NULL DEFAULT 0,
    -- Status snapshot
    phase                   VARCHAR(20)                    -- Pod phase at this timestamp
);

SELECT create_hypertable('pod_metrics', by_range('time'));
SELECT add_dimension('pod_metrics', by_hash('cluster_id', 4));

CREATE INDEX idx_pod_metrics_org_cluster ON pod_metrics (org_id, cluster_id, time DESC);
CREATE INDEX idx_pod_metrics_namespace ON pod_metrics (namespace_id, time DESC);
CREATE INDEX idx_pod_metrics_pod ON pod_metrics (pod_id, time DESC);
CREATE INDEX idx_pod_metrics_workload ON pod_metrics (workload_id, time DESC) WHERE workload_id IS NOT NULL;

ALTER TABLE pod_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY pod_metrics_isolation ON pod_metrics
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE pod_metrics IS 'Time-series pod resource metrics. 15s resolution. Highest cardinality metrics table.';

-- -----------------------------------------------------------------------------
-- CONTAINER_METRICS
-- Time-series data for individual containers within pods.
-- Critical for identifying which container in a multi-container pod is the problem.
-- Chunk interval: 1 day.
-- -----------------------------------------------------------------------------
CREATE TABLE container_metrics (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    pod_id                  UUID NOT NULL,
    container_name          VARCHAR(255) NOT NULL,          -- Container name within pod
    -- CPU
    cpu_usage_millicores    INTEGER NOT NULL,
    cpu_request_millicores  INTEGER,
    cpu_limit_millicores    INTEGER,
    cpu_throttled_periods   BIGINT,                        -- Number of throttled periods
    cpu_throttled_time_ns   BIGINT,                        -- Total throttled time in nanoseconds
    -- Memory
    memory_usage_bytes      BIGINT NOT NULL,
    memory_request_bytes    BIGINT,
    memory_limit_bytes      BIGINT,
    memory_working_set_bytes BIGINT,
    memory_rss_bytes        BIGINT,                        -- Resident set size
    memory_cache_bytes      BIGINT,                        -- Page cache
    -- Filesystem
    fs_usage_bytes          BIGINT,
    fs_limit_bytes          BIGINT,
    fs_reads_total          BIGINT,                        -- Cumulative read operations
    fs_writes_total         BIGINT                         -- Cumulative write operations
);

SELECT create_hypertable('container_metrics', by_range('time'));
SELECT add_dimension('container_metrics', by_hash('cluster_id', 4));

CREATE INDEX idx_container_metrics_pod ON container_metrics (pod_id, time DESC);
CREATE INDEX idx_container_metrics_org_cluster ON container_metrics (org_id, cluster_id, time DESC);

ALTER TABLE container_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY container_metrics_isolation ON container_metrics
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE container_metrics IS 'Per-container resource metrics. Enables identification of which container in a multi-container pod is causing issues.';

-- -----------------------------------------------------------------------------
-- NETWORK_METRICS
-- Pod-level network traffic metrics. Useful for cost allocation (network egress costs)
-- and security (unusual traffic patterns).
-- Chunk interval: 1 day.
-- -----------------------------------------------------------------------------
CREATE TABLE network_metrics (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID NOT NULL,
    pod_id                  UUID NOT NULL,
    -- Traffic
    rx_bytes                BIGINT NOT NULL DEFAULT 0,     -- Received bytes (cumulative)
    tx_bytes                BIGINT NOT NULL DEFAULT 0,     -- Transmitted bytes (cumulative)
    rx_packets              BIGINT NOT NULL DEFAULT 0,     -- Received packets
    tx_packets              BIGINT NOT NULL DEFAULT 0,     -- Transmitted packets
    rx_errors               BIGINT NOT NULL DEFAULT 0,     -- Receive errors
    tx_errors               BIGINT NOT NULL DEFAULT 0,     -- Transmit errors
    rx_dropped              BIGINT NOT NULL DEFAULT 0,     -- Dropped receive packets
    tx_dropped              BIGINT NOT NULL DEFAULT 0,     -- Dropped transmit packets
    -- Connection tracking (from Voyager Monitor's network monitoring)
    active_connections      INTEGER,                       -- Current active TCP connections
    new_connections_rate    REAL,                           -- New connections per second
    -- Optional: destination breakdown (if available from eBPF)
    destination_breakdown   JSONB                          -- [{dst_ip, dst_port, proto, bytes}]
);

SELECT create_hypertable('network_metrics', by_range('time'));
SELECT add_dimension('network_metrics', by_hash('cluster_id', 4));

CREATE INDEX idx_network_metrics_org_cluster ON network_metrics (org_id, cluster_id, time DESC);
CREATE INDEX idx_network_metrics_pod ON network_metrics (pod_id, time DESC);
CREATE INDEX idx_network_metrics_namespace ON network_metrics (namespace_id, time DESC);

ALTER TABLE network_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY network_metrics_isolation ON network_metrics
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE network_metrics IS 'Pod-level network metrics. Used for cost allocation (egress costs) and security anomaly detection.';
```

### 3.2 Cost Tables

```sql
-- =============================================================================
-- MIGRATION 009: TimescaleDB hypertables — Cost data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RESOURCE_COSTS
-- Hourly cost breakdown per pod. Calculated by the cost engine using resource
-- usage from metrics + cloud pricing data.
-- This is the foundation for all cost allocation and reporting.
-- Chunk interval: 1 day.
-- -----------------------------------------------------------------------------
CREATE TABLE resource_costs (
    time                    TIMESTAMPTZ NOT NULL,           -- Hour bucket (truncated to hour)
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID NOT NULL,
    pod_id                  UUID NOT NULL,
    workload_id             UUID,
    workload_name           VARCHAR(255),                   -- Denormalized for query performance
    node_id                 UUID,
    -- Cost breakdown (USD)
    cpu_cost_usd            NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- CPU cost for this hour
    memory_cost_usd         NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- Memory cost for this hour
    storage_cost_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- Ephemeral storage cost
    network_cost_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- Network egress cost
    gpu_cost_usd            NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- GPU cost
    total_cost_usd          NUMERIC(12, 6) NOT NULL DEFAULT 0,  -- Sum of all costs
    -- Resource usage (averaged over the hour)
    avg_cpu_millicores      INTEGER,
    avg_memory_bytes        BIGINT,
    cpu_request_millicores  INTEGER,                        -- Requested (for efficiency calculation)
    memory_request_bytes    BIGINT,
    -- Efficiency metrics
    cpu_efficiency_percent  REAL,                           -- (usage / request) * 100
    memory_efficiency_percent REAL
);

SELECT create_hypertable('resource_costs', by_range('time'));
SELECT add_dimension('resource_costs', by_hash('cluster_id', 4));

CREATE INDEX idx_resource_costs_org_cluster ON resource_costs (org_id, cluster_id, time DESC);
CREATE INDEX idx_resource_costs_namespace ON resource_costs (namespace_id, time DESC);
CREATE INDEX idx_resource_costs_workload ON resource_costs (workload_id, time DESC) WHERE workload_id IS NOT NULL;

ALTER TABLE resource_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY resource_costs_isolation ON resource_costs
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE resource_costs IS 'Hourly per-pod cost data. Foundation for all cost allocation reports. Calculated by the cost engine.';

-- -----------------------------------------------------------------------------
-- NAMESPACE_COSTS
-- Pre-aggregated daily cost per namespace. Materialized from resource_costs
-- for fast dashboard queries. Also calculated as a continuous aggregate.
-- Chunk interval: 1 month.
-- -----------------------------------------------------------------------------
CREATE TABLE namespace_costs (
    time                    TIMESTAMPTZ NOT NULL,           -- Day bucket (truncated to day)
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID NOT NULL,
    namespace_name          VARCHAR(255) NOT NULL,          -- Denormalized for display
    team_id                 UUID,                           -- Owning team
    -- Daily cost breakdown
    cpu_cost_usd            NUMERIC(12, 4) NOT NULL DEFAULT 0,
    memory_cost_usd         NUMERIC(12, 4) NOT NULL DEFAULT 0,
    storage_cost_usd        NUMERIC(12, 4) NOT NULL DEFAULT 0,
    network_cost_usd        NUMERIC(12, 4) NOT NULL DEFAULT 0,
    gpu_cost_usd            NUMERIC(12, 4) NOT NULL DEFAULT 0,
    total_cost_usd          NUMERIC(12, 4) NOT NULL DEFAULT 0,
    -- Resource stats
    avg_pod_count           REAL,                           -- Average pods running
    avg_cpu_usage_millicores REAL,
    avg_memory_usage_bytes  REAL,
    avg_cpu_efficiency      REAL,                           -- Avg efficiency across all pods
    avg_memory_efficiency   REAL,
    -- Budget tracking
    budget_monthly_usd      NUMERIC(12, 2),                 -- Budget for this namespace (snapshot)
    budget_consumed_percent REAL                            -- % of monthly budget consumed so far
);

SELECT create_hypertable('namespace_costs', by_range('time', INTERVAL '30 days'));

CREATE INDEX idx_namespace_costs_org_cluster ON namespace_costs (org_id, cluster_id, time DESC);
CREATE INDEX idx_namespace_costs_namespace ON namespace_costs (namespace_id, time DESC);
CREATE INDEX idx_namespace_costs_team ON namespace_costs (team_id, time DESC) WHERE team_id IS NOT NULL;

ALTER TABLE namespace_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY namespace_costs_isolation ON namespace_costs
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE namespace_costs IS 'Daily pre-aggregated cost per namespace. Used for cost dashboard and budget tracking.';

-- -----------------------------------------------------------------------------
-- CLUSTER_COSTS
-- Pre-aggregated daily cost per cluster. Includes both K8s workload costs
-- and fixed infrastructure costs (control plane, managed service fees).
-- Chunk interval: 1 month.
-- -----------------------------------------------------------------------------
CREATE TABLE cluster_costs (
    time                    TIMESTAMPTZ NOT NULL,           -- Day bucket
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    cluster_name            VARCHAR(255) NOT NULL,          -- Denormalized
    -- Workload costs (sum of namespace costs)
    workload_cpu_cost_usd       NUMERIC(12, 4) NOT NULL DEFAULT 0,
    workload_memory_cost_usd    NUMERIC(12, 4) NOT NULL DEFAULT 0,
    workload_storage_cost_usd   NUMERIC(12, 4) NOT NULL DEFAULT 0,
    workload_network_cost_usd   NUMERIC(12, 4) NOT NULL DEFAULT 0,
    workload_gpu_cost_usd       NUMERIC(12, 4) NOT NULL DEFAULT 0,
    workload_total_cost_usd     NUMERIC(12, 4) NOT NULL DEFAULT 0,
    -- Infrastructure costs
    control_plane_cost_usd      NUMERIC(12, 4) NOT NULL DEFAULT 0,  -- EKS/AKS/GKE control plane fee
    node_cost_usd               NUMERIC(12, 4) NOT NULL DEFAULT 0,  -- Total node compute cost
    lb_cost_usd                 NUMERIC(12, 4) NOT NULL DEFAULT 0,  -- Load balancer costs
    storage_provisioned_cost_usd NUMERIC(12, 4) NOT NULL DEFAULT 0, -- PV/EBS/etc.
    other_cost_usd              NUMERIC(12, 4) NOT NULL DEFAULT 0,  -- Other infra costs
    infra_total_cost_usd        NUMERIC(12, 4) NOT NULL DEFAULT 0,
    -- Grand total
    total_cost_usd              NUMERIC(12, 4) NOT NULL DEFAULT 0,
    -- Cluster stats
    avg_node_count          REAL,
    avg_pod_count           REAL,
    avg_cpu_utilization      REAL,                          -- Cluster-wide CPU utilization %
    avg_memory_utilization   REAL                           -- Cluster-wide memory utilization %
);

SELECT create_hypertable('cluster_costs', by_range('time', INTERVAL '30 days'));

CREATE INDEX idx_cluster_costs_org ON cluster_costs (org_id, time DESC);
CREATE INDEX idx_cluster_costs_cluster ON cluster_costs (cluster_id, time DESC);

ALTER TABLE cluster_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY cluster_costs_isolation ON cluster_costs
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE cluster_costs IS 'Daily cluster cost summary including workload and infrastructure costs. Used for executive cost reporting.';
```

### 3.3 Security Tables

```sql
-- =============================================================================
-- MIGRATION 010: TimescaleDB hypertables — Security data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECURITY_EVENTS
-- Runtime security events detected by Voyager Monitor.
-- Includes: suspicious processes, file modifications, network anomalies,
-- privilege escalation attempts, shell-in-container, etc.
-- Chunk interval: 1 day. High-volume in active clusters.
-- -----------------------------------------------------------------------------
CREATE TABLE security_events (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID,
    pod_id                  UUID,
    container_name          VARCHAR(255),
    node_id                 UUID,
    -- Event classification
    event_category          VARCHAR(100) NOT NULL,          -- process, file, network, privilege, container_runtime
    event_type              VARCHAR(100) NOT NULL,          -- shell_spawned, file_modified, outbound_connection, privilege_escalation, etc.
    severity                vulnerability_severity NOT NULL DEFAULT 'medium',
    -- Event details
    title                   VARCHAR(500) NOT NULL,          -- Human-readable event title
    description             TEXT,                            -- Detailed description
    -- Process information (for process events)
    process_name            VARCHAR(255),
    process_path            TEXT,
    process_args            TEXT,
    parent_process          VARCHAR(255),
    process_uid             INTEGER,                         -- Unix UID
    -- File information (for file events)
    file_path               TEXT,
    file_action             VARCHAR(50),                     -- created, modified, deleted, permissions_changed
    -- Network information (for network events)
    source_ip               INET,
    destination_ip          INET,
    destination_port        INTEGER,
    protocol                VARCHAR(10),
    -- Context
    workload_name           VARCHAR(255),                   -- Denormalized for display
    namespace_name          VARCHAR(255),                   -- Denormalized
    -- Detection metadata
    rule_id                 VARCHAR(255),                   -- Detection rule that fired (e.g., Falco rule name)
    raw_event               JSONB,                          -- Raw event data for investigation
    mitre_tactic            VARCHAR(100),                   -- MITRE ATT&CK tactic
    mitre_technique         VARCHAR(100),                   -- MITRE ATT&CK technique
    -- Disposition
    acknowledged            BOOLEAN NOT NULL DEFAULT FALSE,
    false_positive          BOOLEAN NOT NULL DEFAULT FALSE
);

SELECT create_hypertable('security_events', by_range('time'));
SELECT add_dimension('security_events', by_hash('cluster_id', 4));

CREATE INDEX idx_security_events_org_cluster ON security_events (org_id, cluster_id, time DESC);
CREATE INDEX idx_security_events_severity ON security_events (org_id, severity, time DESC);
CREATE INDEX idx_security_events_category ON security_events (event_category, time DESC);
CREATE INDEX idx_security_events_pod ON security_events (pod_id, time DESC) WHERE pod_id IS NOT NULL;
CREATE INDEX idx_security_events_namespace ON security_events (namespace_id, time DESC) WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_security_events_type ON security_events (event_type, time DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_events_isolation ON security_events
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE security_events IS 'Runtime security events from Voyager Monitor. Syscall monitoring, file integrity, process tracking, network anomalies.';

-- -----------------------------------------------------------------------------
-- VULNERABILITY_SCANS
-- Container image vulnerability scan results from Trivy integration.
-- Each row represents one vulnerability in one image in one scan.
-- Chunk interval: 7 days (scans are less frequent than runtime events).
-- -----------------------------------------------------------------------------
CREATE TABLE vulnerability_scans (
    time                    TIMESTAMPTZ NOT NULL,           -- Scan timestamp
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID,
    -- Image info
    image_name              TEXT NOT NULL,                   -- Full image reference
    image_digest            VARCHAR(255),                   -- Image SHA256 digest
    -- Vulnerability info
    vuln_id                 VARCHAR(100) NOT NULL,          -- CVE ID (e.g., "CVE-2024-1234")
    severity                vulnerability_severity NOT NULL,
    title                   VARCHAR(500),                   -- Vulnerability title
    description             TEXT,                            -- Detailed description
    -- Package info
    package_name            VARCHAR(255),                   -- Affected package
    package_version         VARCHAR(100),                   -- Installed version
    fixed_version           VARCHAR(100),                   -- Fixed version (NULL = no fix available)
    package_type            VARCHAR(50),                    -- os, library, language
    -- Scoring
    cvss_score              REAL,                           -- CVSS v3 score (0-10)
    cvss_vector             VARCHAR(255),                   -- CVSS vector string
    -- Context
    in_use                  BOOLEAN,                        -- Is the vulnerable package actually loaded? (Phase 2)
    exploitable             BOOLEAN,                        -- Known exploits exist?
    -- Affected workloads (which pods/deployments use this image)
    affected_workload_ids   UUID[],                         -- Array of workload IDs
    affected_pod_count      INTEGER DEFAULT 0,              -- Number of pods running this image
    -- Scan metadata
    scanner_version         VARCHAR(50),                    -- Trivy version
    scan_id                 UUID                            -- Links all vulns from one scan run
);

SELECT create_hypertable('vulnerability_scans', by_range('time', INTERVAL '7 days'));

CREATE INDEX idx_vuln_scans_org_cluster ON vulnerability_scans (org_id, cluster_id, time DESC);
CREATE INDEX idx_vuln_scans_severity ON vulnerability_scans (org_id, severity, time DESC);
CREATE INDEX idx_vuln_scans_vuln_id ON vulnerability_scans (vuln_id, time DESC);
CREATE INDEX idx_vuln_scans_image ON vulnerability_scans (image_name, time DESC);
CREATE INDEX idx_vuln_scans_scan_id ON vulnerability_scans (scan_id);
CREATE INDEX idx_vuln_scans_cvss ON vulnerability_scans (cvss_score DESC NULLS LAST, time DESC);

ALTER TABLE vulnerability_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY vuln_scans_isolation ON vulnerability_scans
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE vulnerability_scans IS 'Container image vulnerability scan results from Trivy. One row per vulnerability per image per scan.';
COMMENT ON COLUMN vulnerability_scans.in_use IS 'Phase 2 feature: identifies whether the vulnerable package is actually loaded at runtime (massive noise reduction).';

-- -----------------------------------------------------------------------------
-- RUNTIME_ALERTS
-- Security alerts derived from security_events. Similar to alerts table but
-- specifically for the security domain with additional context.
-- Chunk interval: 7 days.
-- -----------------------------------------------------------------------------
CREATE TABLE runtime_alerts (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    namespace_id            UUID,
    pod_id                  UUID,
    node_id                 UUID,
    -- Alert details
    alert_type              VARCHAR(100) NOT NULL,          -- policy_violation, anomaly, threat_detected
    severity                vulnerability_severity NOT NULL,
    title                   VARCHAR(500) NOT NULL,
    description             TEXT,
    -- Detection context
    detection_rule          VARCHAR(255),                   -- Rule that triggered this alert
    event_count             INTEGER NOT NULL DEFAULT 1,     -- Number of underlying events
    first_event_at          TIMESTAMPTZ NOT NULL,
    last_event_at           TIMESTAMPTZ NOT NULL,
    -- Related events
    related_event_ids       UUID[],                         -- IDs from security_events
    -- Response
    state                   VARCHAR(50) NOT NULL DEFAULT 'open', -- open, investigating, resolved, false_positive
    assigned_to             UUID,                           -- User ID investigating
    resolution_notes        TEXT,
    resolved_at             TIMESTAMPTZ,
    -- Context
    workload_name           VARCHAR(255),
    namespace_name          VARCHAR(255),
    blast_radius            JSONB                           -- {"affected_pods": N, "affected_services": [...], "data_access": [...]}
);

SELECT create_hypertable('runtime_alerts', by_range('time', INTERVAL '7 days'));

CREATE INDEX idx_runtime_alerts_org_cluster ON runtime_alerts (org_id, cluster_id, time DESC);
CREATE INDEX idx_runtime_alerts_severity ON runtime_alerts (org_id, severity, time DESC);
CREATE INDEX idx_runtime_alerts_state ON runtime_alerts (org_id, state, time DESC);
CREATE INDEX idx_runtime_alerts_pod ON runtime_alerts (pod_id, time DESC) WHERE pod_id IS NOT NULL;

ALTER TABLE runtime_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_alerts_isolation ON runtime_alerts
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE runtime_alerts IS 'Security alerts derived from runtime security events. Enriched with blast radius analysis and response tracking.';
```

### 3.4 Compression, Retention & Continuous Aggregates

```sql
-- =============================================================================
-- MIGRATION 011: Compression, retention, and continuous aggregates
-- =============================================================================

-- =============================================================================
-- COMPRESSION POLICIES
-- TimescaleDB compresses older chunks to save 90-95% storage.
-- Compress after 2 hours for high-frequency metrics (still queryable, just compressed).
-- =============================================================================

-- Node metrics: compress after 2 hours, order by node_id for better compression
ALTER TABLE node_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, node_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('node_metrics', INTERVAL '2 hours');

-- Pod metrics: compress after 2 hours
ALTER TABLE pod_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, namespace_id, pod_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('pod_metrics', INTERVAL '2 hours');

-- Container metrics: compress after 2 hours
ALTER TABLE container_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, pod_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('container_metrics', INTERVAL '2 hours');

-- Network metrics: compress after 4 hours (lower frequency)
ALTER TABLE network_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, namespace_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('network_metrics', INTERVAL '4 hours');

-- Resource costs: compress after 1 day (hourly data)
ALTER TABLE resource_costs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, namespace_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('resource_costs', INTERVAL '1 day');

-- Namespace costs: compress after 7 days (daily data)
ALTER TABLE namespace_costs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('namespace_costs', INTERVAL '7 days');

-- Cluster costs: compress after 7 days
ALTER TABLE cluster_costs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('cluster_costs', INTERVAL '7 days');

-- Security events: compress after 1 day
ALTER TABLE security_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('security_events', INTERVAL '1 day');

-- Vulnerability scans: compress after 7 days
ALTER TABLE vulnerability_scans SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('vulnerability_scans', INTERVAL '7 days');

-- Runtime alerts: compress after 7 days
ALTER TABLE runtime_alerts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('runtime_alerts', INTERVAL '7 days');

-- =============================================================================
-- RETENTION POLICIES
-- Drop data older than retention period.
-- NOTE: In production, retention is per-org based on plan tier.
-- These are the maximum retention (enterprise). The application layer
-- can implement per-org retention by deleting data for free/team orgs
-- more aggressively via a scheduled job.
-- =============================================================================

-- High-frequency metrics: 90 days max (enterprise). Free=7d, Team=30d, Pro=90d.
SELECT add_retention_policy('node_metrics', INTERVAL '90 days');
SELECT add_retention_policy('pod_metrics', INTERVAL '90 days');
SELECT add_retention_policy('container_metrics', INTERVAL '90 days');
SELECT add_retention_policy('network_metrics', INTERVAL '90 days');

-- Cost data: 365 days max (enterprise). We keep cost data longer — it's lower volume.
SELECT add_retention_policy('resource_costs', INTERVAL '365 days');
SELECT add_retention_policy('namespace_costs', INTERVAL '365 days');
SELECT add_retention_policy('cluster_costs', INTERVAL '365 days');

-- Security data: 365 days max (compliance requirement).
SELECT add_retention_policy('security_events', INTERVAL '365 days');
SELECT add_retention_policy('vulnerability_scans', INTERVAL '365 days');
SELECT add_retention_policy('runtime_alerts', INTERVAL '365 days');

-- =============================================================================
-- CONTINUOUS AGGREGATES
-- Pre-computed rollups for common dashboard queries.
-- These materialize hourly and daily summaries so dashboard loads are instant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Node metrics: hourly rollup
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW node_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)     AS bucket,
    org_id,
    cluster_id,
    node_id,
    -- CPU
    AVG(cpu_usage_millicores)::INTEGER      AS avg_cpu_millicores,
    MAX(cpu_usage_millicores)               AS max_cpu_millicores,
    MIN(cpu_usage_millicores)               AS min_cpu_millicores,
    AVG(cpu_usage_percent)::REAL            AS avg_cpu_percent,
    MAX(cpu_usage_percent)::REAL            AS max_cpu_percent,
    -- Memory
    AVG(memory_usage_bytes)::BIGINT         AS avg_memory_bytes,
    MAX(memory_usage_bytes)                 AS max_memory_bytes,
    AVG(memory_usage_percent)::REAL         AS avg_memory_percent,
    MAX(memory_usage_percent)::REAL         AS max_memory_percent,
    -- Disk
    AVG(disk_usage_percent)::REAL           AS avg_disk_percent,
    -- Network
    MAX(network_rx_bytes)                   AS max_rx_bytes,
    MAX(network_tx_bytes)                   AS max_tx_bytes,
    -- Pod count
    AVG(pod_count)::REAL                    AS avg_pod_count,
    -- Load
    AVG(load_avg_1m)::REAL                  AS avg_load_1m,
    -- Sample count (for debugging)
    COUNT(*)                                AS sample_count
FROM node_metrics
GROUP BY bucket, org_id, cluster_id, node_id
WITH NO DATA;

-- Refresh policy: materialize data older than 1 hour, look back 3 hours (overlap for late data)
SELECT add_continuous_aggregate_policy('node_metrics_hourly',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- ---------------------------------------------------------------------------
-- Node metrics: daily rollup (from hourly)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW node_metrics_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', bucket)    AS bucket,
    org_id,
    cluster_id,
    node_id,
    AVG(avg_cpu_millicores)::INTEGER        AS avg_cpu_millicores,
    MAX(max_cpu_millicores)                 AS max_cpu_millicores,
    AVG(avg_cpu_percent)::REAL              AS avg_cpu_percent,
    MAX(max_cpu_percent)::REAL              AS max_cpu_percent,
    AVG(avg_memory_bytes)::BIGINT           AS avg_memory_bytes,
    MAX(max_memory_bytes)                   AS max_memory_bytes,
    AVG(avg_memory_percent)::REAL           AS avg_memory_percent,
    MAX(max_memory_percent)::REAL           AS max_memory_percent,
    AVG(avg_disk_percent)::REAL             AS avg_disk_percent,
    AVG(avg_pod_count)::REAL                AS avg_pod_count,
    AVG(avg_load_1m)::REAL                  AS avg_load_1m,
    SUM(sample_count)                       AS sample_count
FROM node_metrics_hourly
GROUP BY bucket, org_id, cluster_id, node_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('node_metrics_daily',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- ---------------------------------------------------------------------------
-- Pod metrics: hourly rollup
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW pod_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)     AS bucket,
    org_id,
    cluster_id,
    namespace_id,
    pod_id,
    workload_id,
    -- CPU
    AVG(cpu_usage_millicores)::INTEGER      AS avg_cpu_millicores,
    MAX(cpu_usage_millicores)               AS max_cpu_millicores,
    AVG(CASE WHEN cpu_request_millicores > 0
        THEN (cpu_usage_millicores::REAL / cpu_request_millicores * 100)
        ELSE NULL END)::REAL                AS avg_cpu_efficiency,
    -- Memory
    AVG(memory_usage_bytes)::BIGINT         AS avg_memory_bytes,
    MAX(memory_usage_bytes)                 AS max_memory_bytes,
    AVG(memory_working_set_bytes)::BIGINT   AS avg_working_set_bytes,
    AVG(CASE WHEN memory_request_bytes > 0
        THEN (memory_usage_bytes::REAL / memory_request_bytes * 100)
        ELSE NULL END)::REAL                AS avg_memory_efficiency,
    -- Restarts
    MAX(restart_count)                      AS max_restart_count,
    COUNT(*)                                AS sample_count
FROM pod_metrics
GROUP BY bucket, org_id, cluster_id, namespace_id, pod_id, workload_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('pod_metrics_hourly',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- ---------------------------------------------------------------------------
-- Security events: daily summary
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW security_events_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)      AS bucket,
    org_id,
    cluster_id,
    event_category,
    severity,
    COUNT(*)                        AS event_count,
    COUNT(DISTINCT pod_id)          AS affected_pods,
    COUNT(DISTINCT namespace_id)    AS affected_namespaces
FROM security_events
GROUP BY bucket, org_id, cluster_id, event_category, severity
WITH NO DATA;

SELECT add_continuous_aggregate_policy('security_events_daily',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);
```

---

## 4. OpenSearch Index Mappings — Logs & Search

### 4.1 Container Logs Index Template

```json
// =============================================================================
// OpenSearch Index Template: Container Logs
// =============================================================================
// Index pattern: voyager-logs-{org_id}-YYYY.MM.DD
// One index per org per day. ILM manages rollover and deletion.

PUT _index_template/voyager-logs
{
  "index_patterns": ["voyager-logs-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 2,
      "number_of_replicas": 1,
      "index.lifecycle.name": "voyager-logs-ilm",
      "index.lifecycle.rollover_alias": "voyager-logs",
      "index.codec": "best_compression",
      "index.refresh_interval": "5s",
      "index.mapping.total_fields.limit": 500,
      "analysis": {
        "analyzer": {
          "log_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "stop"]
          }
        }
      }
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date",
          "format": "strict_date_optional_time||epoch_millis"
        },
        "org_id": {
          "type": "keyword"
        },
        "cluster_id": {
          "type": "keyword"
        },
        "cluster_name": {
          "type": "keyword"
        },
        "namespace": {
          "type": "keyword"
        },
        "namespace_id": {
          "type": "keyword"
        },
        "pod_name": {
          "type": "keyword"
        },
        "pod_id": {
          "type": "keyword"
        },
        "container_name": {
          "type": "keyword"
        },
        "workload_name": {
          "type": "keyword"
        },
        "workload_kind": {
          "type": "keyword"
        },
        "node_name": {
          "type": "keyword"
        },
        "stream": {
          "type": "keyword",
          "doc_values": true
        },
        "log_level": {
          "type": "keyword",
          "doc_values": true
        },
        "message": {
          "type": "text",
          "analyzer": "log_analyzer",
          "fields": {
            "raw": {
              "type": "keyword",
              "ignore_above": 8191
            }
          }
        },
        "structured": {
          "type": "object",
          "enabled": true,
          "dynamic": true
        },
        "labels": {
          "type": "object",
          "dynamic": true
        },
        "source": {
          "type": "keyword"
        },
        "content_type": {
          "type": "keyword"
        }
      }
    }
  }
}
```

### 4.2 Kubernetes Events Index

```json
// =============================================================================
// OpenSearch Index Template: Kubernetes Events
// =============================================================================
// Index pattern: voyager-k8s-events-{org_id}-YYYY.MM
// Monthly rotation — lower volume than logs.

PUT _index_template/voyager-k8s-events
{
  "index_patterns": ["voyager-k8s-events-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "voyager-events-ilm",
      "index.codec": "best_compression",
      "index.refresh_interval": "10s"
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "org_id": {
          "type": "keyword"
        },
        "cluster_id": {
          "type": "keyword"
        },
        "cluster_name": {
          "type": "keyword"
        },
        "namespace": {
          "type": "keyword"
        },
        "event_type": {
          "type": "keyword"
        },
        "reason": {
          "type": "keyword"
        },
        "message": {
          "type": "text",
          "fields": {
            "raw": {
              "type": "keyword",
              "ignore_above": 4096
            }
          }
        },
        "involved_object": {
          "properties": {
            "kind": { "type": "keyword" },
            "name": { "type": "keyword" },
            "namespace": { "type": "keyword" },
            "uid": { "type": "keyword" }
          }
        },
        "source": {
          "properties": {
            "component": { "type": "keyword" },
            "host": { "type": "keyword" }
          }
        },
        "count": {
          "type": "integer"
        },
        "first_timestamp": {
          "type": "date"
        },
        "last_timestamp": {
          "type": "date"
        },
        "labels": {
          "type": "object",
          "dynamic": true
        }
      }
    }
  }
}
```

### 4.3 Security Events Index

```json
// =============================================================================
// OpenSearch Index Template: Security Events
// =============================================================================
// Index pattern: voyager-security-{org_id}-YYYY.MM.DD
// Daily rotation — can be high volume during incidents.

PUT _index_template/voyager-security
{
  "index_patterns": ["voyager-security-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "voyager-security-ilm",
      "index.codec": "best_compression",
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "org_id": {
          "type": "keyword"
        },
        "cluster_id": {
          "type": "keyword"
        },
        "namespace": {
          "type": "keyword"
        },
        "pod_name": {
          "type": "keyword"
        },
        "container_name": {
          "type": "keyword"
        },
        "node_name": {
          "type": "keyword"
        },
        "event_category": {
          "type": "keyword"
        },
        "event_type": {
          "type": "keyword"
        },
        "severity": {
          "type": "keyword"
        },
        "title": {
          "type": "text",
          "fields": {
            "raw": { "type": "keyword" }
          }
        },
        "description": {
          "type": "text"
        },
        "process": {
          "properties": {
            "name": { "type": "keyword" },
            "path": { "type": "keyword" },
            "args": { "type": "text" },
            "parent": { "type": "keyword" },
            "uid": { "type": "integer" }
          }
        },
        "file": {
          "properties": {
            "path": { "type": "keyword" },
            "action": { "type": "keyword" }
          }
        },
        "network": {
          "properties": {
            "source_ip": { "type": "ip" },
            "destination_ip": { "type": "ip" },
            "destination_port": { "type": "integer" },
            "protocol": { "type": "keyword" }
          }
        },
        "mitre": {
          "properties": {
            "tactic": { "type": "keyword" },
            "technique": { "type": "keyword" }
          }
        },
        "detection_rule": {
          "type": "keyword"
        },
        "raw_event": {
          "type": "object",
          "enabled": false
        },
        "acknowledged": {
          "type": "boolean"
        },
        "false_positive": {
          "type": "boolean"
        }
      }
    }
  }
}
```

### 4.4 Index Lifecycle Management (ILM) Policies

```json
// =============================================================================
// ILM Policy: Logs (hot → warm → cold → delete)
// =============================================================================

PUT _plugins/_ism/policies/voyager-logs-ilm
{
  "policy": {
    "description": "Voyager container logs lifecycle: hot 2d → warm 7d → cold 30d → delete 90d",
    "default_state": "hot",
    "states": [
      {
        "name": "hot",
        "actions": [
          {
            "rollover": {
              "min_size": "25gb",
              "min_index_age": "1d"
            }
          }
        ],
        "transitions": [
          {
            "state_name": "warm",
            "conditions": {
              "min_index_age": "2d"
            }
          }
        ]
      },
      {
        "name": "warm",
        "actions": [
          {
            "replica_count": {
              "number_of_replicas": 0
            }
          },
          {
            "force_merge": {
              "max_num_segments": 1
            }
          }
        ],
        "transitions": [
          {
            "state_name": "cold",
            "conditions": {
              "min_index_age": "7d"
            }
          }
        ]
      },
      {
        "name": "cold",
        "actions": [
          {
            "read_only": {}
          }
        ],
        "transitions": [
          {
            "state_name": "delete",
            "conditions": {
              "min_index_age": "90d"
            }
          }
        ]
      },
      {
        "name": "delete",
        "actions": [
          {
            "delete": {}
          }
        ],
        "transitions": []
      }
    ]
  }
}

// =============================================================================
// ILM Policy: Events (lower volume, longer retention)
// =============================================================================

PUT _plugins/_ism/policies/voyager-events-ilm
{
  "policy": {
    "description": "Voyager K8s events lifecycle: hot 7d → warm 30d → delete 365d",
    "default_state": "hot",
    "states": [
      {
        "name": "hot",
        "actions": [],
        "transitions": [
          {
            "state_name": "warm",
            "conditions": {
              "min_index_age": "7d"
            }
          }
        ]
      },
      {
        "name": "warm",
        "actions": [
          {
            "replica_count": {
              "number_of_replicas": 0
            }
          },
          {
            "force_merge": {
              "max_num_segments": 1
            }
          }
        ],
        "transitions": [
          {
            "state_name": "delete",
            "conditions": {
              "min_index_age": "365d"
            }
          }
        ]
      },
      {
        "name": "delete",
        "actions": [
          {
            "delete": {}
          }
        ],
        "transitions": []
      }
    ]
  }
}

// =============================================================================
// ILM Policy: Security events (compliance — longest retention)
// =============================================================================

PUT _plugins/_ism/policies/voyager-security-ilm
{
  "policy": {
    "description": "Voyager security events lifecycle: hot 7d → warm 30d → cold 90d → delete 365d",
    "default_state": "hot",
    "states": [
      {
        "name": "hot",
        "actions": [],
        "transitions": [
          {
            "state_name": "warm",
            "conditions": {
              "min_index_age": "7d"
            }
          }
        ]
      },
      {
        "name": "warm",
        "actions": [
          {
            "replica_count": {
              "number_of_replicas": 0
            }
          },
          {
            "force_merge": {
              "max_num_segments": 1
            }
          }
        ],
        "transitions": [
          {
            "state_name": "cold",
            "conditions": {
              "min_index_age": "90d"
            }
          }
        ]
      },
      {
        "name": "cold",
        "actions": [
          {
            "read_only": {}
          }
        ],
        "transitions": [
          {
            "state_name": "delete",
            "conditions": {
              "min_index_age": "365d"
            }
          }
        ]
      },
      {
        "name": "delete",
        "actions": [
          {
            "delete": {}
          }
        ],
        "transitions": []
      }
    ]
  }
}
```

---

## 5. Redis Data Structures

### 5.1 Real-Time Metrics Cache

```
# =============================================================================
# Redis Key Patterns for Real-Time Metrics
# =============================================================================
# Strategy: Cache the latest metric snapshots for instant dashboard rendering.
# TimescaleDB is the source of truth; Redis provides <10ms reads for the UI.
# All keys are prefixed with org_id for multi-tenant isolation.

# ─────────────────────────────────────────────────────────────
# Cluster Health Cache (Hash)
# Updated by ingestion pipeline on each heartbeat
# TTL: 5 minutes (auto-expire if agent stops reporting)
# ─────────────────────────────────────────────────────────────

KEY:    metrics:{org_id}:cluster:{cluster_id}:health
TYPE:   HASH
FIELDS:
  status              → "healthy" | "warning" | "critical" | "unreachable"
  node_count          → "12"
  pod_count           → "347"
  namespace_count     → "24"
  cpu_usage_percent   → "67.3"
  memory_usage_percent → "72.1"
  last_heartbeat      → "2026-02-04T20:15:00Z"
  agent_version       → "0.8.2"
TTL:    300  (5 minutes)

EXAMPLE:
  HSET metrics:abc-org:cluster:eks-prod:health status healthy node_count 12 ...
  EXPIRE metrics:abc-org:cluster:eks-prod:health 300

# ─────────────────────────────────────────────────────────────
# Node Metrics Snapshot (Hash per node)
# Latest resource utilization for each node
# TTL: 60 seconds (refreshed every 15s)
# ─────────────────────────────────────────────────────────────

KEY:    metrics:{org_id}:node:{node_id}:latest
TYPE:   HASH
FIELDS:
  cpu_millicores      → "2340"
  cpu_percent         → "58.5"
  memory_bytes        → "6442450944"
  memory_percent      → "75.0"
  disk_percent        → "42.3"
  pod_count           → "31"
  network_rx_bps      → "1048576"
  network_tx_bps      → "524288"
  load_1m             → "2.4"
  timestamp           → "2026-02-04T20:15:15Z"
TTL:    60

# ─────────────────────────────────────────────────────────────
# Cluster Overview (Sorted Set — for ranked lists)
# Top clusters by CPU/memory for org-wide overview
# Allows ZRANGEBYSCORE for "top N clusters by utilization"
# ─────────────────────────────────────────────────────────────

KEY:    metrics:{org_id}:clusters:by_cpu
TYPE:   SORTED SET
SCORE:  CPU usage percent
MEMBER: cluster_id

KEY:    metrics:{org_id}:clusters:by_memory
TYPE:   SORTED SET
SCORE:  Memory usage percent
MEMBER: cluster_id

EXAMPLE:
  ZADD metrics:abc-org:clusters:by_cpu 67.3 eks-prod-id 45.1 aks-staging-id
  ZREVRANGEBYSCORE metrics:abc-org:clusters:by_cpu +inf -inf LIMIT 0 10

# ─────────────────────────────────────────────────────────────
# Active Alerts Count (Hash — quick badge counts)
# ─────────────────────────────────────────────────────────────

KEY:    alerts:{org_id}:counts
TYPE:   HASH
FIELDS:
  firing_critical     → "2"
  firing_warning      → "7"
  firing_info         → "12"
  pending             → "3"
  total_firing        → "21"
TTL:    120  (refreshed by alert engine every 60s)

# ─────────────────────────────────────────────────────────────
# Pod Status Counts per Namespace (Hash — for namespace overview)
# ─────────────────────────────────────────────────────────────

KEY:    metrics:{org_id}:namespace:{namespace_id}:pod_status
TYPE:   HASH
FIELDS:
  running             → "24"
  pending             → "1"
  failed              → "0"
  succeeded           → "3"
  total               → "28"
TTL:    60
```

### 5.2 WebSocket Subscription Management

```
# =============================================================================
# WebSocket Subscription Management
# =============================================================================
# Tracks which users are subscribed to which real-time data streams.
# Used by the pub/sub system to route updates efficiently.

# ─────────────────────────────────────────────────────────────
# User Subscriptions (Set — what a user is watching)
# ─────────────────────────────────────────────────────────────

KEY:    ws:user:{user_id}:subs
TYPE:   SET
MEMBERS:
  "cluster:{cluster_id}:overview"
  "cluster:{cluster_id}:logs:{namespace}:{pod}"
  "cluster:{cluster_id}:metrics:{node_id}"
  "alerts:{org_id}"
TTL:    3600  (cleaned up on disconnect; TTL is safety net)

EXAMPLE:
  SADD ws:user:user-123:subs "cluster:eks-prod:overview" "alerts:abc-org"

# ─────────────────────────────────────────────────────────────
# Channel Subscribers (Set — who is watching a channel)
# Reverse index for efficient pub/sub routing
# ─────────────────────────────────────────────────────────────

KEY:    ws:channel:{channel_name}:subscribers
TYPE:   SET
MEMBERS: user_id values

EXAMPLE:
  SADD ws:channel:cluster:eks-prod:overview:subscribers user-123 user-456

# ─────────────────────────────────────────────────────────────
# User Connection State (Hash)
# ─────────────────────────────────────────────────────────────

KEY:    ws:user:{user_id}:connection
TYPE:   HASH
FIELDS:
  server_id           → "backend-pod-xyz"    (which backend pod holds the WS)
  connected_at        → "2026-02-04T20:00:00Z"
  org_id              → "abc-org-id"
  last_ping           → "2026-02-04T20:15:00Z"
TTL:    3600

# ─────────────────────────────────────────────────────────────
# Pub/Sub Channels (Redis Pub/Sub — NOT keys)
# Used for real-time event broadcasting across backend pods
# ─────────────────────────────────────────────────────────────

CHANNEL:  voyager:{org_id}:cluster:{cluster_id}:metrics
CHANNEL:  voyager:{org_id}:cluster:{cluster_id}:events
CHANNEL:  voyager:{org_id}:cluster:{cluster_id}:logs:{namespace}:{pod}
CHANNEL:  voyager:{org_id}:alerts
CHANNEL:  voyager:{org_id}:security

# Message format (JSON published to channel):
{
  "type": "metric_update",
  "cluster_id": "...",
  "data": { ... },
  "timestamp": "2026-02-04T20:15:15Z"
}
```

### 5.3 Rate Limiting

```
# =============================================================================
# Rate Limiting (Sliding Window)
# =============================================================================
# Uses Redis sorted sets for a sliding window rate limiter.
# More accurate than fixed-window counters.

# ─────────────────────────────────────────────────────────────
# API Rate Limiting (per user or API key)
# ─────────────────────────────────────────────────────────────

KEY:    ratelimit:api:{identifier}:{window}
TYPE:   SORTED SET
SCORE:  Timestamp (unix milliseconds) of request
MEMBER: Unique request ID (e.g., UUID or counter)
TTL:    Equal to window duration + buffer

# Rate limit tiers:
# Free:       100 requests/minute, 5,000/hour
# Team:       500 requests/minute, 25,000/hour
# Pro:        2,000 requests/minute, 100,000/hour
# Enterprise: 10,000 requests/minute, 500,000/hour

# Algorithm (sliding window):
# 1. ZREMRANGEBYSCORE ratelimit:api:{user_id}:1m 0 {now - 60000}
# 2. ZCARD ratelimit:api:{user_id}:1m → current count
# 3. If count >= limit → reject (429)
# 4. ZADD ratelimit:api:{user_id}:1m {now} {request_id}
# 5. EXPIRE ratelimit:api:{user_id}:1m 70

# ─────────────────────────────────────────────────────────────
# Ingestion Rate Limiting (per cluster agent)
# Prevents a misconfigured agent from overwhelming the backend
# ─────────────────────────────────────────────────────────────

KEY:    ratelimit:ingest:{cluster_id}:metrics
TYPE:   STRING (counter)
TTL:    60

# Limit: 1000 metric points per second per cluster
INCR ratelimit:ingest:{cluster_id}:metrics
# If > 1000 → drop or buffer

# ─────────────────────────────────────────────────────────────
# Login Rate Limiting (anti-brute-force)
# ─────────────────────────────────────────────────────────────

KEY:    ratelimit:login:{ip_or_email}
TYPE:   STRING (counter with TTL)
TTL:    900  (15 minutes)

# Limit: 10 attempts per 15 minutes
# After limit: require CAPTCHA or block
```

### 5.4 Session & Auth Cache

```
# =============================================================================
# Session & Authentication Cache
# =============================================================================

# ─────────────────────────────────────────────────────────────
# Session Cache (stores decoded JWT/session data)
# Avoids hitting the database on every request
# ─────────────────────────────────────────────────────────────

KEY:    session:{session_token_hash}
TYPE:   HASH
FIELDS:
  user_id             → "uuid"
  org_id              → "uuid"
  email               → "user@example.com"
  role_slug           → "admin"
  permissions         → '["cluster:read","cluster:write",...]'  (JSON string)
  org_plan            → "pro"
  created_at          → "2026-02-04T20:00:00Z"
TTL:    1800  (30 minutes; refreshed on activity)

# ─────────────────────────────────────────────────────────────
# User Permissions Cache (full RBAC resolution)
# Pre-computed on login, invalidated on role change
# ─────────────────────────────────────────────────────────────

KEY:    auth:perms:{user_id}:{org_id}
TYPE:   STRING (JSON)
VALUE:  {
          "role": "admin",
          "permissions": {
            "cluster": ["read", "write", "delete"],
            "namespace": ["read", "write"],
            "pod": ["read", "write", "execute"],
            "alert": ["read", "write"],
            "cost": ["read"],
            "security": ["read"],
            "settings": ["read", "write", "admin"],
            "user": ["read", "write"]
          },
          "scope": {
            "cluster_ids": null,
            "namespaces": null
          }
        }
TTL:    3600  (1 hour; invalidated on role change)

# Invalidation pattern:
# On role change: DEL auth:perms:{user_id}:{org_id}
# On permission change: DEL auth:perms:*:{org_id}  (use SCAN, not KEYS)

# ─────────────────────────────────────────────────────────────
# API Key Cache
# ─────────────────────────────────────────────────────────────

KEY:    auth:apikey:{key_hash}
TYPE:   HASH
FIELDS:
  org_id              → "uuid"
  user_id             → "uuid"
  name                → "CI/CD Pipeline"
  permissions         → '["cluster:read","pod:read"]'
  rate_limit_tier     → "pro"
  created_at          → "2026-02-04T20:00:00Z"
  last_used_at        → "2026-02-04T20:15:00Z"
TTL:    3600

# ─────────────────────────────────────────────────────────────
# Cluster Agent Auth Cache
# Caches validated agent tokens to avoid DB hits on every metrics push
# ─────────────────────────────────────────────────────────────

KEY:    auth:agent:{agent_token_hash}
TYPE:   HASH
FIELDS:
  cluster_id          → "uuid"
  org_id              → "uuid"
  cluster_name        → "eks-prod"
  valid               → "true"
TTL:    300  (5 minutes — agent re-auths are cheap)
```

---

## 6. Migration Strategy

### 6.1 Tooling Recommendation: Drizzle ORM

**Choice: Drizzle ORM** over Prisma.

| Factor | Drizzle | Prisma |
|--------|---------|--------|
| SQL closeness | Drizzle generates near-raw SQL — full control | Abstracted query builder; sometimes generates inefficient SQL |
| TimescaleDB | Can execute raw SQL for hypertable creation | No native support for TimescaleDB |
| RLS support | Raw SQL migrations support any PostgreSQL feature | Limited; RLS requires raw SQL escape hatches |
| Bundle size | ~35KB | ~15MB (Rust binary engine) |
| Performance | Thin layer over `pg` driver — minimal overhead | Query engine adds latency (~2-5ms per query) |
| Migration format | SQL files (inspectable, auditable, version-controllable) | Prisma-specific format |
| Type safety | Full TypeScript inference from schema | Excellent via Prisma Client |

**Migration directory structure:**

```
src/
  db/
    schema/              # Drizzle schema definitions (TypeScript)
      organizations.ts
      users.ts
      clusters.ts
      ...
    migrations/          # SQL migration files (auto-generated + manual)
      0001_extensions_and_setup.sql
      0002_organizations_teams_users.sql
      0003_rbac_roles_permissions.sql
      0004_clusters_nodes_registrations.sql
      0005_namespaces_workloads_pods_containers.sql
      0006_events_alerts.sql
      0007_rls_policies.sql
      0008_timescaledb_metrics.sql
      0009_timescaledb_costs.sql
      0010_timescaledb_security.sql
      0011_compression_retention_aggregates.sql
      0012_seed_system_roles.sql
    seed/
      development.ts     # Dev seed data
      system-roles.ts    # System RBAC roles (runs in production too)
    queries/             # Pre-built query functions
      clusters.ts
      metrics.ts
      costs.ts
      security.ts
    index.ts             # DB client initialization + connection pool
    migrate.ts           # Migration runner
```

### 6.2 Migration Numbering & Naming Convention

```
Format: {NNNN}_{description}.sql
  NNNN = 4-digit sequential number
  description = snake_case description

Naming rules:
  - CREATE operations: 0005_create_pods_table.sql
  - ALTER operations: 0013_add_gpu_cost_to_resource_costs.sql
  - INDEX operations: 0014_add_idx_pods_status.sql
  - DATA migrations: 0015_backfill_namespace_team_ids.sql
  - DROP operations: 0020_drop_deprecated_metrics_v1.sql  (always reversible!)

Each migration file has:
  -- UP section (the migration)
  -- DOWN section (the rollback)
```

### 6.3 Seed Data for Development

```sql
-- =============================================================================
-- SEED: System RBAC Roles (runs in ALL environments)
-- =============================================================================

-- System-wide default roles (org_id = NULL → available to all orgs)
INSERT INTO rbac_roles (id, org_id, name, slug, description, is_system, priority) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'Owner',   'owner',   'Full organization access including billing and member management', TRUE, 100),
    ('00000000-0000-0000-0000-000000000002', NULL, 'Admin',   'admin',   'Full access to all resources except billing and org deletion', TRUE, 90),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Member',  'member',  'Read/write access to clusters, workloads, alerts. No admin settings.', TRUE, 50),
    ('00000000-0000-0000-0000-000000000004', NULL, 'Viewer',  'viewer',  'Read-only access to all resources', TRUE, 10)
ON CONFLICT DO NOTHING;

-- Permissions for system roles
-- Owner: everything
INSERT INTO rbac_permissions (role_id, resource, action) VALUES
    ('00000000-0000-0000-0000-000000000001', 'cluster', 'admin'),
    ('00000000-0000-0000-0000-000000000001', 'namespace', 'admin'),
    ('00000000-0000-0000-0000-000000000001', 'workload', 'admin'),
    ('00000000-0000-0000-0000-000000000001', 'pod', 'admin'),
    ('00000000-0000-0000-0000-000000000001', 'alert', 'admin'),
    ('00000000-0000