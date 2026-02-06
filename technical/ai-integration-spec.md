# Voyager Platform — AI/ML Integration Specification

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Author:** Atlas — AI Architecture  
> **Status:** Technical specification — ready for phased implementation  
> **Based on:** Product Strategy v1.0, Database Schema v1.0, API Specification v1.0  
> **Dependencies:** Fastify backend, PostgreSQL/TimescaleDB, BullMQ, Redis  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Anomaly Detection Engine](#2-anomaly-detection-engine)
3. [Root Cause Analysis (RCA) Engine](#3-root-cause-analysis-rca-engine)
4. [Natural Language Kubernetes Query](#4-natural-language-kubernetes-query)
5. [Cost Optimization Recommendations](#5-cost-optimization-recommendations)
6. [Security Intelligence](#6-security-intelligence)
7. [LLM Integration Layer](#7-llm-integration-layer)
8. [Data Privacy & Cost Control](#8-data-privacy--cost-control)
9. [Database Schema Additions](#9-database-schema-additions)
10. [API Additions](#10-api-additions)
11. [Implementation Phases](#11-implementation-phases)
12. [Competitive Analysis — What Works, What's Hype](#12-competitive-analysis--what-works-whats-hype)

---

## 1. Architecture Overview

### 1.1 Design Principles

1. **AI is additive, never required.** The platform works 100% without AI. Every AI feature degrades gracefully — if the LLM is down, if the anomaly detector is slow, if the user has AI disabled. No core workflow blocks on AI.

2. **Statistical methods first, LLM second.** Phase 1 uses zero LLM calls. Anomaly detection uses math. Root cause analysis uses event correlation. Cost recommendations use threshold logic. LLMs are added in Phase 2 for natural language summaries and queries, not for core detection.

3. **Privacy by default.** Raw logs, secrets, and environment variables NEVER leave the platform. LLM prompts contain sanitized summaries, metric values, and event metadata — never raw customer data.

4. **Small team, big impact.** Every AI feature must be implementable by one person in 1-2 weeks. No training custom models. No GPU infrastructure. No ML pipeline. Use statistical methods and third-party LLM APIs.

5. **Cross-domain is the moat.** The AI features that matter are the ones that correlate across ops, cost, and security — things no single-domain tool can do.

### 1.2 Where AI Processing Happens

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         AI PROCESSING ARCHITECTURE                       │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     FASTIFY BACKEND SERVICE                         │ │
│  │                                                                     │ │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │ │
│  │  │   AI Service     │  │  tRPC AI Router  │  │  Alert Engine    │  │ │
│  │  │                  │  │                  │  │                  │  │ │
│  │  │  • Query handler │  │  • ai.query      │  │  • Anomaly       │  │ │
│  │  │  • Investigation │  │  • ai.investigate│  │    alerts        │  │ │
│  │  │  • Suggestions   │  │  • ai.suggest    │  │  • Threshold     │  │ │
│  │  │                  │  │                  │  │    evaluation    │  │ │
│  │  └────────┬─────────┘  └──────────────────┘  └───────┬──────────┘  │ │
│  │           │                                           │             │ │
│  │  ┌────────▼──────────────────────────────────────────▼───────────┐ │ │
│  │  │                    BullMQ WORKER QUEUES                        │ │ │
│  │  │                                                                │ │ │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐  │ │ │
│  │  │  │  anomaly      │ │  rca          │ │  cost-optimization   │  │ │ │
│  │  │  │  detection    │ │  correlation  │ │  analysis            │  │ │ │
│  │  │  │  (every 1m)   │ │  (on alert)   │ │  (every 1h)         │  │ │ │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────────┘  │ │ │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐  │ │ │
│  │  │  │  security     │ │  llm-tasks   │ │  suggestion          │  │ │ │
│  │  │  │  scoring      │ │  (Phase 2)   │ │  generation          │  │ │ │
│  │  │  │  (on scan)    │ │              │ │  (every 6h)          │  │ │ │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────────┘  │ │ │
│  │  └────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     DATA LAYER (read-only for AI)                   │ │
│  │                                                                     │ │
│  │  PostgreSQL/TimescaleDB      OpenSearch        Redis                │ │
│  │  • node_metrics              • container_logs  • metric cache       │ │
│  │  • pod_metrics               • k8s_events      • anomaly state      │ │
│  │  • events                    • security_events │ • LLM response     │ │
│  │  • alerts, workloads         │                  │   cache             │ │
│  │  • resource_costs            │                  │                     │ │
│  │  • vulnerability_scans       │                  │                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                     EXTERNAL (Phase 2+)                             │ │
│  │                                                                     │ │
│  │  LLM Provider (Anthropic Claude / OpenAI)                          │ │
│  │  • Sanitized prompts only                                          │ │
│  │  • Rate-limited, cached, budget-controlled                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Where does AI run?** | Same Fastify backend, BullMQ workers | No separate service needed. Workers handle heavy computation without blocking API requests. One deployment, one codebase. |
| **Why not a Python microservice?** | Node.js/TypeScript is sufficient for statistical methods and LLM API calls | Anomaly detection uses simple math (z-score, EMA). No need for NumPy/SciPy. Avoids polyglot complexity for a 1-person team. If we need Python later (Phase 3 ML models), add it then. |
| **Background vs. real-time?** | Background (BullMQ) for detection; real-time for queries | Anomaly detection runs on a schedule. Queries need instant responses. BullMQ gives us retries, concurrency control, and job monitoring for free. |
| **LLM integration?** | Provider-agnostic abstraction | Support Claude (primary) + GPT (fallback) + local models (future). Hot-swappable. |

---

## 2. Anomaly Detection Engine

### 2.1 What We're Detecting

| Anomaly Type | Metrics Used | Business Value | Priority |
|-------------|-------------|---------------|----------|
| **CPU spike** | `cpu_usage_percent` from `node_metrics`, `pod_metrics` | Catch runaway processes, infinite loops | P0 |
| **Memory leak** | `memory_usage_bytes` trending upward over time | Prevent OOM kills before they happen | P0 |
| **Latency degradation** | Response time metrics (if available from app metrics) | Catch performance issues before users notice | P1 |
| **Error rate increase** | Pod restart count rate, event frequency | CrashLoopBackOff detection, flapping services | P0 |
| **Disk pressure** | `disk_usage_percent` from `node_metrics` | Prevent node NotReady from disk exhaustion | P1 |
| **Network anomaly** | `rx_bytes`, `tx_bytes` rate changes from `network_metrics` | Detect data exfiltration, DDoS patterns | P2 |
| **Cost spike** | `total_cost_usd` daily deviation from `cluster_costs` | Catch unexpected resource scaling, pricing changes | P1 |
| **Pod count anomaly** | Pod count deviating from normal baseline | Detect scaling failures, zombie deployments | P1 |

### 2.2 Detection Algorithms

We use three complementary statistical methods. Each is simple to implement in TypeScript, requires no external ML library, and is proven in production observability systems.

#### Algorithm 1: Exponential Moving Average (EMA) with Dynamic Bands

**What it does:** Tracks a smoothed average and standard deviation of a metric over time. Flags values that deviate significantly from the expected range.

**Why EMA over SMA:** EMA weights recent data more heavily, so it adapts faster to legitimate trend changes (e.g., a deployment that intentionally increases CPU usage).

```typescript
// packages/backend/src/ai/anomaly/ema-detector.ts

interface EMAState {
  mean: number;
  variance: number;
  count: number;
  lastUpdated: Date;
}

interface AnomalyResult {
  isAnomaly: boolean;
  value: number;
  expectedMean: number;
  expectedStdDev: number;
  zScore: number;           // how many std devs from mean
  severity: 'info' | 'warning' | 'critical';
  direction: 'above' | 'below' | 'normal';
}

const DEFAULT_ALPHA = 0.1;      // Smoothing factor (0.05 = very smooth, 0.3 = reactive)
const WARNING_THRESHOLD = 2.5;   // z-score for warning
const CRITICAL_THRESHOLD = 3.5;  // z-score for critical

export function updateEMA(
  state: EMAState,
  newValue: number,
  alpha: number = DEFAULT_ALPHA
): EMAState {
  if (state.count === 0) {
    return { mean: newValue, variance: 0, count: 1, lastUpdated: new Date() };
  }

  const newMean = alpha * newValue + (1 - alpha) * state.mean;
  const diff = newValue - state.mean;
  const newVariance = (1 - alpha) * (state.variance + alpha * diff * diff);

  return {
    mean: newMean,
    variance: newVariance,
    count: state.count + 1,
    lastUpdated: new Date(),
  };
}

export function detectAnomaly(
  state: EMAState,
  value: number,
  warningThreshold: number = WARNING_THRESHOLD,
  criticalThreshold: number = CRITICAL_THRESHOLD,
): AnomalyResult {
  const stdDev = Math.sqrt(state.variance);
  const minStdDev = state.mean * 0.01; // Floor: 1% of mean to avoid division issues
  const effectiveStdDev = Math.max(stdDev, minStdDev);
  const zScore = Math.abs(value - state.mean) / effectiveStdDev;

  let severity: AnomalyResult['severity'] = 'info';
  let isAnomaly = false;

  if (zScore >= criticalThreshold) {
    severity = 'critical';
    isAnomaly = true;
  } else if (zScore >= warningThreshold) {
    severity = 'warning';
    isAnomaly = true;
  }

  return {
    isAnomaly,
    value,
    expectedMean: state.mean,
    expectedStdDev: effectiveStdDev,
    zScore,
    severity,
    direction: value > state.mean + effectiveStdDev ? 'above'
             : value < state.mean - effectiveStdDev ? 'below'
             : 'normal',
  };
}
```

**State management:** EMA state per (metric, resource) pair is stored in Redis as a hash. Example key: `anomaly:ema:{org_id}:{cluster_id}:node:{node_id}:cpu_usage_percent`. Updated every detection cycle (1 minute). Redis is ideal because EMA state is small (~100 bytes per metric), updated frequently, and tolerant of loss (state rebuilds naturally from new data).

#### Algorithm 2: Seasonal Decomposition (Hour-of-Day / Day-of-Week)

**What it does:** Learns that CPU is normally 80% at 2pm on weekdays and 20% at 2am on weekends. Anomalies are deviations from the seasonal baseline, not from a flat average.

**Why:** Without seasonality, every Monday morning traffic ramp looks like an anomaly. This is the #1 cause of false positives in naive anomaly detection.

```typescript
// packages/backend/src/ai/anomaly/seasonal-detector.ts

// 168 buckets = 24 hours × 7 days of the week
const SEASONAL_BUCKETS = 168;

interface SeasonalProfile {
  buckets: Array<{ mean: number; variance: number; count: number }>;
  minSamples: number; // minimum samples per bucket before seasonal detection activates
}

/**
 * Get the bucket index for a given timestamp.
 * Bucket = (dayOfWeek * 24) + hourOfDay
 * This captures both hour-of-day and day-of-week patterns.
 */
function getBucketIndex(timestamp: Date): number {
  const dayOfWeek = timestamp.getUTCDay(); // 0=Sunday
  const hour = timestamp.getUTCHours();
  return dayOfWeek * 24 + hour;
}

/**
 * Update the seasonal profile with a new data point.
 * Uses EMA within each bucket for adaptation.
 */
export function updateSeasonalProfile(
  profile: SeasonalProfile,
  value: number,
  timestamp: Date,
  alpha: number = 0.05, // slower alpha for seasonal — we want stability
): SeasonalProfile {
  const idx = getBucketIndex(timestamp);
  const bucket = profile.buckets[idx];

  if (bucket.count === 0) {
    profile.buckets[idx] = { mean: value, variance: 0, count: 1 };
  } else {
    const newMean = alpha * value + (1 - alpha) * bucket.mean;
    const diff = value - bucket.mean;
    const newVariance = (1 - alpha) * (bucket.variance + alpha * diff * diff);
    profile.buckets[idx] = { mean: newMean, variance: newVariance, count: bucket.count + 1 };
  }

  return profile;
}

/**
 * Detect anomaly against the seasonal baseline.
 * Falls back to non-seasonal detection if insufficient seasonal data.
 */
export function detectSeasonalAnomaly(
  profile: SeasonalProfile,
  value: number,
  timestamp: Date,
  warningThreshold: number = 2.5,
  criticalThreshold: number = 3.5,
): AnomalyResult & { seasonal: boolean } {
  const idx = getBucketIndex(timestamp);
  const bucket = profile.buckets[idx];

  // Need at least 2 weeks of data (14 samples per bucket) for seasonal detection
  if (bucket.count < profile.minSamples) {
    return { ...NON_SEASONAL_FALLBACK, seasonal: false };
  }

  const stdDev = Math.sqrt(bucket.variance);
  const minStdDev = bucket.mean * 0.02; // 2% floor for seasonal
  const effectiveStdDev = Math.max(stdDev, minStdDev);
  const zScore = Math.abs(value - bucket.mean) / effectiveStdDev;

  return {
    isAnomaly: zScore >= warningThreshold,
    value,
    expectedMean: bucket.mean,
    expectedStdDev: effectiveStdDev,
    zScore,
    severity: zScore >= criticalThreshold ? 'critical' : zScore >= warningThreshold ? 'warning' : 'info',
    direction: value > bucket.mean + effectiveStdDev ? 'above' : value < bucket.mean - effectiveStdDev ? 'below' : 'normal',
    seasonal: true,
  };
}
```

**Storage:** Seasonal profiles are stored in PostgreSQL (see schema additions below) because they're larger (~168 buckets × ~20 bytes = ~3.4KB per metric) and need durability. Updated by the hourly aggregation job.

#### Algorithm 3: Rate-of-Change Detection (Derivative Analysis)

**What it does:** Detects sudden changes in the rate of change of a metric. Catches memory leaks (steady upward slope) and sudden jumps (deploy-induced spike) that EMA alone might smooth over.

```typescript
// packages/backend/src/ai/anomaly/rate-detector.ts

interface RateOfChangeResult {
  isAnomaly: boolean;
  currentRate: number;        // units per minute
  baselineRate: number;       // normal rate
  rateZScore: number;
  anomalyType: 'spike' | 'sustained_growth' | 'sudden_drop' | 'normal';
}

/**
 * Detect anomalous rate of change.
 * 
 * - Memory leak: sustained positive rate over multiple intervals
 * - CPU spike: rate jumps dramatically in one interval
 * - Traffic drop: rate goes negative suddenly
 */
export function detectRateAnomaly(
  recentValues: Array<{ time: Date; value: number }>, // last 10-15 data points
  baselineRate: number,          // historical average rate of change
  baselineRateStdDev: number,    // historical rate std dev
): RateOfChangeResult {
  if (recentValues.length < 3) {
    return { isAnomaly: false, currentRate: 0, baselineRate, rateZScore: 0, anomalyType: 'normal' };
  }

  // Calculate recent rate of change using linear regression on last N points
  const rates: number[] = [];
  for (let i = 1; i < recentValues.length; i++) {
    const dt = (recentValues[i].time.getTime() - recentValues[i - 1].time.getTime()) / 60000; // minutes
    if (dt > 0) {
      rates.push((recentValues[i].value - recentValues[i - 1].value) / dt);
    }
  }

  const currentRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const minStdDev = Math.abs(baselineRate) * 0.1 || 0.001;
  const effectiveStdDev = Math.max(baselineRateStdDev, minStdDev);
  const rateZScore = Math.abs(currentRate - baselineRate) / effectiveStdDev;

  // Determine anomaly type
  let anomalyType: RateOfChangeResult['anomalyType'] = 'normal';
  if (rateZScore > 3.0) {
    if (currentRate > baselineRate) {
      // Check if ALL recent rates are positive (sustained growth = leak pattern)
      const allPositive = rates.every(r => r > 0);
      anomalyType = allPositive && rates.length >= 5 ? 'sustained_growth' : 'spike';
    } else {
      anomalyType = 'sudden_drop';
    }
  }

  return {
    isAnomaly: rateZScore > 3.0,
    currentRate,
    baselineRate,
    rateZScore,
    anomalyType,
  };
}
```

### 2.3 Detection Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                    ANOMALY DETECTION PIPELINE                          │
│                                                                        │
│  Triggered: BullMQ repeatable job, every 60 seconds per cluster        │
│                                                                        │
│  Step 1: FETCH RECENT METRICS                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Query TimescaleDB for last 15 minutes of metrics:               │ │
│  │  - node_metrics (per node: CPU, memory, disk)                    │ │
│  │  - pod_metrics (per pod: CPU, memory, restarts)                  │ │
│  │  - Aggregated by 1-minute buckets using continuous aggregates    │ │
│  │  Batch: one query per metric type per cluster (not per resource) │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│  Step 2: LOAD ANOMALY STATE                                           │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Load from Redis:                                                │ │
│  │  - EMA state per (metric, resource)                              │ │
│  │  - Active anomaly tracking (to avoid duplicate alerts)           │ │
│  │  Load from PostgreSQL (cached in Redis hourly):                  │ │
│  │  - Seasonal profiles per (metric, resource)                      │ │
│  │  - User-configured sensitivity per alert rule                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│  Step 3: RUN DETECTORS                                                │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  For each (metric, resource) pair:                               │ │
│  │  1. EMA detector → flags sudden deviations                      │ │
│  │  2. Seasonal detector → flags deviations from time-of-day norm  │ │
│  │  3. Rate-of-change detector → flags leaks and spikes            │ │
│  │                                                                  │ │
│  │  Consensus: anomaly confirmed if ≥2 of 3 detectors agree        │ │
│  │  OR: if any single detector returns critical severity            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│  Step 4: FALSE POSITIVE REDUCTION                                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Before alerting, check:                                         │ │
│  │  ✓ Duration: anomaly must persist for ≥ configured duration      │ │
│  │    (default: 3 minutes for warning, 1 minute for critical)       │ │
│  │  ✓ Cooldown: don't re-alert for same metric+resource within 15m │ │
│  │  ✓ Context: was there a recent deployment? (expected change)     │ │
│  │  ✓ Suppression: is this resource's namespace silenced?           │ │
│  │  ✓ Min data: need ≥ 100 data points before anomaly detection    │ │
│  │    activates for a metric (avoid cold-start false positives)     │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│  Step 5: EMIT ANOMALY EVENTS                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  For confirmed anomalies:                                        │ │
│  │  1. Write to anomaly_detections table (TimescaleDB)              │ │
│  │  2. Check against alert_rules (condition_type = 'anomaly')       │ │
│  │  3. If matches a rule → create/update alert via Alert Engine     │ │
│  │  4. Publish to Redis pub/sub for real-time dashboard updates     │ │
│  │  5. Trigger RCA correlation job (if alert fired)                 │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│  Step 6: UPDATE STATE                                                 │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  - Write updated EMA state to Redis                              │ │
│  │  - Update seasonal profiles (batch, via hourly job)              │ │
│  │  - Update anomaly tracking state in Redis                        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Sensitivity Tuning

Users tune anomaly detection sensitivity per metric and per scope, through alert rules:

```typescript
// Alert rule condition for anomaly-based alerts
interface AnomalyAlertCondition {
  condition_type: 'anomaly';
  condition: {
    metric: string;                    // 'cpu_usage_percent', 'memory_usage_bytes', etc.
    sensitivity: 'low' | 'medium' | 'high' | 'custom';
    // Sensitivity presets map to z-score thresholds:
    // low:    warning=3.5, critical=4.5  (fewer alerts, only extreme anomalies)
    // medium: warning=2.5, critical=3.5  (balanced — default)
    // high:   warning=2.0, critical=2.5  (more alerts, catch subtle anomalies)
    custom_warning_threshold?: number;  // custom z-score
    custom_critical_threshold?: number;
    min_duration_seconds: number;       // default: 180 (3 min)
    seasonal_enabled: boolean;          // default: true
    rate_of_change_enabled: boolean;    // default: true
  };
  scope: {
    cluster_ids?: string[];
    namespaces?: string[];
    workload_names?: string[];
    node_names?: string[];
    exclude_namespaces?: string[];      // e.g., exclude kube-system
  };
}
```

### 2.5 Performance Budget

| Metric | Target | Rationale |
|--------|--------|-----------|
| Detection latency | < 10 seconds from metric arrival to anomaly event | Fast enough for real-time dashboard updates |
| Metrics processed/sec | 10,000+ per cluster | 100 nodes × 20 pods/node × 5 metrics = 10,000 metric series |
| Redis memory per cluster | < 50 MB for anomaly state | 10K metrics × ~200 bytes EMA state + tracking overhead |
| PostgreSQL load | < 5% additional from anomaly queries | Batch reads using continuous aggregates, not raw data |
| False positive rate | < 5% after 2 weeks of baseline building | Measured by tracking user dismissals of anomaly alerts |

### 2.6 Libraries & Dependencies

No external ML libraries needed. All algorithms are implemented in pure TypeScript. Optional helpers:

| Library | Purpose | Why |
|---------|---------|-----|
| `simple-statistics` (npm) | Statistical utility functions (mean, stddev, linear regression) | Well-maintained, tiny (~15KB), TypeScript types. Avoids reimplementing basics. |
| None (built-in) | Core EMA, seasonal, rate-of-change | Simple enough to own. No dependency risk. |

---

## 3. Root Cause Analysis (RCA) Engine

### 3.1 Overview

When an alert fires (from threshold, anomaly detection, or event-based rules), the RCA engine automatically investigates what caused it by correlating events across multiple domains.

**Phase 1 (v1.0): Rule-based event correlation** — No LLM. Uses timeline matching, dependency graphs, and change correlation.

**Phase 2 (v1.5): LLM-enhanced RCA** — Takes the correlation results and generates a natural language summary with Claude/GPT.

### 3.2 Event Correlation Algorithm

The RCA engine runs as a BullMQ job triggered whenever an alert transitions to `firing` state.

```typescript
// packages/backend/src/ai/rca/correlation-engine.ts

interface CorrelationInput {
  alert: Alert;                    // The firing alert
  timeWindow: {
    before: number;                // Minutes to look back (default: 30)
    after: number;                 // Minutes to look forward (default: 5)
  };
  orgId: string;
  clusterId: string;
  namespace?: string;
  workloadName?: string;
  podName?: string;
}

interface CorrelatedEvent {
  source: 'k8s_event' | 'deployment' | 'scaling' | 'config_change' | 'security_event'
        | 'cost_anomaly' | 'metric_anomaly' | 'node_event';
  timestamp: Date;
  description: string;
  relevanceScore: number;          // 0.0 - 1.0 (how likely this caused the alert)
  resource: { kind: string; name: string; namespace?: string };
  details: Record<string, unknown>;
}

interface RCAResult {
  alertId: string;
  correlatedEvents: CorrelatedEvent[];
  timeline: CorrelatedEvent[];     // Sorted chronologically
  probableCause: {
    description: string;           // Rule-generated plain text explanation
    confidence: number;            // 0.0 - 1.0
    category: 'deployment' | 'resource_exhaustion' | 'scaling' | 'node_failure'
            | 'config_change' | 'security_incident' | 'external' | 'unknown';
    evidence: string[];            // List of supporting evidence
  };
  recommendations: Array<{
    action: string;
    description: string;
    risk: 'none' | 'low' | 'medium' | 'high';
    automated: boolean;
  }>;
  crossDomainInsights: Array<{    // The Voyager differentiator
    domains: Array<'ops' | 'cost' | 'security'>;
    insight: string;
  }>;
}
```

#### Step 1: Gather Candidate Events

Query all event sources within the time window, scoped to the affected resource and its dependencies:

```typescript
async function gatherCandidateEvents(input: CorrelationInput): Promise<CorrelatedEvent[]> {
  const { alert, timeWindow, orgId, clusterId, namespace } = input;
  const from = subMinutes(alert.started_at, timeWindow.before);
  const to = addMinutes(alert.started_at, timeWindow.after);

  // Parallel queries for speed
  const [
    k8sEvents,
    deploymentChanges,
    scalingEvents,
    configChanges,
    securityEvents,
    costAnomalies,
    metricAnomalies,
    nodeEvents,
  ] = await Promise.all([
    // 1. K8s events: pod lifecycle, scheduling failures, OOM kills
    queryK8sEvents(orgId, clusterId, namespace, from, to),

    // 2. Deployment changes: image updates, replica changes, rollbacks
    queryDeploymentChanges(orgId, clusterId, namespace, from, to),

    // 3. Scaling events: HPA triggers, manual scaling
    queryScalingEvents(orgId, clusterId, namespace, from, to),

    // 4. Config changes: ConfigMap/Secret updates, resource limit changes
    queryConfigChanges(orgId, clusterId, namespace, from, to),

    // 5. Security events: suspicious processes, privilege escalation
    querySecurityEvents(orgId, clusterId, namespace, from, to),

    // 6. Cost anomalies: spending spikes (cross-domain!)
    queryCostAnomalies(orgId, clusterId, namespace, from, to),

    // 7. Metric anomalies: other anomalies in the same time window
    queryMetricAnomalies(orgId, clusterId, from, to),

    // 8. Node events: node NotReady, disk pressure, memory pressure
    queryNodeEvents(orgId, clusterId, from, to),
  ]);

  return [
    ...k8sEvents,
    ...deploymentChanges,
    ...scalingEvents,
    ...configChanges,
    ...securityEvents,
    ...costAnomalies,
    ...metricAnomalies,
    ...nodeEvents,
  ];
}
```

#### Step 2: Score Relevance

Each candidate event is scored for relevance to the firing alert:

```typescript
function scoreRelevance(event: CorrelatedEvent, alert: Alert): number {
  let score = 0.0;

  // 1. Temporal proximity: events closer in time to the alert are more relevant
  // Peak relevance: events 0-5 minutes before the alert
  const minutesBefore = differenceInMinutes(alert.started_at, event.timestamp);
  if (minutesBefore >= 0 && minutesBefore <= 2) score += 0.3;
  else if (minutesBefore > 2 && minutesBefore <= 5) score += 0.25;
  else if (minutesBefore > 5 && minutesBefore <= 15) score += 0.15;
  else if (minutesBefore > 15) score += 0.05;
  else if (minutesBefore < 0) score += 0.1; // after alert (cascade effect)

  // 2. Resource proximity: events on the same resource are more relevant
  if (event.resource.name === alert.affected_resource_name) score += 0.25;
  if (event.resource.namespace === alert.affected_resource_namespace) score += 0.1;

  // 3. Causal likelihood: certain event types are more likely to cause certain alerts
  score += getCausalScore(event.source, alert.domain, alert.condition_type);

  // 4. Dependency proximity: events on resources that the affected resource depends on
  // (This uses the resource dependency graph — see section 3.3)
  // Example: database pod OOM → API pod latency spike
  // score += getDependencyScore(event, alert);

  return Math.min(score, 1.0);
}

/**
 * Causal likelihood matrix: which event types commonly cause which alert types?
 */
function getCausalScore(eventSource: string, alertDomain: string, conditionType: string): number {
  const CAUSAL_MATRIX: Record<string, Record<string, number>> = {
    'deployment': {
      'ops': 0.3,       // Deployments commonly cause ops issues
      'cost': 0.2,      // New deployments can spike costs
      'security': 0.1,  // New image might introduce vulns
    },
    'scaling': {
      'ops': 0.15,
      'cost': 0.3,      // Scaling is the #1 cause of cost spikes
      'security': 0.05,
    },
    'config_change': {
      'ops': 0.25,      // Config changes frequently break things
      'cost': 0.1,
      'security': 0.15, // Config changes can weaken security
    },
    'node_event': {
      'ops': 0.35,      // Node issues cascade to pod issues
      'cost': 0.1,
      'security': 0.05,
    },
    'security_event': {
      'ops': 0.1,       // Security incidents can cause resource exhaustion
      'cost': 0.05,
      'security': 0.35, // Security events cause security alerts
    },
    'metric_anomaly': {
      'ops': 0.2,
      'cost': 0.15,
      'security': 0.1,
    },
  };

  return CAUSAL_MATRIX[eventSource]?.[alertDomain] ?? 0.05;
}
```

#### Step 3: Build Probable Cause

```typescript
function buildProbableCause(
  alert: Alert,
  scoredEvents: CorrelatedEvent[],
): RCAResult['probableCause'] {
  // Sort by relevance score, take top events
  const topEvents = scoredEvents
    .filter(e => e.relevanceScore >= 0.3)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

  if (topEvents.length === 0) {
    return {
      description: 'No clear cause identified. The anomaly may be due to external factors or gradual drift.',
      confidence: 0.1,
      category: 'unknown',
      evidence: [],
    };
  }

  const topEvent = topEvents[0];
  const confidence = topEvent.relevanceScore;

  // Rule-based cause description
  const description = generateCauseDescription(alert, topEvent, topEvents);
  const category = categorize(topEvent);
  const evidence = topEvents.map(e =>
    `[${e.source}] ${e.description} (${formatRelativeTime(e.timestamp, alert.started_at)} before alert)`
  );

  return { description, confidence, category, evidence };
}

/**
 * Template-based cause description.
 * Phase 2 replaces this with LLM-generated natural language.
 */
function generateCauseDescription(
  alert: Alert,
  primaryCause: CorrelatedEvent,
  supportingEvents: CorrelatedEvent[],
): string {
  // Example templates
  const templates: Record<string, (alert: Alert, cause: CorrelatedEvent) => string> = {
    'deployment': (a, c) =>
      `Alert "${a.title}" was likely caused by a deployment change: ${c.description}. ` +
      `The deployment occurred ${formatRelativeTime(c.timestamp, a.started_at)} before the alert fired.`,

    'node_event': (a, c) =>
      `Alert "${a.title}" appears to be caused by a node-level issue: ${c.description}. ` +
      `This may have affected all pods scheduled on the affected node.`,

    'config_change': (a, c) =>
      `Alert "${a.title}" correlates with a configuration change: ${c.description}. ` +
      `Consider reviewing and potentially rolling back the change.`,

    'scaling': (a, c) =>
      `Alert "${a.title}" correlates with a scaling event: ${c.description}. ` +
      `Resource contention from the scaling activity may have triggered this alert.`,

    'security_event': (a, c) =>
      `Alert "${a.title}" may be related to a security event: ${c.description}. ` +
      `The security event could have caused abnormal resource consumption.`,
  };

  const template = templates[primaryCause.source] ?? templates['deployment'];
  return template(alert, primaryCause);
}
```

### 3.3 Resource Dependency Graph

To identify cascading failures (database pod crashes → API pods fail → frontend errors), we maintain a lightweight dependency graph:

```typescript
// packages/backend/src/ai/rca/dependency-graph.ts

interface DependencyGraph {
  nodes: Map<string, ResourceNode>;     // resource UID → node
  edges: Map<string, Set<string>>;      // source UID → set of target UIDs
}

interface ResourceNode {
  uid: string;
  kind: string;       // Pod, Deployment, Service, Node
  name: string;
  namespace: string;
  clusterId: string;
}

/**
 * Build the dependency graph from K8s resource relationships.
 * Updated whenever resource state changes (via Voyager Monitor events).
 * 
 * Edges are derived from:
 * 1. Owner references (Deployment → ReplicaSet → Pod)
 * 2. Service → Pod (via label selectors)
 * 3. Pod → Node (scheduling)
 * 4. PVC → Pod (volume mounts)
 * 5. ConfigMap/Secret → Pod (env/volume references)
 * 
 * Phase 2 addition:
 * 6. Network connections (Pod A calls Pod B — from network_metrics)
 */
function buildDependencyGraph(
  workloads: Workload[],
  pods: Pod[],
  services: Service[],
  nodes: Node[],
): DependencyGraph {
  const graph: DependencyGraph = { nodes: new Map(), edges: new Map() };

  // Add nodes
  for (const pod of pods) {
    graph.nodes.set(pod.uid, {
      uid: pod.uid, kind: 'Pod', name: pod.name,
      namespace: pod.namespace, clusterId: pod.clusterId,
    });
  }

  // Add edges: Pod → Node (pod is scheduled on node)
  for (const pod of pods) {
    if (pod.nodeId) {
      addEdge(graph, pod.nodeId, pod.uid); // node failure affects pod
    }
  }

  // Add edges: Workload → Pod (workload manages pod)
  for (const pod of pods) {
    if (pod.workloadId) {
      addEdge(graph, pod.workloadId, pod.uid);
    }
  }

  // Add edges: Service → Pod (service routes to pod)
  // Matched by label selectors
  for (const svc of services) {
    const matchingPods = pods.filter(p => labelsMatch(p.labels, svc.selector));
    for (const pod of matchingPods) {
      addEdge(graph, svc.uid, pod.uid);
    }
  }

  return graph;
}

/**
 * Find all resources that depend on a given resource.
 * Used to identify blast radius of an issue.
 */
function getDependents(graph: DependencyGraph, uid: string, depth: number = 3): string[] {
  const visited = new Set<string>();
  const queue: Array<{ uid: string; currentDepth: number }> = [{ uid, currentDepth: 0 }];

  while (queue.length > 0) {
    const { uid: current, currentDepth } = queue.shift()!;
    if (visited.has(current) || currentDepth > depth) continue;
    visited.add(current);

    const dependents = graph.edges.get(current) ?? new Set();
    for (const dep of dependents) {
      queue.push({ uid: dep, currentDepth: currentDepth + 1 });
    }
  }

  visited.delete(uid); // exclude self
  return Array.from(visited);
}
```

The dependency graph is rebuilt every 5 minutes per cluster (via BullMQ job) and cached in Redis. It's small enough (~1KB per 100 resources) to fit entirely in memory.

### 3.4 Cross-Domain Insights (The Moat)

This is what makes Voyager's RCA unique. No other tool can produce these insights because they don't have unified data:

```typescript
function generateCrossDomainInsights(
  alert: Alert,
  events: CorrelatedEvent[],
): RCAResult['crossDomainInsights'] {
  const insights: RCAResult['crossDomainInsights'] = [];

  // Pattern 1: Deployment + OOM Kill + CVE
  // "The OOM kill was caused by a new image that has a memory exhaustion vulnerability"
  const hasDeployment = events.some(e => e.source === 'deployment');
  const hasOOMKill = events.some(e =>
    e.source === 'k8s_event' && e.details?.reason === 'oom_killed'
  );
  const hasRelevantCVE = events.some(e =>
    e.source === 'security_event' && e.details?.event_type === 'vulnerability_in_use'
  );
  if (hasDeployment && hasOOMKill && hasRelevantCVE) {
    insights.push({
      domains: ['ops', 'security'],
      insight: 'The OOM kill correlates with a deployment that introduced an image with a known ' +
               'memory exhaustion vulnerability (CVE). Patching the vulnerability may resolve the ' +
               'memory issue.',
    });
  }

  // Pattern 2: Scaling event + cost spike
  // "The cost spike is caused by auto-scaling triggered by the CPU anomaly"
  const hasScaling = events.some(e => e.source === 'scaling');
  const hasCostAnomaly = events.some(e => e.source === 'cost_anomaly');
  if (hasScaling && hasCostAnomaly) {
    insights.push({
      domains: ['ops', 'cost'],
      insight: 'A scaling event occurred in the same time window as a cost spike. ' +
               'The scaling may have been triggered by resource pressure. Review scaling ' +
               'policies and consider right-sizing before the next scaling event.',
    });
  }

  // Pattern 3: Security event + resource exhaustion
  // "Crypto mining detected → CPU 100%"
  const hasCryptoMining = events.some(e =>
    e.source === 'security_event' && e.details?.event_type === 'crypto_mining'
  );
  const hasCPUAnomaly = alert.domain === 'ops' &&
    alert.condition?.metric === 'cpu_usage_percent';
  if (hasCryptoMining && hasCPUAnomaly) {
    insights.push({
      domains: ['ops', 'security', 'cost'],
      insight: 'Crypto mining activity was detected on the same resource experiencing CPU anomalies. ' +
               'This is likely a compromised workload. Immediate investigation and containment recommended. ' +
               'Estimated cost impact: elevated compute costs until contained.',
    });
  }

  // Pattern 4: Node pressure + pod eviction + cost (right-sizing opportunity)
  const hasNodePressure = events.some(e =>
    e.source === 'node_event' && (
      e.details?.reason === 'node_not_ready' ||
      e.details?.message?.includes('memory pressure')
    )
  );
  const hasPodEviction = events.some(e =>
    e.source === 'k8s_event' && e.details?.reason === 'killing' && e.details?.message?.includes('evict')
  );
  if (hasNodePressure && hasPodEviction) {
    insights.push({
      domains: ['ops', 'cost'],
      insight: 'Node memory pressure caused pod evictions. This suggests the node is over-committed. ' +
               'Consider: (1) right-sizing pod memory requests to actual usage, or (2) scaling to ' +
               'additional nodes. Check the Cost tab for right-sizing recommendations.',
    });
  }

  return insights;
}
```

### 3.5 Phase 2: LLM-Enhanced RCA

In Phase 2, the rule-based RCA result is passed to an LLM for a natural language summary:

```typescript
// packages/backend/src/ai/rca/llm-summarizer.ts (Phase 2)

async function generateLLMSummary(
  rcaResult: RCAResult,
  alert: Alert,
  provider: LLMProvider,
): Promise<string> {
  const prompt = buildRCASummaryPrompt(rcaResult, alert);

  // IMPORTANT: The prompt contains ONLY:
  // - Metric names and values (not raw log content)
  // - Event descriptions (not raw event payloads)
  // - Resource names (pods, deployments — not secrets or env vars)
  // - Time-relative references ("5 minutes before alert")
  // Never raw logs, env vars, or customer application data.

  const response = await provider.complete({
    model: 'claude-3-5-haiku-latest', // Fast, cheap, good enough for summaries
    system: RCA_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
    temperature: 0.2, // Low temperature for factual, consistent output
  });

  return response.content;
}

const RCA_SYSTEM_PROMPT = `You are an SRE assistant analyzing a Kubernetes incident. 
You are given:
1. An alert that fired (with its conditions and severity)
2. A list of correlated events from the time window surrounding the alert
3. A preliminary root cause analysis with confidence score

Your job: Write a clear, concise summary (2-4 sentences) that:
- States what happened in plain English
- Identifies the most likely root cause
- Suggests the immediate next step
- If relevant, mentions cross-domain impacts (cost, security)

Do NOT hallucinate events or metrics that aren't in the provided data.
Be factual. Say "likely" or "possibly" when confidence is below 0.7.`;
```

---

## 4. Natural Language Kubernetes Query

### 4.1 Overview

Users type questions in natural language, and Voyager translates them into structured queries against the platform's data.

**Phase 2 feature** (requires LLM). Not in Phase 1.

### 4.2 Architecture

```
User Input                  LLM Translation              Execution
─────────                  ───────────────              ─────────
"show me pods that     →   Structured Query JSON:   →   tRPC call:
 crashed in the last       {                            pod.list({
 hour in production"         resource: "pods",            clusterId: "...",
                             filters: {                   namespace: "production",
                               phase: ["Failed"],         phase: ["Failed"],
                               restartCount: {">": 0},    timeRange: { ... },
                               namespace: "production",   sort: { field: "restartCount",
                               timeRange: "1h"                    order: "desc" }
                             },                         })
                             sort: "restartCount desc"
                           }
```

### 4.3 Query Schema

The LLM translates natural language into a structured query schema. This schema is the contract between the LLM and the execution engine.

```typescript
// packages/backend/src/ai/nlq/query-schema.ts

/**
 * The structured query format that the LLM must output.
 * This is what the LLM is prompted to generate, and what the execution engine parses.
 */
const NLQuerySchema = z.object({
  // What resource type to query
  resource: z.enum([
    'pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs',
    'nodes', 'namespaces', 'services',
    'events', 'alerts',
    'costs', 'vulnerabilities',
  ]),

  // Intent: what the user wants to do
  intent: z.enum([
    'list',        // Show me all X
    'count',       // How many X
    'detail',      // Tell me about specific X
    'compare',     // Compare X and Y
    'trend',       // How has X changed over time
    'top_n',       // Top 5 X by Y
    'summary',     // Summarize the state of X
  ]),

  // Filters to apply
  filters: z.object({
    cluster: z.string().optional(),       // Cluster name or ID
    namespace: z.string().optional(),     // Namespace name
    name: z.string().optional(),          // Resource name (supports wildcards)
    labels: z.record(z.string()).optional(),
    status: z.string().optional(),        // healthy, warning, critical
    phase: z.array(z.string()).optional(), // Pod phase: Running, Failed, etc.
    timeRange: z.string().optional(),     // "1h", "24h", "7d", "30d"
    severity: z.array(z.string()).optional(), // For alerts/vulns
    domain: z.string().optional(),        // ops, cost, security
    // Numeric filters
    cpuUsagePercent: z.object({ op: z.enum(['gt', 'lt', 'gte', 'lte']), value: z.number() }).optional(),
    memoryUsagePercent: z.object({ op: z.enum(['gt', 'lt', 'gte', 'lte']), value: z.number() }).optional(),
    restartCount: z.object({ op: z.enum(['gt', 'lt', 'gte', 'lte']), value: z.number() }).optional(),
    costPerDay: z.object({ op: z.enum(['gt', 'lt', 'gte', 'lte']), value: z.number() }).optional(),
  }).optional(),

  // Sorting
  sort: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc']),
  }).optional(),

  // Pagination
  limit: z.number().int().min(1).max(100).default(20),

  // Aggregation (for count/summary/trend intents)
  groupBy: z.string().optional(),        // namespace, cluster, node, workload
  metric: z.string().optional(),         // For trend intent: which metric to chart
});

type NLQuery = z.infer<typeof NLQuerySchema>;
```

### 4.4 Safety Guardrails

**Critical: All NL queries are READ-ONLY. The system CANNOT execute mutations.**

```typescript
// packages/backend/src/ai/nlq/safety.ts

/**
 * Safety validation applied to every NL query before execution.
 */
function validateNLQuery(query: NLQuery, user: User): void {
  // 1. HARD BLOCK: No mutations ever
  // The query schema only supports read operations.
  // There is no "delete", "update", "restart", "scale" in the intent enum.
  // The execution engine only calls tRPC query procedures, never mutations.

  // 2. Scope enforcement: queries are always scoped to the user's org
  // This is handled by the tRPC context middleware (org_id from JWT)
  // Even if the LLM somehow generates a cross-tenant query, RLS blocks it.

  // 3. Namespace access: respect RBAC
  // The execution engine passes the user context to tRPC calls.
  // Namespace-level permissions are enforced by the standard middleware.

  // 4. Rate limiting: LLM calls are expensive
  // Applied at the tRPC layer: 20 req/min per user (from ai.query rate limit)

  // 5. Query complexity limit
  if (query.limit > 100) {
    throw new Error('Query limit cannot exceed 100 results');
  }

  // 6. Time range limit: prevent full-history scans
  const maxTimeRange = '90d'; // Maximum lookback
  if (query.filters?.timeRange && parseTimeRange(query.filters.timeRange) > parseDuration(maxTimeRange)) {
    throw new Error(`Time range cannot exceed ${maxTimeRange}`);
  }
}
```

### 4.5 Prompt Engineering

```typescript
// packages/backend/src/ai/nlq/prompts.ts

const NL_QUERY_SYSTEM_PROMPT = `You are a Kubernetes query translator for the Voyager platform.

Your job: Convert natural language questions about Kubernetes infrastructure into structured JSON queries.

RULES:
1. Output ONLY valid JSON matching the query schema. No explanation, no markdown.
2. You can ONLY query. You cannot modify, delete, restart, or scale anything.
3. If the user asks to do something destructive, respond with:
   {"error": "I can only query data. I cannot modify resources."}
4. If the query is ambiguous, make reasonable assumptions and note them.
5. Time ranges: "last hour" = "1h", "today" = "24h", "this week" = "7d", "this month" = "30d"
6. Namespace "production" or "prod" should map to the actual namespace name.
7. "Crashed" pods = phase "Failed" or restartCount > 0 in the time window.
8. "Unhealthy" = status "warning" or "critical".
9. "Expensive" = sort by costPerDay desc.
10. "Vulnerable" = resource "vulnerabilities", filtered by severity.

AVAILABLE RESOURCES:
- pods: Kubernetes pods (filterable by phase, namespace, node, restarts, CPU/memory usage)
- deployments, statefulsets, daemonsets: Workload controllers
- nodes: Cluster nodes (filterable by status, CPU/memory usage)
- namespaces: K8s namespaces (with cost and resource data)
- events: Kubernetes events (filterable by type: Normal/Warning, reason)
- alerts: Platform alerts (filterable by severity, status, domain)
- costs: Cost data (filterable by namespace, workload, time range)
- vulnerabilities: CVE data (filterable by severity, image, fix availability)

QUERY SCHEMA:
${JSON.stringify(NLQuerySchemaDescription, null, 2)}

EXAMPLES:
User: "show me pods that crashed in the last hour in production"
Output: {"resource":"pods","intent":"list","filters":{"namespace":"production","restartCount":{"op":"gt","value":0},"timeRange":"1h"},"sort":{"field":"restartCount","order":"desc"},"limit":20}

User: "which namespace costs the most?"
Output: {"resource":"costs","intent":"top_n","filters":{"timeRange":"30d"},"sort":{"field":"costPerDay","order":"desc"},"groupBy":"namespace","limit":5}

User: "how many critical vulnerabilities do we have?"
Output: {"resource":"vulnerabilities","intent":"count","filters":{"severity":["critical"]}}

User: "delete the nginx deployment"
Output: {"error":"I can only query data. I cannot modify resources."}`;
```

### 4.6 Model Selection

| Use Case | Model | Rationale |
|----------|-------|-----------|
| NL → Query translation | Claude 3.5 Haiku | Fast (< 1s), cheap ($0.25/M input tokens), sufficient for structured output |
| Fallback | GPT-4o-mini | If Claude API is down |
| Local fallback (future) | Ollama + Llama 3.2 | For air-gapped deployments |

**Why Haiku, not Sonnet/Opus:** Query translation is a straightforward task — map natural language to a fixed JSON schema. Haiku handles this with >95% accuracy. The speed (< 500ms) and cost (10x cheaper than Sonnet) matter for interactive use.

### 4.7 Execution Engine

```typescript
// packages/backend/src/ai/nlq/executor.ts

/**
 * Takes a structured NLQuery and executes it against the appropriate tRPC service.
 * Returns formatted results that can be displayed in the UI or passed back to the LLM.
 */
async function executeNLQuery(
  query: NLQuery,
  ctx: TRPCContext,
): Promise<NLQueryResult> {
  // Map resource + intent to tRPC procedure
  const routeMap: Record<string, (q: NLQuery, ctx: TRPCContext) => Promise<any>> = {
    'pods:list':      (q, c) => podService.listPods(c.tenantId, c.user, mapPodFilters(q)),
    'pods:count':     (q, c) => podService.countPods(c.tenantId, c.user, mapPodFilters(q)),
    'pods:detail':    (q, c) => podService.getPod(c.tenantId, mapPodDetail(q)),
    'deployments:list': (q, c) => workloadService.listWorkloads(c.tenantId, c.user, { ...mapWorkloadFilters(q), kind: 'Deployment' }),
    'nodes:list':     (q, c) => clusterService.listNodes(c.tenantId, mapNodeFilters(q)),
    'costs:top_n':    (q, c) => costService.getCostByNamespace(c.tenantId, mapCostFilters(q)),
    'costs:trend':    (q, c) => costService.getCostTrend(c.tenantId, c.user, mapCostTrend(q)),
    'vulnerabilities:list':  (q, c) => securityService.listVulnerabilities(c.tenantId, c.user, mapVulnFilters(q)),
    'vulnerabilities:count': (q, c) => securityService.countVulnerabilities(c.tenantId, c.user, mapVulnFilters(q)),
    'alerts:list':    (q, c) => alertService.listAlerts(c.tenantId, c.user, mapAlertFilters(q)),
    'events:list':    (q, c) => eventService.listEvents(c.tenantId, mapEventFilters(q)),
    // ... more mappings
  };

  const key = `${query.resource}:${query.intent}`;
  const handler = routeMap[key];

  if (!handler) {
    return { error: `Unsupported query: ${key}`, results: [] };
  }

  const rawResults = await handler(query, ctx);
  return formatResults(query, rawResults);
}
```

---

## 5. Cost Optimization Recommendations

### 5.1 Overview

Automated recommendations for reducing Kubernetes costs. Phase 1 uses rule-based analysis comparing actual usage to requests/limits. No LLM needed.

### 5.2 Recommendation Types

#### Type 1: Right-Sizing (CPU/Memory)

```typescript
// packages/backend/src/ai/cost/rightsizing.ts

interface RightsizingRecommendation {
  workloadId: string;
  workloadName: string;
  namespace: string;
  clusterId: string;
  containerName: string;
  resource: 'cpu' | 'memory';
  currentRequest: number;         // Current request value
  currentLimit: number;           // Current limit value
  recommendedRequest: number;     // Suggested request
  recommendedLimit: number;       // Suggested limit
  actualP95Usage: number;         // P95 actual usage over analysis window
  actualP99Usage: number;         // P99 actual usage
  actualMax: number;              // Max usage observed
  savingsPerMonthUSD: number;     // Estimated monthly savings
  confidence: 'low' | 'medium' | 'high';
  analysisWindowDays: number;     // How many days of data analyzed
}

/**
 * Analyze resource usage over a time window and generate right-sizing recommendations.
 * 
 * Logic:
 * 1. Query P50, P95, P99, and MAX usage from pod_metrics over the analysis window
 * 2. Compare to current requests/limits
 * 3. If request > 2x P95 usage → "oversized" recommendation
 * 4. If P99 usage > 80% of limit → "undersized" warning
 * 5. Calculate savings based on the difference
 * 
 * Confidence levels:
 * - HIGH: ≥ 14 days of data, workload is stable (low variance)
 * - MEDIUM: 7-14 days of data
 * - LOW: < 7 days of data
 */
async function analyzeRightsizing(
  orgId: string,
  clusterId: string,
  analysisWindowDays: number = 14,
): Promise<RightsizingRecommendation[]> {
  const recommendations: RightsizingRecommendation[] = [];

  // Query aggregated usage statistics per workload per container
  const usageStats = await db.query(`
    SELECT
      pm.workload_id,
      w.name as workload_name,
      n.name as namespace_name,
      c.name as container_name,
      -- CPU stats (millicores)
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pm.cpu_usage_millicores) as cpu_p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.cpu_usage_millicores) as cpu_p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY pm.cpu_usage_millicores) as cpu_p99,
      MAX(pm.cpu_usage_millicores) as cpu_max,
      AVG(pm.cpu_request_millicores) as cpu_request,
      AVG(pm.cpu_limit_millicores) as cpu_limit,
      -- Memory stats (bytes)
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pm.memory_usage_bytes) as mem_p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.memory_usage_bytes) as mem_p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY pm.memory_usage_bytes) as mem_p99,
      MAX(pm.memory_usage_bytes) as mem_max,
      AVG(pm.memory_request_bytes) as mem_request,
      AVG(pm.memory_limit_bytes) as mem_limit,
      -- Data quality
      COUNT(*) as sample_count,
      COUNT(DISTINCT DATE(pm.time)) as days_with_data
    FROM pod_metrics pm
    JOIN workloads w ON pm.workload_id = w.id
    JOIN namespaces n ON pm.namespace_id = n.id
    JOIN containers c ON pm.pod_id = c.pod_id
    WHERE pm.org_id = $1
      AND pm.cluster_id = $2
      AND pm.time > NOW() - INTERVAL '${analysisWindowDays} days'
      AND pm.workload_id IS NOT NULL
    GROUP BY pm.workload_id, w.name, n.name, c.name
    HAVING COUNT(*) > 100  -- Minimum samples for meaningful analysis
  `, [orgId, clusterId]);

  for (const row of usageStats) {
    const daysWithData = row.days_with_data;
    const confidence = daysWithData >= 14 ? 'high' : daysWithData >= 7 ? 'medium' : 'low';

    // CPU right-sizing
    if (row.cpu_request > 0) {
      const cpuUsageRatio = row.cpu_p95 / row.cpu_request;

      if (cpuUsageRatio < 0.5) {
        // Oversized: using less than 50% of request at P95
        const recommendedRequest = Math.ceil(row.cpu_p95 * 1.3); // 30% headroom above P95
        const recommendedLimit = Math.ceil(row.cpu_p99 * 1.5);   // 50% headroom above P99
        const savedMillicores = row.cpu_request - recommendedRequest;
        const savingsPerMonth = calculateCPUSavings(savedMillicores, clusterId);

        if (savingsPerMonth > 1.0) { // Only recommend if savings > $1/month
          recommendations.push({
            workloadId: row.workload_id,
            workloadName: row.workload_name,
            namespace: row.namespace_name,
            clusterId,
            containerName: row.container_name,
            resource: 'cpu',
            currentRequest: row.cpu_request,
            currentLimit: row.cpu_limit,
            recommendedRequest,
            recommendedLimit,
            actualP95Usage: row.cpu_p95,
            actualP99Usage: row.cpu_p99,
            actualMax: row.cpu_max,
            savingsPerMonthUSD: savingsPerMonth,
            confidence,
            analysisWindowDays: daysWithData,
          });
        }
      }
    }

    // Memory right-sizing (similar logic, more conservative due to OOM risk)
    if (row.mem_request > 0) {
      const memUsageRatio = row.mem_p95 / row.mem_request;

      if (memUsageRatio < 0.4) {
        // Oversized: using less than 40% of request at P95 (more conservative for memory)
        const recommendedRequest = Math.ceil(row.mem_p95 * 1.4); // 40% headroom
        const recommendedLimit = Math.ceil(row.mem_p99 * 1.6);   // 60% headroom (OOM kills are expensive)
        const savedBytes = row.mem_request - recommendedRequest;
        const savingsPerMonth = calculateMemorySavings(savedBytes, clusterId);

        if (savingsPerMonth > 1.0) {
          recommendations.push({
            workloadId: row.workload_id,
            workloadName: row.workload_name,
            namespace: row.namespace_name,
            clusterId,
            containerName: row.container_name,
            resource: 'memory',
            currentRequest: row.mem_request,
            currentLimit: row.mem_limit,
            recommendedRequest,
            recommendedLimit,
            actualP95Usage: row.mem_p95,
            actualP99Usage: row.mem_p99,
            actualMax: row.mem_max,
            savingsPerMonthUSD: savingsPerMonth,
            confidence,
            analysisWindowDays: daysWithData,
          });
        }
      }
    }
  }

  return recommendations.sort((a, b) => b.savingsPerMonthUSD - a.savingsPerMonthUSD);
}
```

#### Type 2: Idle Resource Detection

```typescript
// Idle detection criteria (from product strategy waste definitions):
const IDLE_CRITERIA = {
  // Idle pods: CPU usage < 5% for 24+ hours
  pod: {
    cpuThresholdPercent: 5,
    durationHours: 24,
    excludeNamespaces: ['kube-system', 'kube-public', 'monitoring'],
    excludeWorkloadKinds: ['DaemonSet'], // DaemonSets are expected to be low-usage
  },

  // Orphaned PVCs: PersistentVolumeClaim not mounted by any pod
  pvc: {
    unmountedDurationHours: 168, // 7 days
  },

  // Orphaned services: Service with no matching endpoints
  service: {
    noEndpointsDurationHours: 168, // 7 days
  },

  // Abandoned workloads: zero traffic (network rx+tx = 0) for 7+ days
  workload: {
    zeroTrafficDurationDays: 7,
  },
};
```

#### Type 3: Spot Instance Recommendations

```typescript
// Analyze workload characteristics to identify spot-eligible workloads
interface SpotRecommendation {
  nodeGroupName: string;
  currentInstanceType: string;
  currentMonthlyCost: number;
  spotMonthlyCost: number;          // estimated spot price
  savingsPercent: number;            // typically 60-80%
  spotInterruptionRisk: 'low' | 'medium' | 'high';
  eligibilityReason: string;
  workloadsOnNode: Array<{
    name: string;
    stateless: boolean;              // stateless = spot-safe
    replicaCount: number;            // multi-replica = spot-safe
    hasPDB: boolean;                 // PDB with minAvailable = partially spot-safe
  }>;
}

// Logic:
// 1. Identify node groups running stateless workloads with replicas > 1
// 2. Check if workloads have PodDisruptionBudgets
// 3. Verify no PersistentVolumes tied to these nodes
// 4. Calculate savings using AWS/Azure spot pricing APIs
// 5. Assign risk level based on interruption frequency data
```

### 5.3 Recommendation Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Generated │ ──→ │ Active    │ ──→ │ Accepted │ ──→ │ Applied  │
│           │     │ (visible) │     │ (user    │     │ (changes │
│           │     │           │     │  clicked) │     │  verified)│
└──────────┘     └──────┬────┘     └──────────┘     └──────────┘
                        │
                        │──→ ┌──────────┐
                             │ Dismissed │
                             │ (user     │
                             │  rejected)│
                             └──────────┘
```

Recommendations are regenerated every hour (BullMQ job). Dismissed recommendations are not regenerated for 30 days unless conditions change significantly.

Tracked in the `optimization_recommendations` table (see schema additions below).

---

## 6. Security Intelligence

### 6.1 Exploitability Scoring

Not all CVEs are equal. A critical CVE in a package that's never loaded at runtime is less urgent than a medium CVE in an actively used networking library with known exploits.

```typescript
// packages/backend/src/ai/security/exploitability-scorer.ts

interface ExploitabilityScore {
  vulnId: string;                    // CVE ID
  baseScore: number;                 // Raw CVSS score (0-10)
  adjustedScore: number;             // Adjusted for context (0-10)
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  factors: ExploitabilityFactor[];   // What influenced the score
}

interface ExploitabilityFactor {
  factor: string;
  impact: number;                    // Score adjustment (-5 to +5)
  description: string;
}

/**
 * Calculate exploitability score by combining:
 * 1. Base CVSS score (from vulnerability database)
 * 2. Runtime context (is the package actually loaded?)
 * 3. Network exposure (is the pod internet-facing?)
 * 4. Exploit availability (are there known exploits in the wild?)
 * 5. Fix availability (is there a patched version?)
 * 6. Blast radius (how many pods are affected?)
 */
function calculateExploitabilityScore(
  vuln: VulnerabilityScan,
  runtimeContext: RuntimeContext,
): ExploitabilityScore {
  let score = vuln.cvss_score ?? severityToBaseScore(vuln.severity);
  const factors: ExploitabilityFactor[] = [];

  // Factor 1: Runtime usage (biggest impact)
  // Phase 2 feature: Voyager Monitor tracks which packages are actually loaded
  if (runtimeContext.packageInUse === true) {
    factors.push({
      factor: 'package_in_use',
      impact: +1.5,
      description: 'Vulnerable package is actively loaded at runtime',
    });
    score += 1.5;
  } else if (runtimeContext.packageInUse === false) {
    factors.push({
      factor: 'package_not_in_use',
      impact: -3.0,
      description: 'Vulnerable package is installed but NOT loaded at runtime',
    });
    score -= 3.0;
  }
  // If runtime data unavailable (Phase 1), no adjustment.

  // Factor 2: Network exposure
  if (runtimeContext.isInternetFacing) {
    factors.push({
      factor: 'internet_facing',
      impact: +1.0,
      description: 'Workload is exposed to the internet via LoadBalancer or Ingress',
    });
    score += 1.0;
  } else if (runtimeContext.isInternalOnly) {
    factors.push({
      factor: 'internal_only',
      impact: -0.5,
      description: 'Workload is only accessible within the cluster network',
    });
    score -= 0.5;
  }

  // Factor 3: Known exploits
  if (vuln.exploitable) {
    factors.push({
      factor: 'known_exploit',
      impact: +2.0,
      description: 'Known exploit exists in the wild',
    });
    score += 2.0;
  }

  // Factor 4: Fix availability
  if (vuln.fixed_version) {
    factors.push({
      factor: 'fix_available',
      impact: -0.5,
      description: `Fix available: upgrade to ${vuln.fixed_version}`,
    });
    score -= 0.5;
  } else {
    factors.push({
      factor: 'no_fix',
      impact: +0.5,
      description: 'No fix available — must use alternative mitigation',
    });
    score += 0.5;
  }

  // Factor 5: Blast radius
  if (vuln.affected_pod_count > 10) {
    factors.push({
      factor: 'high_blast_radius',
      impact: +1.0,
      description: `${vuln.affected_pod_count} pods running this vulnerable image`,
    });
    score += 1.0;
  }

  // Clamp to 0-10
  const adjustedScore = Math.max(0, Math.min(10, score));

  return {
    vulnId: vuln.vuln_id,
    baseScore: vuln.cvss_score ?? 0,
    adjustedScore,
    riskLevel: scoreToRiskLevel(adjustedScore),
    factors,
  };
}

function scoreToRiskLevel(score: number): ExploitabilityScore['riskLevel'] {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 2.0) return 'low';
  return 'negligible';
}
```

### 6.2 Security-Cost Correlation

Unique to Voyager — connecting security findings with cost impact:

```typescript
/**
 * For a given vulnerability, estimate the cost of remediation vs. cost of exploitation.
 * This helps teams prioritize patching decisions.
 */
function estimateSecurityCostImpact(
  vuln: VulnerabilityScan,
  affectedWorkloads: Workload[],
  costData: ResourceCost[],
): SecurityCostImpact {
  // Cost of affected workloads (what's at risk if exploited)
  const monthlyValueAtRisk = costData
    .filter(c => affectedWorkloads.some(w => w.id === c.workload_id))
    .reduce((sum, c) => sum + c.total_cost_usd * 30, 0);

  // Estimated remediation cost (downtime for rolling update)
  const estimatedDowntimeMinutes = affectedWorkloads
    .reduce((sum, w) => sum + (w.desired_replicas > 1 ? 0 : 5), 0); // 0 for multi-replica, 5 min for single

  return {
    monthlyValueAtRisk,
    estimatedRemediationDowntimeMinutes: estimatedDowntimeMinutes,
    recommendation: monthlyValueAtRisk > 1000
      ? 'High-value workload at risk. Prioritize patching immediately.'
      : 'Lower-value workload. Schedule patching in next maintenance window.',
  };
}
```

---

## 7. LLM Integration Layer

### 7.1 Provider Abstraction

```typescript
// packages/backend/src/ai/llm/provider.ts

/**
 * Provider-agnostic LLM interface.
 * Supports hot-swapping between Claude, GPT, and local models.
 */
interface LLMProvider {
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  streamComplete(request: LLMCompletionRequest): AsyncGenerator<string>;
  getUsage(): TokenUsage;
}

interface LLMCompletionRequest {
  model: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  temperature?: number;             // 0.0-1.0 (default 0.3 for factual tasks)
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
}

interface LLMCompletionResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD: number;
  };
  finishReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  latencyMs: number;
}

interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  requestCount: number;
  periodStart: Date;
}
```

### 7.2 Provider Implementations

```typescript
// packages/backend/src/ai/llm/providers/anthropic.ts

class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private usage: TokenUsage;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.usage = { totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0, requestCount: 0, periodStart: new Date() };
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    const response = await this.client.messages.create({
      model: request.model,  // 'claude-3-5-haiku-latest' or 'claude-sonnet-4-20250514'
      system: request.system,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.3,
    });

    const cost = this.calculateCost(
      request.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    this.usage.totalInputTokens += response.usage.input_tokens;
    this.usage.totalOutputTokens += response.usage.output_tokens;
    this.usage.totalCostUSD += cost;
    this.usage.requestCount += 1;

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        estimatedCostUSD: cost,
      },
      finishReason: response.stop_reason === 'end_turn' ? 'end_turn' : 'max_tokens',
      latencyMs: Date.now() - startTime,
    };
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing as of early 2026
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-haiku-latest':   { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
      'claude-sonnet-4-20250514':  { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    };
    const p = pricing[model] ?? pricing['claude-3-5-haiku-latest'];
    return inputTokens * p.input + outputTokens * p.output;
  }
}

