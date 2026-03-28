# K8s Resource Explorer — Wave 2: Karpenter Expandable Details

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> **Design skills:** Use `frontend-design` and `ui-ux-pro-max` skills for all UI work.
> **Safety:** READ-ONLY cluster access. No mutating K8s commands.

**Goal:** Add NodeClaims endpoint, extend EC2NodeClass data (blockDeviceMappings, metadataOptions, tags), and rewrite the Karpenter page with expandable cards using the Wave 1 component library.

**Spec:** `docs/superpowers/specs/2026-03-28-k8s-resource-explorer-design.md`

---

## Tasks

### Task 1: Add NodeClaim types and extend EC2NodeClass schema

**Files:**
- Modify: `packages/types/src/karpenter.ts`

Add `karpenterNodeClaimSchema`:
- name: string
- nodePoolName: string
- instanceType: string | null
- capacityType: string | null (spot/on-demand)
- zone: string | null
- nodeName: string | null
- providerID: string | null
- imageID: string | null
- expireAfter: string | null
- resources: { requests: Record<string, string>, allocatable: Record<string, string>, capacity: Record<string, string> }
- conditions: array of karpenterConditionSchema
- requirements: array of { key: string, operator: string, values: string[] }

Extend `karpenterEC2NodeClassSchema` with:
- blockDeviceMappings: array of { deviceName: string, ebs: { volumeSize: string | null, volumeType: string | null, deleteOnTermination: boolean | null } }
- metadataOptions: { httpEndpoint: string | null, httpTokens: string | null, httpPutResponseHopLimit: number | null, httpProtocolIPv6: string | null } | null
- tags: Record<string, string>

Export new types.

### Task 2: Add NodeClaim CRD constants and service method

**Files:**
- Modify: `apps/api/src/lib/karpenter-constants.ts` — add nodeClaims CRD
- Modify: `apps/api/src/lib/karpenter-service.ts` — add listNodeClaims method, extend listEC2NodeClasses to extract new fields

NodeClaims CRD: group `karpenter.sh`, version `v1`, plural `nodeclaims`

listNodeClaims follows same pattern as listNodePools — get KubeConfig via kubeConfigGetter, list custom objects, map to schema.

listEC2NodeClasses — extract blockDeviceMappings, metadataOptions, tags from spec object.

### Task 3: Add listNodeClaims router endpoint

**Files:**
- Modify: `apps/api/src/routers/karpenter.ts`

Add `listNodeClaims` procedure following same pattern as `listNodePools` — authorizedProcedure, clusterId input, output array of karpenterNodeClaimSchema.

### Task 4: Rewrite Karpenter page with expandable cards

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/autoscaling/page.tsx`

Full rewrite using Wave 1 components: ExpandableCard, DetailTabs, DetailRow, DetailGrid, ResourceBar, ConditionsList, TagPills.

Three sections: NodePools, NodeClaims, EC2 Node Classes. Each section heading has an icon and count.

**NodePool card summary:** status dot + name + cpu limit badge + node count + nodeClassRef arrow
**NodePool expand tabs:** Resources (limits as DetailRow, usage as ResourceBar) | Config (nodeClassRef, disruption, budgets) | Conditions

**NodeClaim card summary:** status dot + name + capacity type badge (spot/on-demand) + instance type badge + zone + node name
**NodeClaim expand tabs:** Resources (ResourceBar for CPU, Memory, Pods) | Config (nodeClassRef, instance ID, AMI ID, expireAfter, requirements as TagPills) | Conditions

**EC2NodeClass card summary:** status dot + name + amiFamily + role
**EC2NodeClass expand tabs:** Resources (AMIs as DetailRow, Subnets as DetailRow, SGs as DetailRow) | Config (blockDeviceMappings, metadataOptions, tags as TagPills, role, instanceProfile) | Conditions

All with section heading icons from Lucide, proper motion effects, both themes support.