// packages/backend/src/ai/llm/providers/openai.ts
class OpenAIProvider implements LLMProvider {
  // Similar implementation wrapping the OpenAI SDK
  // Models: 'gpt-4o-mini' (fast/cheap), 'gpt-4o' (capable)
}
```

### 7.3 Routing & Fallback

```typescript
// packages/backend/src/ai/llm/router.ts

interface LLMRouterConfig {
  primary: { provider: 'anthropic'; apiKey: string; model: string };
  fallback: { provider: 'openai'; apiKey: string; model: string };
  maxRetries: number;
  retryDelayMs: number;
}

class LLMRouter {
  private primary: LLMProvider;
  private fallback: LLMProvider;

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    try {
      return await this.primary.complete(request);
    } catch (error) {
      // Log primary failure
      logger.warn('Primary LLM provider failed, falling back', {
        error: error.message,
        model: request.model,
      });

      // Try fallback
      try {
        return await this.fallback.complete({
          ...request,
          model: this.mapModelToFallback(request.model),
        });
      } catch (fallbackError) {
        logger.error('Both LLM providers failed', {
          primaryError: error.message,
          fallbackError: fallbackError.message,
        });
        throw new Error('AI service temporarily unavailable');
      }
    }
  }

  private mapModelToFallback(model: string): string {
    const mapping: Record<string, string> = {
      'claude-3-5-haiku-latest': 'gpt-4o-mini',
      'claude-sonnet-4-20250514': 'gpt-4o',
    };
    return mapping[model] ?? 'gpt-4o-mini';
  }
}
```

### 7.4 Response Caching

```typescript
// packages/backend/src/ai/llm/cache.ts

/**
 * Cache LLM responses for identical queries.
 * 
 * Strategy:
 * - NL queries: cache for 60 seconds (same question = same answer)
 * - RCA summaries: cache for 5 minutes (same alert = same summary)
 * - Suggestions: cache for 30 minutes (suggestions change slowly)
 * 
 * Cache key: SHA-256 of (system prompt + user messages + model)
 * Storage: Redis with TTL
 */
class LLMCache {
  private redis: Redis;

  async get(request: LLMCompletionRequest): Promise<LLMCompletionResponse | null> {
    const key = this.buildKey(request);
    const cached = await this.redis.get(`llm:cache:${key}`);
    if (cached) {
      const response = JSON.parse(cached) as LLMCompletionResponse;
      response.usage.estimatedCostUSD = 0; // Cached = free
      return response;
    }
    return null;
  }

  async set(
    request: LLMCompletionRequest,
    response: LLMCompletionResponse,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.buildKey(request);
    await this.redis.setex(`llm:cache:${key}`, ttlSeconds, JSON.stringify(response));
  }

  private buildKey(request: LLMCompletionRequest): string {
    const payload = JSON.stringify({
      model: request.model,
      system: request.system,
      messages: request.messages,
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}
```

---

## 8. Data Privacy & Cost Control

### 8.1 What Gets Sent to External LLMs

**NEVER sent:**
- Raw container logs
- Environment variables or secrets
- Application-specific data (database queries, API responses)
- Customer PII
- Auth tokens, API keys, certificates
- Raw JSONB metadata from K8s labels/annotations

**ALWAYS sanitized before sending:**
- Pod names → sent as-is (pod names are not sensitive)
- Namespace names → sent as-is
- Metric values → sent as-is (numbers without context aren't sensitive)
- Event descriptions → sanitized (remove any embedded log lines)
- Image names → sent as-is (registry/repo:tag)

**Explicitly sent:**
- Metric names and values (cpu_usage: 85%)
- K8s event summaries (reason: OOMKilled, count: 3)
- Alert conditions and thresholds
- Resource relationships (deployment X → pod Y → node Z)
- Cost figures (aggregate, not per-transaction)
- CVE IDs and severity scores
- Time-relative references ("5 minutes before alert")

### 8.2 Token Budget System

```typescript
// packages/backend/src/ai/budget/token-budget.ts

interface TokenBudget {
  orgId: string;
  plan: string;
  // Monthly token limits by plan
  monthlyTokenLimit: number;
  // Current usage
  currentMonthTokens: number;
  currentMonthCostUSD: number;
  // Per-request limits
  maxTokensPerRequest: number;
}

const PLAN_BUDGETS: Record<string, { monthlyTokens: number; maxPerRequest: number }> = {
  free:       { monthlyTokens: 50_000,     maxPerRequest: 2_000  },   // ~$0.05/month
  team:       { monthlyTokens: 500_000,    maxPerRequest: 4_000  },   // ~$0.50/month
  pro:        { monthlyTokens: 5_000_000,  maxPerRequest: 8_000  },   // ~$5/month
  enterprise: { monthlyTokens: 50_000_000, maxPerRequest: 16_000 },   // ~$50/month
};

/**
 * Check if a request is within budget before making the LLM call.
 * If over budget, return a graceful degradation response.
 */
async function checkBudget(orgId: string, estimatedTokens: number): Promise<BudgetResult> {
  const budget = await loadBudget(orgId);
  const remaining = budget.monthlyTokenLimit - budget.currentMonthTokens;

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: 'Monthly AI token budget exceeded. AI features will resume next month. ' +
              'The platform continues to work fully — only AI-enhanced features (natural language queries, ' +
              'AI summaries) are paused.',
    };
  }

  if (estimatedTokens > budget.maxTokensPerRequest) {
    return {
      allowed: false,
      reason: `Request too large (${estimatedTokens} tokens). Maximum per request: ${budget.maxTokensPerRequest}.`,
    };
  }

  return { allowed: true };
}

/**
 * Track token usage after each LLM call.
 */
async function trackUsage(orgId: string, usage: LLMCompletionResponse['usage']): Promise<void> {
  const key = `ai:budget:${orgId}:${getCurrentMonth()}`;
  await redis.hincrby(key, 'tokens', usage.totalTokens);
  await redis.hincrbyfloat(key, 'cost_usd', usage.estimatedCostUSD);
  await redis.hincrby(key, 'requests', 1);
  // Expire at end of month + 7 days (for billing review)
  await redis.expireat(key, getEndOfMonth().getTime() / 1000 + 7 * 86400);
}
```

### 8.3 Rate Limiting (LLM-specific)

Applied on top of general API rate limits:

| Operation | Rate Limit | Reason |
|-----------|-----------|--------|
| `ai.query` (NL query) | 20/min per user | Each call = 1 LLM request (~$0.001) |
| `ai.investigate` (RCA) | 10/min per user | Each call = 1-3 LLM requests (~$0.01) |
| `ai.suggest` (suggestions) | 10/min per user | Usually cached; fresh generation is expensive |
| Background anomaly detection | N/A (no LLM in Phase 1) | Statistical only, no token cost |
| Background RCA correlation | N/A (no LLM in Phase 1) | Rule-based correlation, no token cost |

### 8.4 Graceful Degradation

When AI features are unavailable (LLM down, budget exceeded, AI disabled by user):

| Feature | Without AI | User Experience |
|---------|-----------|-----------------|
| Anomaly detection | ✅ Works fully | Statistical detection runs 100% locally. No LLM needed. |
| Alert firing | ✅ Works fully | Alerts are threshold/anomaly-based, not LLM-based. |
| RCA correlation | ✅ Works fully (Phase 1) | Rule-based correlation runs locally. |
| RCA summary (Phase 2) | ⚠️ Falls back to template | Template-generated summary instead of LLM natural language. |
| NL queries (Phase 2) | ❌ Unavailable | Show message: "AI queries temporarily unavailable. Use the search and filter UI." |
| Cost recommendations | ✅ Works fully | Rule-based analysis. No LLM needed. |
| Security scoring | ✅ Works fully | Algorithm-based. No LLM needed. |
| AI suggestions | ⚠️ Falls back to rule-based | Pre-computed suggestions still available. No natural language polish. |

---

## 9. Database Schema Additions

New tables required for AI features, added to the existing schema:

```sql
-- =============================================================================
-- MIGRATION 012: AI/ML Feature Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ANOMALY_DETECTIONS
-- Records every detected anomaly. Used for:
-- 1. Alerting (anomaly-based alert rules check this table)
-- 2. RCA correlation (recent anomalies correlated with alerts)
-- 3. Dashboard display (anomaly markers on metric charts)
-- 4. False positive tracking (user dismissals improve future detection)
-- Hypertable: time-series, high volume.
-- -----------------------------------------------------------------------------
CREATE TABLE anomaly_detections (
    time                    TIMESTAMPTZ NOT NULL,
    org_id                  UUID NOT NULL,
    cluster_id              UUID NOT NULL,
    -- What was anomalous
    resource_type           VARCHAR(50) NOT NULL,            -- node, pod, workload, namespace, cluster
    resource_id             UUID NOT NULL,                   -- ID of the affected resource
    resource_name           VARCHAR(255) NOT NULL,            -- Name for display
    namespace_name          VARCHAR(255),
    metric_name             VARCHAR(100) NOT NULL,            -- cpu_usage_percent, memory_usage_bytes, etc.
    -- Detection results
    observed_value          DOUBLE PRECISION NOT NULL,       -- Actual value
    expected_value          DOUBLE PRECISION NOT NULL,        -- Expected (baseline) value
    z_score                 REAL NOT NULL,                    -- Z-score of the deviation
    severity                alert_severity NOT NULL,          -- warning, critical
    direction               VARCHAR(10) NOT NULL,             -- above, below
    -- Detection method
    detector                VARCHAR(50) NOT NULL,             -- ema, seasonal, rate_of_change, consensus
    seasonal_bucket         INTEGER,                          -- If seasonal: which hour-of-week bucket
    rate_of_change          REAL,                             -- If rate: current rate value
    -- State
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,    -- Still ongoing?
    resolved_at             TIMESTAMPTZ,                      -- When the anomaly resolved
    -- User feedback
    user_dismissed          BOOLEAN NOT NULL DEFAULT FALSE,   -- User marked as false positive
    dismissed_by            UUID,                             -- Who dismissed it
    dismissed_at            TIMESTAMPTZ
);

SELECT create_hypertable('anomaly_detections', by_range('time'));
SELECT add_dimension('anomaly_detections', by_hash('cluster_id', 4));

CREATE INDEX idx_anomaly_org_cluster ON anomaly_detections (org_id, cluster_id, time DESC);
CREATE INDEX idx_anomaly_resource ON anomaly_detections (resource_type, resource_id, time DESC);
CREATE INDEX idx_anomaly_metric ON anomaly_detections (metric_name, time DESC);
CREATE INDEX idx_anomaly_active ON anomaly_detections (org_id, is_active, time DESC)
    WHERE is_active = TRUE;
CREATE INDEX idx_anomaly_severity ON anomaly_detections (org_id, severity, time DESC);

ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_detections_isolation ON anomaly_detections
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- Compression: after 1 day
ALTER TABLE anomaly_detections SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id, cluster_id, resource_type',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('anomaly_detections', INTERVAL '1 day');

-- Retention: 90 days
SELECT add_retention_policy('anomaly_detections', INTERVAL '90 days');

COMMENT ON TABLE anomaly_detections IS 'Records of detected metric anomalies. Fed by the anomaly detection engine, consumed by alert rules, RCA engine, and dashboard.';

-- -----------------------------------------------------------------------------
-- SEASONAL_PROFILES
-- Stores the seasonal (hour-of-week) baseline for each metric/resource pair.
-- 168 buckets per profile (24 hours × 7 days).
-- Regular PostgreSQL table (not hypertable — updated in place, not time-series).
-- -----------------------------------------------------------------------------
CREATE TABLE seasonal_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID NOT NULL,
    metric_name     VARCHAR(100) NOT NULL,
    -- 168 buckets: [{ mean, variance, count }]
    buckets         JSONB NOT NULL DEFAULT '[]',
    min_samples     INTEGER NOT NULL DEFAULT 14,          -- Samples per bucket before activation
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, cluster_id, resource_type, resource_id, metric_name)
);

CREATE INDEX idx_seasonal_profiles_org_cluster ON seasonal_profiles (org_id, cluster_id);
CREATE INDEX idx_seasonal_profiles_resource ON seasonal_profiles (resource_type, resource_id);

ALTER TABLE seasonal_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY seasonal_profiles_isolation ON seasonal_profiles
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE seasonal_profiles IS 'Hour-of-week seasonal baselines for anomaly detection. 168 buckets per metric/resource pair.';

-- -----------------------------------------------------------------------------
-- RCA_INVESTIGATIONS
-- Records root cause analysis investigations triggered by alerts.
-- Stores the full investigation result for display and audit.
-- Regular PostgreSQL table.
-- -----------------------------------------------------------------------------
CREATE TABLE rca_investigations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_id        UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    -- Investigation results
    status          VARCHAR(50) NOT NULL DEFAULT 'running', -- running, completed, failed
    probable_cause  JSONB,                                  -- { description, confidence, category, evidence[] }
    correlated_events JSONB NOT NULL DEFAULT '[]',          -- Array of correlated events with scores
    timeline        JSONB NOT NULL DEFAULT '[]',            -- Chronological event timeline
    cross_domain_insights JSONB NOT NULL DEFAULT '[]',      -- Cross-domain insights
    recommendations JSONB NOT NULL DEFAULT '[]',            -- Recommended actions
    -- LLM summary (Phase 2)
    llm_summary     TEXT,                                   -- Natural language summary from LLM
    llm_model       VARCHAR(100),                           -- Model used for summary
    llm_tokens_used INTEGER,                                -- Tokens consumed
    -- Metadata
    time_window_before_minutes INTEGER NOT NULL DEFAULT 30,
    time_window_after_minutes INTEGER NOT NULL DEFAULT 5,
    investigation_duration_ms INTEGER,                       -- How long the investigation took
    -- User feedback
    user_rating     INTEGER,                                 -- 1-5 star rating from user
    user_feedback   TEXT,                                    -- Free-text feedback
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rca_org ON rca_investigations (org_id, created_at DESC);
CREATE INDEX idx_rca_alert ON rca_investigations (alert_id);
CREATE INDEX idx_rca_cluster ON rca_investigations (cluster_id, created_at DESC);
CREATE INDEX idx_rca_status ON rca_investigations (org_id, status);

ALTER TABLE rca_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY rca_investigations_isolation ON rca_investigations
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

CREATE TRIGGER trg_rca_investigations_updated_at
    BEFORE UPDATE ON rca_investigations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE rca_investigations IS 'Root cause analysis investigations. One per alert. Stores correlated events, probable cause, and recommendations.';

-- -----------------------------------------------------------------------------
-- OPTIMIZATION_RECOMMENDATIONS
-- Cost optimization, right-sizing, and efficiency recommendations.
-- Generated periodically by the cost optimization engine.
-- Regular PostgreSQL table with lifecycle tracking.
-- -----------------------------------------------------------------------------
CREATE TABLE optimization_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cluster_id      UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    -- What to optimize
    recommendation_type VARCHAR(100) NOT NULL,               -- rightsizing_cpu, rightsizing_memory, idle_pod,
                                                             -- orphaned_pvc, orphaned_service, spot_instance,
                                                             -- abandoned_workload
    -- Affected resource
    resource_type   VARCHAR(50) NOT NULL,                    -- workload, pod, pvc, service, node_group
    resource_id     UUID,
    resource_name   VARCHAR(255) NOT NULL,
    namespace_name  VARCHAR(255),
    -- Recommendation details
    title           VARCHAR(500) NOT NULL,                   -- Human-readable title
    description     TEXT NOT NULL,                            -- Detailed explanation
    current_value   JSONB NOT NULL DEFAULT '{}',             -- { cpu_request: 1000, cpu_p95: 200, ... }
    recommended_value JSONB NOT NULL DEFAULT '{}',           -- { cpu_request: 300, ... }
    -- Impact
    estimated_savings_monthly_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
    confidence      VARCHAR(20) NOT NULL DEFAULT 'medium',   -- low, medium, high
    risk_level      VARCHAR(20) NOT NULL DEFAULT 'low',      -- none, low, medium, high
    -- Lifecycle
    status          VARCHAR(50) NOT NULL DEFAULT 'active',   -- active, accepted, applied, dismissed, expired
    dismissed_at    TIMESTAMPTZ,
    dismissed_by    UUID REFERENCES users(id),
    dismissed_reason TEXT,
    accepted_at     TIMESTAMPTZ,
    accepted_by     UUID REFERENCES users(id),
    applied_at      TIMESTAMPTZ,
    -- Metadata
    analysis_window_days INTEGER NOT NULL DEFAULT 14,        -- Days of data used for this recommendation
    expires_at      TIMESTAMPTZ,                             -- Recommendation expires if not acted on
    -- De-duplication
    fingerprint     VARCHAR(255) NOT NULL,                   -- Hash of (type + resource + recommendation)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opt_rec_org ON optimization_recommendations (org_id, status, created_at DESC);
CREATE INDEX idx_opt_rec_cluster ON optimization_recommendations (cluster_id, status);
CREATE INDEX idx_opt_rec_type ON optimization_recommendations (recommendation_type, status);
CREATE INDEX idx_opt_rec_savings ON optimization_recommendations (estimated_savings_monthly_usd DESC)
    WHERE status = 'active';
CREATE INDEX idx_opt_rec_fingerprint ON optimization_recommendations (org_id, fingerprint);

ALTER TABLE optimization_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY opt_rec_isolation ON optimization_recommendations
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

CREATE TRIGGER trg_opt_rec_updated_at
    BEFORE UPDATE ON optimization_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE optimization_recommendations IS 'Cost optimization recommendations with lifecycle tracking. Generated by the optimization engine, acted on by users.';

-- -----------------------------------------------------------------------------
-- AI_SESSIONS
-- Tracks AI conversation sessions for multi-turn natural language queries.
-- Phase 2 feature.
-- Regular PostgreSQL table.
-- -----------------------------------------------------------------------------
CREATE TABLE ai_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Session context
    cluster_id      UUID REFERENCES clusters(id) ON DELETE SET NULL,
    namespace       VARCHAR(255),
    -- Conversation history
    messages        JSONB NOT NULL DEFAULT '[]',             -- [{role, content, timestamp}]
    -- Usage tracking
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    total_cost_usd  NUMERIC(10, 6) NOT NULL DEFAULT 0,
    request_count   INTEGER NOT NULL DEFAULT 0,
    -- Metadata
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,                    -- Auto-expire after 1 hour of inactivity
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_sessions_org_user ON ai_sessions (org_id, user_id, last_active_at DESC);
CREATE INDEX idx_ai_sessions_expires ON ai_sessions (expires_at) WHERE expires_at > NOW();

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_sessions_isolation ON ai_sessions
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

COMMENT ON TABLE ai_sessions IS 'AI conversation sessions for multi-turn natural language queries. Phase 2 feature. Auto-expires after 1h inactivity.';

-- -----------------------------------------------------------------------------
-- LLM_USAGE_LOG
-- Audit log of all LLM API calls. Used for cost tracking, debugging, and
-- identifying prompt injection attempts.
-- Hypertable for time-series analysis of AI cost.
-- -----------------------------------------------------------------------------
CREATE TABLE llm_usage_log (
    time            TIMESTAMPTZ NOT NULL,
    org_id          UUID NOT NULL,
    user_id         UUID,                                    -- NULL for background AI tasks
    -- Request details
    feature         VARCHAR(100) NOT NULL,                   -- nl_query, rca_summary, suggestion_generation
    model           VARCHAR(100) NOT NULL,                   -- claude-3-5-haiku, gpt-4o-mini, etc.
    provider        VARCHAR(50) NOT NULL,                    -- anthropic, openai
    -- Token usage
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    total_tokens    INTEGER NOT NULL,
    estimated_cost_usd NUMERIC(10, 6) NOT NULL,
    -- Performance
    latency_ms      INTEGER NOT NULL,
    -- Outcome
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    error_type      VARCHAR(100),                            -- rate_limited, timeout, invalid_response, etc.
    -- Cache
    cache_hit       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Safety
    input_hash      VARCHAR(64) NOT NULL                     -- SHA-256 of input (for detecting repeated queries without storing content)
);

SELECT create_hypertable('llm_usage_log', by_range('time'));

CREATE INDEX idx_llm_usage_org ON llm_usage_log (org_id, time DESC);
CREATE INDEX idx_llm_usage_feature ON llm_usage_log (feature, time DESC);
CREATE INDEX idx_llm_usage_model ON llm_usage_log (model, time DESC);

ALTER TABLE llm_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY llm_usage_log_isolation ON llm_usage_log
    FOR ALL TO voyager_app
    USING (org_id = current_org_id())
    WITH CHECK (org_id = current_org_id());

-- Compression after 1 day
ALTER TABLE llm_usage_log SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'org_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('llm_usage_log', INTERVAL '1 day');

-- Retention: 365 days (billing audit trail)
SELECT add_retention_policy('llm_usage_log', INTERVAL '365 days');

COMMENT ON TABLE llm_usage_log IS 'Audit log of all LLM API calls. Tracks cost, performance, and safety metrics. No request/response content stored.';
```

---

## 10. API Additions

### 10.1 New tRPC Procedures for AI

These extend the existing `aiRouter` defined in the API spec:

```typescript
// Additions to src/trpc/routers/ai.ts

// ─── ai.anomalies ────────────────────────────────────────────────────────
// Lists detected anomalies for a cluster/resource.
// Auth: authenticated
// Rate limit: 60 req/min
// Cache: 10s TTL
anomalies: protectedProcedure
  .input(z.object({
    clusterId: ClusterIdSchema,
    resourceType: z.enum(['node', 'pod', 'workload', 'namespace']).optional(),
    resourceId: z.string().uuid().optional(),
    metricName: z.string().optional(),
    severity: z.array(z.enum(['warning', 'critical'])).optional(),
    activeOnly: z.boolean().default(true),
    timeRange: TimeRangeInput.optional(),
    ...CursorPaginationInput.shape,
  }))
  .output(z.object({
    items: z.array(z.object({
      id: z.string(),
      time: z.coerce.date(),
      resourceType: z.string(),
      resourceName: z.string(),
      namespaceName: z.string().nullable(),
      metricName: z.string(),
      observedValue: z.number(),
      expectedValue: z.number(),
      zScore: z.number(),
      severity: z.string(),
      direction: z.string(),
      detector: z.string(),
      isActive: z.boolean(),
    })),
    nextCursor: z.string().nullable(),
    summary: z.object({
      total: z.number().int(),
      activeWarnings: z.number().int(),
      activeCritical: z.number().int(),
      byMetric: z.record(z.string(), z.number().int()),
    }),
  }))
  .query(async ({ ctx, input }) => {
    await assertClusterAccess(ctx.user, input.clusterId);
    return aiService.listAnomalies(ctx.tenantId, input);
  }),

// ─── ai.anomalyFeedback ────────────────────────────────────────────────
// Mark an anomaly as false positive (improves future detection).
// Auth: authenticated
// Rate limit: 60 req/min
anomalyFeedback: protectedProcedure
  .input(z.object({
    anomalyId: z.string().uuid(),
    isFalsePositive: z.boolean(),
    feedback: z.string().max(500).optional(),
  }))
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    return aiService.submitAnomalyFeedback(ctx.tenantId, ctx.user.id, input);
  }),

// ─── ai.rcaResult ─────────────────────────────────────────────────────
// Get the RCA investigation result for an alert.
// Auth: authenticated
// Rate limit: 60 req/min
// Cache: 30s TTL
rcaResult: protectedProcedure
  .input(z.object({
    alertId: z.string().uuid(),
  }))
  .output(z.object({
    investigation: z.object({
      id: z.string(),
      status: z.enum(['running', 'completed', 'failed']),
      probableCause: z.object({
        description: z.string(),
        confidence: z.number(),
        category: z.string(),
        evidence: z.array(z.string()),
      }).nullable(),
      timeline: z.array(z.object({
        timestamp: z.coerce.date(),
        source: z.string(),
        description: z.string(),
        relevanceScore: z.number(),
      })),
      crossDomainInsights: z.array(z.object({
        domains: z.array(z.string()),
        insight: z.string(),
      })),
      recommendations: z.array(z.object({
        action: z.string(),
        description: z.string(),
        risk: z.string(),
        automated: z.boolean(),
      })),
      llmSummary: z.string().nullable(), // Phase 2
      investigationDurationMs: z.number().nullable(),
    }).nullable(),
  }))
  .query(async ({ ctx, input }) => {
    return aiService.getRCAResult(ctx.tenantId, input.alertId);
  }),

// ─── ai.recommendations ──────────────────────────────────────────────
// Get active cost optimization recommendations.
// Auth: authenticated
// Rate limit: 30 req/min
// Cache: 5min TTL
recommendations: protectedProcedure
  .input(z.object({
    clusterId: ClusterIdSchema.optional(),
    namespace: z.string().optional(),
    type: z.enum([
      'rightsizing_cpu', 'rightsizing_memory', 'idle_pod',
      'orphaned_pvc', 'orphaned_service', 'spot_instance',
      'abandoned_workload',
    ]).optional(),
    minSavings: z.number().optional(),
    status: z.enum(['active', 'accepted', 'applied', 'dismissed']).default('active'),
    sort: z.object({
      field: z.enum(['savings', 'confidence', 'createdAt', 'type']),
      order: z.enum(['asc', 'desc']).default('desc'),
    }).optional(),
    ...CursorPaginationInput.shape,
  }))
  .output(z.object({
    items: z.array(z.object({
      id: z.string(),
      type: z.string(),
      resourceName: z.string(),
      namespaceName: z.string().nullable(),
      title: z.string(),
      description: z.string(),
      currentValue: z.record(z.unknown()),
      recommendedValue: z.record(z.unknown()),
      estimatedSavingsMonthly: z.number(),
      confidence: z.string(),
      riskLevel: z.string(),
      status: z.string(),
      analysisWindowDays: z.number(),
      createdAt: z.coerce.date(),
    })),
    nextCursor: z.string().nullable(),
    summary: z.object({
      totalActive: z.number().int(),
      totalSavingsMonthly: z.number(),
      byType: z.record(z.string(), z.object({
        count: z.number().int(),
        savingsMonthly: z.number(),
      })),
    }),
  }))
  .query(async ({ ctx, input }) => {
    return aiService.listRecommendations(ctx.tenantId, ctx.user, input);
  }),

// ─── ai.recommendationAction ────────────────────────────────────────
// Accept, dismiss, or mark a recommendation as applied.
// Auth: authenticated (member+)
// Rate limit: 30 req/min
recommendationAction: protectedProcedure
  .input(z.object({
    recommendationId: z.string().uuid(),
    action: z.enum(['accept', 'dismiss', 'apply']),
    reason: z.string().max(500).optional(),
  }))
  .output(z.object({
    success: z.boolean(),
    recommendation: z.object({ id: z.string(), status: z.string() }),
  }))
  .mutation(async ({ ctx, input }) => {
    return aiService.updateRecommendation(ctx.tenantId, ctx.user.id, input);
  }),

// ─── ai.usage ────────────────────────────────────────────────────────
// Get AI usage stats for the current organization (budget tracking).
// Auth: admin
// Rate limit: 30 req/min
// Cache: 1min TTL
usage: adminProcedure
  .input(z.object({
    timeRange: TimeRangeInput.optional(), // default: current month
  }))
  .output(z.object({
    budget: z.object({
      monthlyTokenLimit: z.number(),
      tokensUsed: z.number(),
      tokensRemaining: z.number(),
      costUSD: z.number(),
      requestCount: z.number(),
    }),
    byFeature: z.array(z.object({
      feature: z.string(),
      tokens: z.number(),
      cost: z.number(),
      requests: z.number(),
    })),
    byModel: z.array(z.object({
      model: z.string(),
      tokens: z.number(),
      cost: z.number(),
      requests: z.number(),
    })),
    dailyTrend: z.array(z.object({
      date: z.coerce.date(),
      tokens: z.number(),
      cost: z.number(),
    })),
  }))
  .query(async ({ ctx, input }) => {
    return aiService.getUsageStats(ctx.tenantId, input);
  }),
```

### 10.2 BullMQ Job Definitions

```typescript
// packages/backend/src/ai/jobs/index.ts

import { Queue, Worker, QueueScheduler } from 'bullmq';

// ─── Anomaly Detection (Phase 1) ────────────────────────────────────────

const anomalyQueue = new Queue('anomaly-detection', { connection: redis });

// Run every 60 seconds per cluster
for (const cluster of activeClusters) {
  await anomalyQueue.add(
    `detect-${cluster.id}`,
    { clusterId: cluster.id, orgId: cluster.orgId },
    {
      repeat: { every: 60_000 },        // Every 60 seconds
      removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
      removeOnFail: { count: 50 },
    },
  );
}

const anomalyWorker = new Worker('anomaly-detection', anomalyProcessor, {
  connection: redis,
  concurrency: 5,                         // Process 5 clusters in parallel
  limiter: { max: 10, duration: 1000 },   // Max 10 jobs/sec (DB protection)
});

// ─── RCA Correlation (Phase 1) ──────────────────────────────────────────

const rcaQueue = new Queue('rca-correlation', { connection: redis });

// Triggered when an alert transitions to 'firing'
// (Called from the alert engine, not on a schedule)

const rcaWorker = new Worker('rca-correlation', rcaProcessor, {
  connection: redis,
  concurrency: 3,
  limiter: { max: 5, duration: 1000 },
});

// ─── Cost Optimization (Phase 1) ────────────────────────────────────────

const costOptQueue = new Queue('cost-optimization', { connection: redis });

// Run hourly per org
await costOptQueue.add(
  'generate-recommendations',
  {},
  {
    repeat: { every: 3600_000 },           // Every hour
    removeOnComplete: { count: 24 },
  },
);

const costOptWorker = new Worker('cost-optimization', costOptProcessor, {
  connection: redis,
  concurrency: 2,
});

// ─── Security Scoring (Phase 1) ─────────────────────────────────────────

const securityQueue = new Queue('security-scoring', { connection: redis });

// Triggered after each vulnerability scan completes

const securityWorker = new Worker('security-scoring', securityProcessor, {
  connection: redis,
  concurrency: 2,
});

// ─── LLM Tasks (Phase 2) ───────────────────────────────────────────────

const llmQueue = new Queue('llm-tasks', { connection: redis });

// For: RCA summaries, suggestion generation, periodic analysis
// Rate-limited to control LLM costs

const llmWorker = new Worker('llm-tasks', llmProcessor, {
  connection: redis,
  concurrency: 2,                          // Only 2 concurrent LLM calls
  limiter: { max: 30, duration: 60_000 },  // Max 30 LLM calls per minute
});

// ─── Seasonal Profile Updates (Phase 1) ─────────────────────────────────

const seasonalQueue = new Queue('seasonal-update', { connection: redis });

await seasonalQueue.add(
  'update-profiles',
  {},
  {
    repeat: { every: 3600_000 },           // Every hour
    removeOnComplete: { count: 24 },
  },
);

const seasonalWorker = new Worker('seasonal-update', seasonalProcessor, {
  connection: redis,
  concurrency: 1,                          // Sequential — this is a background maintenance task
});
```

---

## 11. Implementation Phases

### Phase 1 (v1.0) — Statistical Intelligence, No LLM

**Timeline: Weeks 9-12 of MVP (parallel with Polish & Launch from product strategy)**

**Zero LLM dependency. Everything runs locally.**

| Feature | Effort | Priority |
|---------|--------|----------|
| EMA anomaly detection for CPU, memory | 3 days | P0 |
| Rate-of-change detector (memory leaks, CPU spikes) | 2 days | P0 |
| Anomaly → alert integration (anomaly-based alert rules) | 2 days | P0 |
| BullMQ job infrastructure for AI workers | 1 day | P0 |
| Redis state management for EMA | 1 day | P0 |
| Rule-based RCA correlation engine | 3 days | P1 |
| Cross-domain insights (pattern matching) | 2 days | P1 |
| RCA results in alert detail UI | 1 day | P1 |
| Cost right-sizing analysis (CPU/memory) | 3 days | P1 |
| Idle resource detection | 1 day | P1 |
| Recommendations UI (list, accept, dismiss) | 2 days | P1 |
| Exploitability scoring for vulnerabilities | 2 days | P2 |
| Seasonal profile infrastructure | 2 days | P2 |
| **Total Phase 1** | **~23 days** | |

**Deliverables:**
- Anomaly markers on metric charts in the dashboard
- Anomaly-based alert rules ("alert me when CPU usage is anomalous for 5 minutes")
- Automatic RCA correlation when alerts fire (template-based summaries)
- Cost right-sizing recommendations in the FinOps tab
- Exploitability scores on the security vulnerability list

### Phase 2 (v1.5) — LLM-Powered Features

**Timeline: Months 4-6 (aligned with product strategy Phase 2)**

| Feature | Effort | Priority |
|---------|--------|----------|
| LLM provider abstraction (Anthropic + OpenAI) | 2 days | P0 |
| Token budget system | 1 day | P0 |
| LLM response caching (Redis) | 1 day | P0 |
| Natural language query: schema + prompt engineering | 3 days | P0 |
| NL query execution engine (translate → tRPC call) | 3 days | P0 |
| NL query UI (chat-style input in dashboard) | 2 days | P0 |
| LLM-enhanced RCA summaries | 2 days | P1 |
| AI suggestion generation (periodic) | 2 days | P1 |
| Multi-turn conversation support (ai_sessions) | 2 days | P2 |
| LLM usage dashboard (admin) | 1 day | P2 |
| Seasonal anomaly detection activation | 1 day | P2 |
| Spot instance recommendations | 2 days | P2 |
| **Total Phase 2** | **~22 days** | |

**Deliverables:**
- "Ask Voyager" chat interface in the dashboard
- Natural language queries: "show me unhealthy pods in production"
- LLM-generated RCA summaries alongside alert details
- AI token usage dashboard for admins

### Phase 3 (v2.0) — Agentic AI SRE

**Timeline: Months 6-9 (aligned with product strategy Phase 3)**

| Feature | Effort | Priority |
|---------|--------|----------|
| Autonomous alert investigation (multi-step, like HolmesGPT) | 5 days | P0 |
| Investigation UI (step-by-step reasoning display) | 3 days | P0 |
| Remediation suggestions with kubectl commands | 3 days | P1 |
| One-click fix for common issues (restart, scale, adjust limits) | 3 days | P1 |
| Predictive capacity planning | 3 days | P1 |
| Network dependency graph (from network_metrics) | 3 days | P2 |
| AI-powered alert grouping / deduplication | 2 days | P2 |
| Runbook integration (link runbooks, AI follows them) | 3 days | P2 |
| User feedback loop (rating, corrections improve future AI) | 2 days | P2 |
| Local model support (Ollama) for air-gapped deployments | 2 days | P3 |
| **Total Phase 3** | **~29 days** | |

**Deliverables:**
- Bits-AI-SRE-like autonomous investigations
- "Voyager investigated this alert and found: ..." in Slack notifications
- One-click remediation for common K8s issues
- Predictive scaling and capacity recommendations

---

## 12. Competitive Analysis — What Works, What's Hype

### 12.1 Datadog Bits AI SRE

**What they do well:**
- Autonomous investigation triggered by alerts — no user prompting needed
- Multi-hypothesis testing (tests multiple theories in parallel)
- Memory from past investigations (learns patterns)
- Deeply integrated with their telemetry — the AI has full context
- Writes findings back to Slack with supporting evidence

**What's their advantage that we can't replicate:**
- Trained on data from "tens of thousands of organizations" — massive pattern library
- Years of investment in APM, tracing, and service dependency mapping
- Dedicated AI team of 50+ engineers

**What we CAN replicate for a small team:**
- Autonomous investigation (our RCA engine does this, just less sophisticated)
- Cross-domain correlation (this is where we WIN — they're single-domain per AI feature)
- Write-back to Slack (webhook integration)

**What's hype:**
- "90% faster root cause identification" — unverifiable marketing claim
- The implied autonomy — in practice, engineers still verify everything

**Our counter-positioning:** Bits AI is locked behind $50K+/year spend. Voyager's AI works at $15/node/month, and our cross-domain correlation (ops+cost+security) is something Bits can't do because Datadog's cost and security features are separate products.

### 12.2 Komodor Klaudia

**What they do well:**
- K8s-specific troubleshooting (deep K8s event understanding)
- Change tracking integration (correlates issues with deployments)
- "95% accuracy" claim on root cause identification

**What's their weakness:**
- Single-domain: knows nothing about costs or security
- "95% accuracy" is unverifiable and likely applies only to narrow scenarios
- Killed free tier — community trust damaged

**Our counter-positioning:** Klaudia knows about K8s events but can't tell you the cost impact or security implications. Voyager's RCA crosses all three domains.

### 12.3 Robusta / HolmesGPT (Open Source)

**What they do well:**
- Open source (CNCF Sandbox project) — great for trust
- Agentic loop: connects to multiple data sources (Prometheus, Loki, ArgoCD, etc.)
- Integrates with any LLM (Claude, GPT, local models)
- Writes analysis back to PagerDuty, OpsGenie, Slack

**What's their weakness:**
- Requires you to set up and manage the AI infrastructure yourself
- No built-in cost or security intelligence
- Quality depends entirely on prompt engineering and data source configuration
- No anomaly detection — only investigates after the fact

**What we can learn:**
- The toolset pattern (modular data source integrations) is excellent
- Their prompt engineering for K8s troubleshooting is a good reference
- Being open source builds trust — we should open-source Voyager Monitor

**Our counter-positioning:** HolmesGPT is an investigation tool, not a platform. Voyager includes detection (anomaly detection), investigation (RCA), recommendation (cost/security), AND the unified data that makes the AI actually useful.

### 12.4 Summary: What Actually Works vs. What's Marketing

| Capability | Works in practice? | Our approach |
|-----------|-------------------|--------------|
| **Statistical anomaly detection** | ✅ Yes — proven technique | Phase 1: EMA + seasonal + rate-of-change. No ML hype. |
| **Event correlation for RCA** | ✅ Yes — temporal + causal | Phase 1: Time window + causal matrix + dependency graph. |
| **LLM-generated summaries** | ✅ Yes — adds real value | Phase 2: Claude Haiku for fast, cheap summaries. |
| **NL → structured query** | ✅ Yes — well-solved problem | Phase 2: Haiku for translation, tight schema, read-only. |
| **"Agentic" autonomous investigation** | ⚠️ Partially — still needs human verification | Phase 3: Multi-step investigation. Always advisory, never autonomous action. |
| **Cost optimization recommendations** | ✅ Yes — math, not AI | Phase 1: Rule-based right-sizing. Proven by Kubecost/Cast.ai. |
| **"AI-powered" security** | ⚠️ Mostly hype — real value is in prioritization | Phase 1: Exploitability scoring. Math, not magic. |
| **Predictive capacity planning** | ⚠️ Partially — linear extrapolation works, ML adds marginal value | Phase 3: Start with trend extrapolation. |
| **Autonomous remediation** | ❌ Not yet — trust barrier too high | Phase 3: Suggest remediations, never auto-execute without approval. |

---

## Appendix A: File Structure

```
packages/backend/src/ai/
├── index.ts                          # AI service initialization
├── anomaly/
│   ├── ema-detector.ts               # EMA-based anomaly detection
│   ├── seasonal-detector.ts          # Hour-of-week seasonal decomposition
│   ├── rate-detector.ts              # Rate-of-change / derivative analysis
│   ├── pipeline.ts                   # Detection pipeline orchestrator
│   └── state.ts                      # Redis state management for EMA/tracking
├── rca/
│   ├── correlation-engine.ts         # Event correlation algorithm
│   ├── dependency-graph.ts           # Resource dependency graph builder
│   ├── cause-builder.ts              # Probable cause generation (template-based)
│   ├── cross-domain.ts               # Cross-domain insight patterns
│   └── llm-summarizer.ts             # Phase 2: LLM-enhanced summaries
├── nlq/
│   ├── prompts.ts                    # System prompts for NL → query translation
│   ├── query-schema.ts               # Structured query schema definition
│   ├── executor.ts                   # Query execution (NLQuery → tRPC call)
│   └── safety.ts                     # Safety guardrails (read-only, RBAC)
├── cost/
│   ├── rightsizing.ts                # CPU/memory right-sizing analysis
│   ├── idle-detection.ts             # Idle resource detection
│   ├── spot-recommendations.ts       # Spot instance recommendations
│   └── lifecycle.ts                  # Recommendation lifecycle management
├── security/
│   ├── exploitability-scorer.ts      # CVE exploitability scoring
│   └── security-cost-correlation.ts  # Security-cost impact analysis
├── llm/
│   ├── provider.ts                   # Provider-agnostic LLM interface
│   ├── router.ts                     # Provider routing with fallback
│   ├── cache.ts                      # Response caching (Redis)
│   ├── providers/
│   │   ├── anthropic.ts              # Claude integration
│   │   └── openai.ts                 # GPT integration
│   └── budget.ts                     # Token budget system
└── jobs/
    ├── index.ts                      # BullMQ queue/worker definitions
    ├── anomaly-processor.ts          # Anomaly detection job processor
    ├── rca-processor.ts              # RCA correlation job processor
    ├── cost-opt-processor.ts         # Cost optimization job processor
    ├── security-processor.ts         # Security scoring job processor
    ├── seasonal-processor.ts         # Seasonal profile update processor
    └── llm-processor.ts              # Phase 2: LLM task processor
```

---

## Appendix B: Configuration

```typescript
// packages/backend/src/ai/config.ts

export interface AIConfig {
  // Feature flags
  anomalyDetection: {
    enabled: boolean;                  // Default: true
    detectionIntervalMs: number;       // Default: 60000 (1 min)
    minDataPointsForActivation: number; // Default: 100
    defaultSensitivity: 'low' | 'medium' | 'high'; // Default: 'medium'
    seasonalDetection: boolean;        // Default: true
    rateOfChangeDetection: boolean;    // Default: true
  };

  rcaCorrelation: {
    enabled: boolean;                  // Default: true
    timeWindowBeforeMinutes: number;   // Default: 30
    timeWindowAfterMinutes: number;    // Default: 5
    maxEventsPerInvestigation: number; // Default: 100
    dependencyGraphTTLMinutes: number; // Default: 5
  };

  costOptimization: {
    enabled: boolean;                  // Default: true
    analysisIntervalMs: number;        // Default: 3600000 (1 hour)
    defaultAnalysisWindowDays: number; // Default: 14
    minSavingsThresholdUSD: number;    // Default: 1.0 per month
    cpuOversizeRatio: number;          // Default: 2.0 (request > 2x P95 = oversized)
    memoryOversizeRatio: number;       // Default: 2.5 (more conservative for memory)
    cpuHeadroomPercent: number;        // Default: 30 (add 30% above P95 for recommended request)
    memoryHeadroomPercent: number;     // Default: 40 (add 40% above P95)
  };

  security: {
    exploitabilityScoring: boolean;    // Default: true
    runtimePackageTracking: boolean;   // Default: false (Phase 2)
  };

  llm: {
    enabled: boolean;                  // Default: false (Phase 2)
    primaryProvider: 'anthropic' | 'openai';
    primaryModel: string;              // Default: 'claude-3-5-haiku-latest'
    fallbackProvider: 'openai' | 'anthropic';
    fallbackModel: string;             // Default: 'gpt-4o-mini'
    temperature: number;               // Default: 0.3
    maxRetries: number;                // Default: 2
    cacheTTLSeconds: {
      nlQuery: number;                 // Default: 60
      rcaSummary: number;              // Default: 300
      suggestion: number;              // Default: 1800
    };
  };

  budget: {
    // Per-plan token limits (see section 8.2)
    planLimits: Record<string, { monthlyTokens: number; maxPerRequest: number }>;
  };
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  anomalyDetection: {
    enabled: true,
    detectionIntervalMs: 60_000,
    minDataPointsForActivation: 100,
    defaultSensitivity: 'medium',
    seasonalDetection: true,
    rateOfChangeDetection: true,
  },
  rcaCorrelation: {
    enabled: true,
    timeWindowBeforeMinutes: 30,
    timeWindowAfterMinutes: 5,
    maxEventsPerInvestigation: 100,
    dependencyGraphTTLMinutes: 5,
  },
  costOptimization: {
    enabled: true,
    analysisIntervalMs: 3_600_000,
    defaultAnalysisWindowDays: 14,
    minSavingsThresholdUSD: 1.0,
    cpuOversizeRatio: 2.0,
    memoryOversizeRatio: 2.5,
    cpuHeadroomPercent: 30,
    memoryHeadroomPercent: 40,
  },
  security: {
    exploitabilityScoring: true,
    runtimePackageTracking: false,
  },
  llm: {
    enabled: false,
    primaryProvider: 'anthropic',
    primaryModel: 'claude-3-5-haiku-latest',
    fallbackProvider: 'openai',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.3,
    maxRetries: 2,
    cacheTTLSeconds: {
      nlQuery: 60,
      rcaSummary: 300,
      suggestion: 1800,
    },
  },
  budget: {
    planLimits: {
      free:       { monthlyTokens: 50_000,     maxPerRequest: 2_000  },
      team:       { monthlyTokens: 500_000,    maxPerRequest: 4_000  },
      pro:        { monthlyTokens: 5_000_000,  maxPerRequest: 8_000  },
      enterprise: { monthlyTokens: 50_000_000, maxPerRequest: 16_000 },
    },
  },
};
```

---

## Appendix C: Estimated Monthly AI Infrastructure Costs

| Component | Free Tier | Team (50 nodes) | Pro (200 nodes) | Enterprise (500 nodes) |
|-----------|-----------|-----------------|-----------------|----------------------|
| **Anomaly Detection** | $0 (local compute) | $0 | $0 | $0 |
| **RCA Correlation** | $0 (local compute) | $0 | $0 | $0 |
| **Cost Optimization** | $0 (local compute) | $0 | $0 | $0 |
| **Security Scoring** | $0 (local compute) | $0 | $0 | $0 |
| **LLM: NL Queries** | ~$0.04 | ~$0.40 | ~$4.00 | ~$40 |
| **LLM: RCA Summaries** | ~$0.01 | ~$0.10 | ~$1.00 | ~$10 |
| **LLM: Suggestions** | ~$0.00 | ~$0.05 | ~$0.50 | ~$5 |
| **Redis (AI state)** | < 10 MB | < 50 MB | < 200 MB | < 500 MB |
| **PostgreSQL (AI tables)** | < 100 MB | < 1 GB | < 5 GB | < 20 GB |
| **Total LLM Cost** | **~$0.05/mo** | **~$0.55/mo** | **~$5.50/mo** | **~$55/mo** |

**Key insight:** Phase 1 AI features (anomaly detection, RCA correlation, cost optimization, security scoring) have ZERO marginal cost. They run on the existing backend infrastructure. Only Phase 2 LLM features add cost, and even at enterprise scale, it's ~$55/month — negligible compared to the $5,000+/month the customer is paying.

This validates the architecture decision: statistical methods first, LLMs as an additive enhancement.