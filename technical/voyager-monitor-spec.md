# Voyager Monitor — Unified Data Collection Agent Specification

> **Version:** 1.0  
> **Date:** February 4, 2026  
> **Author:** Atlas Engineering  
> **Status:** Implementation-ready  
> **Language:** Go (existing codebase)  
> **Deployment:** Kubernetes DaemonSet (Helm chart)  
> **Target Clusters:** EKS, AKS (must also work on GKE, bare-metal)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Current Capabilities (Preserved)](#3-current-capabilities-preserved)
4. [Module Specifications](#4-module-specifications)
   - 4.1 [Metrics Collector](#41-metrics-collector)
   - 4.2 [Log Collector](#42-log-collector)
   - 4.3 [Kubernetes Event Watcher](#43-kubernetes-event-watcher)
   - 4.4 [Security Scanner](#44-security-scanner)
   - 4.5 [Network Monitor](#45-network-monitor)
   - 4.6 [Cost Data Collector](#46-cost-data-collector)
5. [Data Transport Layer](#5-data-transport-layer)
6. [Protobuf Definitions](#6-protobuf-definitions)
7. [Helm Chart Configuration](#7-helm-chart-configuration)
8. [Security Scanning Module Deep Dive](#8-security-scanning-module-deep-dive)
9. [Resource Budget & Scaling](#9-resource-budget--scaling)
10. [Deployment & Upgrade Strategy](#10-deployment--upgrade-strategy)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. Executive Summary

Voyager Monitor is an existing Go-based DaemonSet deployed across EKS and AKS clusters. It currently provides two capabilities: **audit logging** (tracking who deleted what K8s resource) and **stuck node cleanup** (detecting and draining unresponsive nodes).

This specification extends Voyager Monitor into a **unified data collection agent** that replaces the need for separate monitoring agents (Datadog Agent), security agents (Falco/Sysdig), cost agents (Kubecost), and log forwarders (Fluentd/Fluent Bit). The design is inspired by research into the architectures of Datadog Agent, Falco, Sysdig, Groundcover (Flora agent), and OpenTelemetry Collector.

### Design Principles

1. **Modular architecture** — Each capability is an independent module that can be enabled/disabled via Helm values. Disabled modules consume zero resources.
2. **Progressive enhancement** — Start with userspace collection (cgroups, kubelet API); add eBPF-based collection in Phase 2 for lower overhead and deeper visibility.
3. **Backpressure-aware** — Every module implements buffering with configurable limits and graceful degradation under pressure.
4. **Minimal privilege** — Request only the Linux capabilities and RBAC permissions each enabled module requires.
5. **OpenTelemetry-aligned** — Data formats and transport align with OTLP where possible to enable interop with third-party backends.

### Architecture Inspiration

| Agent | Key Lesson Applied |
|-------|-------------------|
| **Datadog Agent** | Modular collector pattern: main process + optional sub-processes (APM, Process Agent). We adopt the single-binary multi-module approach but keep everything in-process with goroutine isolation. |
| **Falco** | Modern eBPF probe with CO-RE (Compile Once Run Everywhere) for syscall monitoring. We adopt the same approach for our security scanner using `cilium/ebpf` Go library. Requires kernel ≥5.8 with BTF. |
| **Sysdig Agent** | Unified security + monitoring in one agent, eBPF or kernel module driver. We follow the unified model but avoid kernel modules (eBPF only). |
| **Groundcover (Flora)** | eBPF-first, Kubernetes-native, zero-instrumentation observability. Validates our approach of kernel-level collection with K8s metadata enrichment. |
| **OpenTelemetry Collector** | Pipeline architecture: Receivers → Processors → Exporters. We adopt this pattern internally within each module. |

---

## 2. Architecture Overview

### 2.1 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          VOYAGER MONITOR (DaemonSet Pod)                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     CONTROL PLANE                                │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │   │
│  │  │ Config   │  │ Module       │  │ Health     │  │ Version  │ │   │
│  │  │ Watcher  │  │ Manager      │  │ Reporter   │  │ Negotiator│ │   │
│  │  └──────────┘  └──────────────┘  └────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────────── DATA MODULES ─────────────────────────────┐   │
│  │                                                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │   │
│  │  │ Metrics  │  │   Log    │  │  K8s     │  │  Security    │  │   │
│  │  │Collector │  │Collector │  │  Event   │  │  Scanner     │  │   │
│  │  │          │  │          │  │  Watcher │  │  (eBPF)      │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │   │
│  │       │              │              │               │          │   │
│  │  ┌────┴─────┐  ┌────┴─────┐                                   │   │
│  │  │ Network  │  │  Cost    │                                   │   │
│  │  │ Monitor  │  │  Data    │                                   │   │
│  │  │          │  │ Collector│                                   │   │
│  │  └────┬─────┘  └────┬─────┘                                   │   │
│  └───────┼──────────────┼─────────────────────────────────────────┘   │
│          │              │                                              │
│  ┌───────┴──────────────┴─────────────────────────────────────────┐   │
│  │                     DATA PIPELINE                               │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐ │   │
│  │  │ K8s      │  │  Aggregator  │  │  Ring      │  │ Exporter │ │   │
│  │  │ Enricher │→ │  & Sampler   │→ │  Buffer    │→ │ (gRPC/   │ │   │
│  │  │          │  │              │  │  (per-type)│  │  HTTP)   │ │   │
│  │  └──────────┘  └──────────────┘  └────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  EXISTING MODULES (PRESERVED)                    │   │
│  │  ┌──────────────────┐  ┌────────────────────────┐              │   │
│  │  │  Audit Logger    │  │  Stuck Node Cleanup    │              │   │
│  │  │  (K8s events)    │  │  (Node health + drain) │              │   │
│  │  └──────────────────┘  └────────────────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ gRPC (mTLS) / HTTP                 │ Config updates
         ▼                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    VOYAGER PLATFORM BACKEND                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │ Ingestion    │  │ TimescaleDB  │  │ OpenSearch   │                 │
│  │ Gateway      │  │ (metrics)    │  │ (logs/events)│                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Internal Process Model

Voyager Monitor runs as a **single Go binary** with goroutine-based concurrency. Each module runs in its own goroutine pool with:

- **Dedicated context** — Each module gets a `context.Context` derived from the main process context. Module shutdown is graceful via context cancellation.
- **Isolated error handling** — A panicking module is recovered and restarted by the Module Manager. Other modules are unaffected.
- **Resource limits** — Each module has configurable `GOMAXPROCS`-like soft limits enforced via a semaphore pattern for CPU-intensive work.
- **Shared components** — K8s client, K8s metadata cache, and the data pipeline are shared across modules via dependency injection.

```go
// Module interface — every data collection module implements this
type Module interface {
    // Name returns the unique module identifier
    Name() string
    // Init performs one-time setup (open files, attach eBPF programs, etc.)
    Init(ctx context.Context, deps Dependencies) error
    // Run starts the main collection loop. Blocks until ctx is cancelled.
    Run(ctx context.Context) error
    // Shutdown performs graceful cleanup. Called after Run returns.
    Shutdown() error
    // HealthCheck returns current module health status
    HealthCheck() HealthStatus
}

// Dependencies injected into each module
type Dependencies struct {
    KubeClient       kubernetes.Interface
    MetadataCache    *k8s.MetadataCache
    DataPipeline     *pipeline.Pipeline
    Config           *config.ModuleConfig
    Logger           *slog.Logger
    MetricsRegistry  *prometheus.Registry // for self-monitoring
}
```

### 2.3 K8s Metadata Cache

A shared, in-memory cache of Kubernetes metadata that all modules use to enrich raw data with K8s context. This avoids every module independently calling the K8s API.

```go
type MetadataCache struct {
    // Pod metadata indexed by (namespace, name) and by container ID
    pods    map[string]*PodMeta    // key: namespace/name
    cgroups map[string]*PodMeta    // key: cgroup path or container ID
    
    // Higher-level objects
    deployments  map[string]*DeploymentMeta
    statefulsets map[string]*StatefulSetMeta
    daemonsets   map[string]*DaemonSetMeta
    services     map[string]*ServiceMeta
    nodes        map[string]*NodeMeta
    namespaces   map[string]*NamespaceMeta
}

type PodMeta struct {
    Namespace      string
    Name           string
    UID            string
    Labels         map[string]string
    Annotations    map[string]string
    NodeName       string
    ServiceAccount string
    OwnerKind      string  // Deployment, StatefulSet, DaemonSet, Job, etc.
    OwnerName      string
    Containers     []ContainerMeta
    StartTime      time.Time
}

type ContainerMeta struct {
    Name        string
    ID          string  // docker://abc123 or containerd://abc123
    Image       string
    ImageID     string
    CgroupPath  string
}
```

The cache is populated via K8s **watch** (informers) and updated in real-time. Memory footprint: ~2KB per pod, so 500 pods = ~1MB.

---

## 3. Current Capabilities (Preserved)

### 3.1 Audit Logger

**What it does:** Watches the Kubernetes API for resource deletion events and logs who deleted what, when, from which client.

**Implementation:** Uses a K8s informer watching for DELETE events across all namespaced resources. Records:
- Resource type, name, namespace
- User/ServiceAccount that performed the deletion
- Timestamp
- Client IP and user-agent (from audit logs if available)

**Preservation strategy:** This module remains exactly as-is. Its K8s watch will be consolidated with the new K8s Event Watcher module's informer infrastructure to reduce API server load, but the audit logging logic is untouched.

### 3.2 Stuck Node Cleanup

**What it does:** Monitors node health status. When a node is detected as NotReady for a configurable duration, cordons and drains it, then notifies.

**Implementation:** Polls node conditions via kubelet API or node informer. Implements configurable grace period before taking action.

**Preservation strategy:** This module remains exactly as-is. It will benefit from the new Metrics Collector's node health data but operates independently.

---

## 4. Module Specifications

### 4.1 Metrics Collector

#### Purpose
Collect node-level and container-level resource utilization metrics for operational monitoring and cost attribution.

#### Collection Methods (Phase 1: Userspace)

**Node Metrics — via `/proc` and `/sys` filesystem:**

| Metric | Source | Fields | Interval |
|--------|--------|--------|----------|
| CPU utilization | `/proc/stat` | `user`, `nice`, `system`, `idle`, `iowait`, `irq`, `softirq`, `steal` | 15s |
| Memory | `/proc/meminfo` | `total`, `available`, `used`, `buffers`, `cached`, `swap_total`, `swap_used` | 15s |
| Disk I/O | `/proc/diskstats` | `reads_completed`, `reads_merged`, `sectors_read`, `read_time_ms`, `writes_completed`, `writes_merged`, `sectors_written`, `write_time_ms` per device | 15s |
| Disk usage | `syscall.Statfs()` per mount | `total_bytes`, `used_bytes`, `available_bytes`, `inodes_total`, `inodes_used` | 60s |
| Network (node) | `/proc/net/dev` | `rx_bytes`, `rx_packets`, `rx_errors`, `rx_dropped`, `tx_bytes`, `tx_packets`, `tx_errors`, `tx_dropped` per interface | 15s |
| Load average | `/proc/loadavg` | `load1`, `load5`, `load15`, `running_procs`, `total_procs` | 15s |
| File descriptors | `/proc/sys/fs/file-nr` | `allocated`, `free`, `max` | 60s |
| Entropy | `/proc/sys/kernel/random/entropy_avail` | `available_bits` | 60s |
| Uptime | `/proc/uptime` | `uptime_seconds`, `idle_seconds` | 60s |

**Container Metrics — via cgroup v2 filesystem (`/sys/fs/cgroup`):**

| Metric | cgroup File | Fields | Interval |
|--------|-------------|--------|----------|
| CPU usage | `cpu.stat` | `usage_usec`, `user_usec`, `system_usec`, `nr_periods`, `nr_throttled`, `throttled_usec` | 15s |
| CPU limit | `cpu.max` | `quota_usec`, `period_usec` → derive CPU limit | 60s |
| CPU request | K8s API (from metadata cache) | `requests.cpu` in millicores | on-change |
| Memory usage | `memory.current` | `usage_bytes` | 15s |
| Memory limit | `memory.max` | `limit_bytes` | 60s |
| Memory stats | `memory.stat` | `anon`, `file`, `kernel`, `slab`, `sock`, `pgfault`, `pgmajfault`, `oom_kills` | 15s |
| Memory request | K8s API (from metadata cache) | `requests.memory` in bytes | on-change |
| I/O | `io.stat` | `rbytes`, `wbytes`, `rios`, `wios`, `dbytes`, `dios` per device | 15s |
| PIDs | `pids.current` / `pids.max` | `current`, `limit` | 30s |
| Network (per-pod) | `/proc/<pid>/net/dev` (init PID) | `rx_bytes`, `tx_bytes`, `rx_packets`, `tx_packets` | 15s |

**Container metrics resolution:** The collector maps cgroup paths to containers using the MetadataCache. On cgroup v2, the path format is:
```
/sys/fs/cgroup/kubelet.slice/kubelet-kubepods.slice/kubelet-kubepods-burstable.slice/
  kubelet-kubepods-burstable-pod<UID>.slice/<container-runtime>-<containerID>.scope/
```

**Kubelet Summary API fallback:** For clusters where direct cgroup access is impractical or cgroup v1 is in use, fall back to `GET /stats/summary` on kubelet port 10250 (requires ServiceAccount token). This is less efficient (one HTTP call vs. direct file reads) but universally compatible.

#### Collection Methods (Phase 2: eBPF Enhancement)

For Phase 2, optional eBPF programs can supplement userspace collection:

- **CPU scheduling events:** Attach to `sched_switch` tracepoint to measure per-process/container CPU time with microsecond accuracy.
- **I/O latency:** Attach to `block_rq_issue` and `block_rq_complete` to measure per-request I/O latency histograms.
- **Memory allocation tracking:** Attach to `mm_page_alloc` and `mm_page_free` for fine-grained memory tracking.

These eBPF programs are optional enhancements. The Phase 1 `/proc`/cgroup collection is the baseline and always works.

#### Data Format

```protobuf
message MetricsBatch {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  repeated NodeMetric node_metrics = 4;
  repeated ContainerMetric container_metrics = 5;
}

message NodeMetric {
  string name = 1;          // e.g. "cpu.usage.user"
  double value = 2;
  map<string, string> labels = 3;  // e.g. {"device": "sda", "interface": "eth0"}
}

message ContainerMetric {
  string namespace = 1;
  string pod_name = 2;
  string container_name = 3;
  string container_id = 4;
  string owner_kind = 5;    // Deployment, StatefulSet, etc.
  string owner_name = 6;
  string name = 7;          // metric name
  double value = 8;
  map<string, string> labels = 9;
}
```

#### Buffering Strategy
- **In-memory ring buffer:** 10,000 MetricsBatch entries (~50MB at typical payload sizes)
- **Overflow policy:** Drop oldest entries (metrics are replaceable; the next collection cycle captures current state)
- **Flush interval:** Every 15 seconds or when buffer reaches 80% capacity
- **Retry on failure:** Exponential backoff, 3 retries, then drop and continue

#### Compression
- **Algorithm:** Snappy (same as Prometheus remote-write)
- **Compression ratio:** ~4:1 for metric payloads
- **CPU overhead:** <1ms per batch at Snappy speeds

#### Transport
- **Primary:** gRPC streaming to Voyager Platform ingestion gateway
- **Fallback:** Prometheus remote-write v2 compatible HTTP POST (for integration with VictoriaMetrics or any Prometheus-compatible TSDB)
- **Compatibility:** Export in both OTLP and Prometheus remote-write formats configurable via Helm values

---

### 4.2 Log Collector

#### Purpose
Collect container stdout/stderr logs and forward them to the Voyager Platform backend for full-text search and correlation with metrics and events.

#### Collection Method

**Primary: Container log files on the node filesystem.**

Kubernetes writes container stdout/stderr to log files on the node. The exact path depends on the container runtime:

| Runtime | Log Path Pattern |
|---------|-----------------|
| containerd | `/var/log/pods/<namespace>_<pod-name>_<pod-uid>/<container-name>/<restart-count>.log` |
| CRI-O | `/var/log/pods/<namespace>_<pod-name>_<pod-uid>/<container-name>/<restart-count>.log` |
| Docker (legacy) | `/var/lib/docker/containers/<container-id>/<container-id>-json.log` |

**Collection approach:**

1. **File discovery:** Use inotify (`fsnotify` Go library) on `/var/log/pods/` to detect new log files as pods start.
2. **Tailing:** For each discovered log file, start a goroutine that tails the file using `io.Reader` with seek tracking.
3. **Offset tracking:** Persist read offsets to a local file (`/var/lib/voyager-monitor/log-offsets.json`) to survive pod restarts without re-reading logs.
4. **Log rotation handling:** Detect rotation via inode change. When a file is rotated, finish reading the old file, then switch to the new one.
5. **Parsing:** Parse the CRI log format: `<timestamp> <stream> <flags> <log-line>` where stream is `stdout` or `stderr`, flags include `P` (partial) and `F` (full).

**Partial log handling:** CRI logs split long lines with the `P` flag. The collector reassembles partial lines before forwarding.

#### What Is Collected

| Field | Source | Description |
|-------|--------|-------------|
| `timestamp` | CRI log line | Original log timestamp (RFC3339Nano) |
| `stream` | CRI log line | `stdout` or `stderr` |
| `message` | CRI log line | The actual log content |
| `namespace` | MetadataCache | Pod namespace |
| `pod_name` | MetadataCache | Pod name |
| `container_name` | Filename | Container name |
| `container_id` | MetadataCache | Container ID |
| `owner_kind` | MetadataCache | Deployment, StatefulSet, etc. |
| `owner_name` | MetadataCache | Name of the owning workload |
| `node_name` | Agent config | The node this agent runs on |
| `cluster_id` | Agent config | Cluster identifier |
| `labels` | MetadataCache | Pod labels (filterable subset) |
| `severity` | Parsed from message | Auto-detected: ERROR, WARN, INFO, DEBUG, UNKNOWN |

#### Severity Detection

Best-effort log level parsing from the message content:

```go
var severityPatterns = []struct {
    pattern  *regexp.Regexp
    severity string
}{
    {regexp.MustCompile(`(?i)\b(fatal|panic|critical)\b`), "FATAL"},
    {regexp.MustCompile(`(?i)\b(error|err|exception|fail)\b`), "ERROR"},
    {regexp.MustCompile(`(?i)\b(warn|warning)\b`), "WARN"},
    {regexp.MustCompile(`(?i)\b(info|notice)\b`), "INFO"},
    {regexp.MustCompile(`(?i)\b(debug|trace|verbose)\b`), "DEBUG"},
}
```

JSON-formatted logs: Extract level from `level`, `severity`, `lvl`, or `log_level` fields.

#### Data Format

```protobuf
message LogBatch {
  string cluster_id = 1;
  string node_name = 2;
  repeated LogEntry entries = 3;
}

message LogEntry {
  int64 timestamp_ns = 1;      // nanosecond precision
  string namespace = 2;
  string pod_name = 3;
  string container_name = 4;
  string container_id = 5;
  string owner_kind = 6;
  string owner_name = 7;
  string stream = 8;           // "stdout" or "stderr"
  string severity = 9;         // FATAL, ERROR, WARN, INFO, DEBUG, UNKNOWN
  string message = 10;
  map<string, string> labels = 11;  // selected pod labels
  map<string, string> parsed_fields = 12; // extracted JSON fields if structured log
}
```

#### Buffering Strategy
- **In-memory ring buffer:** 50,000 log entries (~100MB assuming avg 2KB per entry)
- **Disk buffer (optional):** When memory buffer is full, spill to `/var/lib/voyager-monitor/log-buffer/` as compressed protobuf files. Max disk usage: configurable, default 500MB.
- **Overflow policy:** When both memory and disk buffers are full, drop oldest entries. Increment `voyager_monitor_logs_dropped_total` counter.

#### Rate Limiting
- **Per-container rate limit:** Default 1000 lines/second per container. Excess lines are sampled (keep 1 in N).
- **Global rate limit:** Default 50,000 lines/second per node. Protects against log storms.
- **Multiline detection:** Detect common multiline patterns (Java stack traces, Python tracebacks) and group them as single entries.

#### Compression
- **Algorithm:** zstd (better compression ratio than Snappy for text data; ~6:1 for log payloads)
- **Level:** 3 (fast compression, good ratio)

#### Transport
- **Primary:** gRPC streaming to Voyager Platform ingestion gateway
- **Batch size:** Up to 1000 entries or 1MB per gRPC message (whichever is reached first)
- **Flush interval:** Every 5 seconds or when batch is full

---

### 4.3 Kubernetes Event Watcher

#### Purpose
Watch the Kubernetes API for cluster events and relay them to the Voyager Platform for timeline visualization, alerting, and AI-powered root cause analysis.

#### Collection Method

Uses the **K8s client-go informer framework** to watch Events across all namespaces. A single shared informer factory is used across the Audit Logger, Event Watcher, and MetadataCache to minimize API server connections.

```go
factory := informers.NewSharedInformerFactory(kubeClient, 0) // 0 = no resync
eventInformer := factory.Core().V1().Events().Informer()
eventInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
    AddFunc: func(obj interface{}) { handleEvent(obj.(*corev1.Event)) },
    UpdateFunc: func(old, new interface{}) { handleEvent(new.(*corev1.Event)) },
})
```

**Note:** Kubernetes events have a default TTL of 1 hour. The watcher captures them in real-time so they're preserved in Voyager Platform's storage indefinitely.

#### What Is Collected

| Field | Source | Description |
|-------|--------|-------------|
| `type` | Event.Type | `Normal` or `Warning` |
| `reason` | Event.Reason | `Scheduled`, `Pulled`, `Started`, `Killing`, `FailedScheduling`, `OOMKilling`, `Unhealthy`, `EvictionThresholdMet`, etc. |
| `message` | Event.Message | Human-readable event description |
| `involved_object_kind` | Event.InvolvedObject.Kind | Pod, Node, Deployment, ReplicaSet, etc. |
| `involved_object_name` | Event.InvolvedObject.Name | Resource name |
| `involved_object_namespace` | Event.InvolvedObject.Namespace | Resource namespace |
| `involved_object_uid` | Event.InvolvedObject.UID | Resource UID |
| `source_component` | Event.Source.Component | `kubelet`, `default-scheduler`, `deployment-controller`, etc. |
| `source_host` | Event.Source.Host | Node name where event originated |
| `first_timestamp` | Event.FirstTimestamp | When event first occurred |
| `last_timestamp` | Event.LastTimestamp | When event last occurred |
| `count` | Event.Count | How many times this event occurred |
| `cluster_id` | Agent config | Cluster identifier |

#### High-Value Event Categories

Events are categorized for prioritized processing:

| Category | Reasons | Priority |
|----------|---------|----------|
| **Scheduling** | `Scheduled`, `FailedScheduling`, `Preempting` | Medium |
| **Container Lifecycle** | `Pulled`, `Created`, `Started`, `Killing`, `BackOff` | Medium |
| **Health** | `Unhealthy`, `ProbeError`, `ContainerUnhealthy` | High |
| **Resource Pressure** | `OOMKilling`, `EvictionThresholdMet`, `SystemOOM`, `FreeDiskSpaceFailed` | Critical |
| **Scaling** | `SuccessfulRescale`, `DesiredReplicasComputed`, `ScalingReplicaSet` | Medium |
| **Deployment** | `DeploymentRollback`, `DeploymentPaused`, `DeploymentResumed`, `ProgressDeadlineExceeded` | High |
| **Storage** | `ProvisioningSucceeded`, `ProvisioningFailed`, `VolumeResizeFailed` | High |
| **Network** | `FailedToUpdateEndpoints`, `NetworkNotReady` | High |
| **Node** | `NodeReady`, `NodeNotReady`, `NodeHasDiskPressure`, `NodeHasMemoryPressure`, `NodeHasNoDiskPressure` | High |
| **Security** | `FailedToCreateHostPort`, `FailedValidation` | High |

#### Data Format

```protobuf
message K8sEventBatch {
  string cluster_id = 1;
  repeated K8sEvent events = 2;
}

message K8sEvent {
  int64 timestamp_ms = 1;
  string type = 2;                    // Normal, Warning
  string reason = 3;
  string message = 4;
  string category = 5;               // Scheduling, Health, ResourcePressure, etc.
  string priority = 6;               // Critical, High, Medium, Low
  K8sObjectRef involved_object = 7;
  string source_component = 8;
  string source_host = 9;
  int64 first_timestamp_ms = 10;
  int64 last_timestamp_ms = 11;
  int32 count = 12;
}

message K8sObjectRef {
  string kind = 1;
  string namespace = 2;
  string name = 3;
  string uid = 4;
  string api_version = 5;
}
```

#### Buffering Strategy
- **In-memory channel:** Buffered Go channel with capacity 10,000 events
- **Batch accumulation:** Collect events for up to 5 seconds or 100 events, then flush
- **Overflow:** Drop oldest; events are also stored by K8s for 1 hour so some data recovery is possible on reconnect

#### Compression & Transport
- **Compression:** Snappy
- **Transport:** gRPC unary RPCs (events are bursty but relatively low volume compared to metrics/logs)

---

### 4.4 Security Scanner

#### Purpose
Runtime security monitoring: detect suspicious process executions, file integrity violations, syscall anomalies, and container escape attempts. Replaces the need for a separate Falco or Sysdig DaemonSet.

> **Deep dive in [Section 8](#8-security-scanning-module-deep-dive)**

#### Collection Method

**Phase 1: Userspace-based detection (works on any kernel)**

| Detection | Method | Interval |
|-----------|--------|----------|
| Process execution tracking | Poll `/proc/[pid]/` directory + `comm`, `cmdline`, `status` | 5s |
| File integrity monitoring | `fsnotify` (inotify) watches on configured paths | Real-time |
| Privilege escalation | Poll `/proc/[pid]/status` for `CapEff`, `CapPrm` changes | 5s |
| Container escape indicators | Check for unexpected mount namespaces, host PID/network access | 10s |
| Shell-in-container | Process execution tracking looking for `/bin/sh`, `/bin/bash`, `kubectl exec` | Real-time |

**Phase 2: eBPF-based detection (kernel ≥5.8 with BTF)**

| Detection | eBPF Program Type | Attachment Point |
|-----------|-------------------|------------------|
| Process execution | Tracepoint | `sys_enter_execve`, `sys_enter_execveat` |
| File access/modification | Tracepoint | `sys_enter_openat`, `sys_enter_unlinkat`, `sys_enter_renameat` |
| Network connections | Tracepoint | `sys_enter_connect`, `sys_enter_accept4`, `sys_enter_bind` |
| Privilege changes | Tracepoint | `sys_enter_setuid`, `sys_enter_setgid`, `sys_enter_capset` |
| Module loading | Tracepoint | `sys_enter_init_module`, `sys_enter_finit_module` |
| Namespace changes | Tracepoint | `sys_enter_setns`, `sys_enter_unshare` |
| Ptrace | Tracepoint | `sys_enter_ptrace` |

eBPF programs use CO-RE (Compile Once Run Everywhere) via the `cilium/ebpf` Go library. Programs are compiled into the binary (no external `.o` files needed), loaded at runtime, and automatically adapted to the running kernel's BTF information.

#### What Is Collected

```protobuf
message SecurityEventBatch {
  string cluster_id = 1;
  string node_name = 2;
  repeated SecurityEvent events = 3;
}

message SecurityEvent {
  int64 timestamp_ns = 1;
  string event_type = 2;       // PROCESS_EXEC, FILE_MODIFY, PRIV_ESCALATION, 
                                // NETWORK_CONNECT, CONTAINER_ESCAPE, SHELL_SPAWN,
                                // MODULE_LOAD, NAMESPACE_CHANGE, FILE_INTEGRITY
  string severity = 3;         // CRITICAL, HIGH, MEDIUM, LOW, INFO
  string rule_id = 4;          // Which detection rule triggered
  string description = 5;      // Human-readable description
  
  // Process context
  ProcessInfo process = 6;
  ProcessInfo parent_process = 7;
  
  // Container context
  string namespace = 8;
  string pod_name = 9;
  string container_name = 10;
  string container_id = 11;
  
  // Event-specific data
  oneof details {
    FileEvent file_event = 20;
    NetworkEvent network_event = 21;
    ProcessEvent process_event = 22;
    SyscallEvent syscall_event = 23;
  }
}

message ProcessInfo {
  int32 pid = 1;
  int32 tid = 2;
  int32 ppid = 3;
  int32 uid = 4;
  int32 gid = 5;
  string comm = 6;           // process name (16 chars max)
  string exe = 7;            // full executable path
  string cmdline = 8;        // full command line
  uint64 cap_effective = 9;  // effective capabilities bitmask
}

message FileEvent {
  string path = 1;
  string operation = 2;       // CREATE, MODIFY, DELETE, CHMOD, CHOWN, RENAME
  int32 flags = 3;
  string old_hash = 4;        // SHA-256 of file before (for integrity monitoring)
  string new_hash = 5;        // SHA-256 of file after
}

message NetworkEvent {
  string src_ip = 1;
  int32 src_port = 2;
  string dst_ip = 3;
  int32 dst_port = 4;
  string protocol = 5;        // TCP, UDP, ICMP
  string operation = 6;       // CONNECT, ACCEPT, BIND, LISTEN
}

message ProcessEvent {
  string operation = 1;        // EXEC, EXIT, CLONE, SETUID, SETGID
  int32 exit_code = 2;
  string new_exe = 3;         // for EXEC events
}

message SyscallEvent {
  int32 syscall_nr = 1;
  string syscall_name = 2;
  int64 return_value = 3;
}
```

#### Buffering & Transport
- **In-memory priority queue:** Critical/High events are flushed immediately; Medium/Low events are batched.
- **Buffer size:** 5,000 events (~10MB)
- **Critical event latency:** <1 second from detection to backend
- **Normal event latency:** <10 seconds (batched)
- **Compression:** Snappy
- **Transport:** gRPC streaming with priority lanes

---

### 4.5 Network Monitor

#### Purpose
Track per-pod network connections for topology visualization, network policy validation, and anomaly detection.

#### Collection Method

**Phase 1: Conntrack + /proc (userspace)**

| Data Source | What It Provides |
|-------------|-----------------|
| `/proc/net/tcp`, `/proc/net/tcp6` (per network namespace) | Active TCP connections with state, local/remote addresses, inode |
| `/proc/net/udp`, `/proc/net/udp6` | Active UDP sockets |
| `conntrack -L` (via netfilter netlink) | Connection tracking table with NAT resolution (src→dst after DNAT) |
| `/proc/[pid]/net/dev` (per init PID of pod) | Per-pod network interface counters |

**Mapping connections to pods:** 
1. Read `/proc/net/tcp` entries which include socket inode numbers
2. Scan `/proc/[pid]/fd/` to find which PID owns each socket inode
3. Map PID → container → pod via cgroup association in MetadataCache

**Phase 2: eBPF socket tracking**

Attach eBPF programs to `tcp_connect`, `tcp_accept`, `tcp_close`, `udp_sendmsg`, `udp_recvmsg` kprobes. This gives real-time connection events without polling, and automatically resolves the cgroup → pod mapping.

#### What Is Collected

| Field | Description | Collection Interval |
|-------|-------------|-------------------|
| Source pod (namespace/name) | Initiating pod | 30s (Phase 1), real-time (Phase 2) |
| Destination pod or external IP | Target of connection | 30s / real-time |
| Destination service (if resolved via conntrack DNAT) | K8s Service name | 30s / real-time |
| Protocol | TCP, UDP | 30s / real-time |
| Destination port | Target port | 30s / real-time |
| Connection state | ESTABLISHED, TIME_WAIT, CLOSE_WAIT, etc. | 30s |
| Bytes sent/received (per-connection if available) | Traffic volume | 30s |
| DNS queries | Parsed from UDP port 53 traffic (eBPF Phase 2 only) | Real-time |

#### Data Format

```protobuf
message NetworkSnapshot {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  repeated PodConnection connections = 4;
}

message PodConnection {
  // Source
  string src_namespace = 1;
  string src_pod = 2;
  string src_ip = 3;
  int32 src_port = 4;
  
  // Destination
  string dst_namespace = 5;
  string dst_pod = 6;           // empty if external
  string dst_service = 7;       // K8s Service name if applicable
  string dst_ip = 8;
  int32 dst_port = 9;
  bool dst_is_external = 10;
  
  // Connection details
  string protocol = 11;         // TCP, UDP
  string state = 12;            // ESTABLISHED, etc.
  int64 bytes_sent = 13;
  int64 bytes_received = 14;
  int64 connection_start_ms = 15;
}
```

#### Buffering & Transport
- **Snapshot frequency:** Every 30 seconds
- **Buffer:** 100 snapshots (~20MB)
- **Compression:** Snappy
- **Transport:** gRPC unary RPCs

---

### 4.6 Cost Data Collector

#### Purpose
Collect raw resource utilization data with enough granularity to calculate per-pod, per-namespace, and per-team cost allocation on the backend.

#### Collection Method

This module does **not** calculate costs itself. It collects the raw inputs needed for cost calculation, which happens on the Voyager Platform backend where cloud pricing data is available.

**Data collected from each container (via Metrics Collector):**

| Input | Source | Used For |
|-------|--------|----------|
| CPU usage (millicores) | cgroup `cpu.stat` | CPU cost = usage × price_per_millicore_second |
| Memory usage (bytes) | cgroup `memory.current` | Memory cost = max(usage, request) × price_per_byte_second |
| CPU request (millicores) | K8s API | Reservation-based cost model |
| CPU limit (millicores) | K8s API | Over-provisioning analysis |
| Memory request (bytes) | K8s API | Reservation-based cost model |
| Memory limit (bytes) | K8s API | Over-provisioning analysis |
| PVC usage (bytes) | kubelet VolumeStats API | Storage cost |
| Network egress (bytes) | `/proc/[pid]/net/dev` | Network cost (egress pricing) |
| GPU utilization | NVIDIA DCGM or `/proc/driver/nvidia/` | GPU cost (if applicable) |

**Additional data collected per node:**

| Input | Source | Used For |
|-------|--------|----------|
| Instance type | Node labels (`node.kubernetes.io/instance-type`) | Map to cloud provider pricing |
| Region/zone | Node labels (`topology.kubernetes.io/region`, `topology.kubernetes.io/zone`) | Region-specific pricing |
| Capacity (CPU, memory) | Node `.status.capacity` | Total allocatable resources |
| Allocatable (CPU, memory) | Node `.status.allocatable` | Resources available for pods |
| Spot/preemptible | Node labels (`eks.amazonaws.com/capacityType`, `kubernetes.azure.com/scalesetpriority`) | Spot pricing |
| Node creation time | Node `.metadata.creationTimestamp` | Node uptime for cost calculation |

**Data collected per PersistentVolumeClaim:**

| Input | Source | Used For |
|-------|--------|----------|
| Storage class | PVC `.spec.storageClassName` | Map to storage pricing (gp3, premium SSD, etc.) |
| Requested size | PVC `.spec.resources.requests.storage` | Storage cost |
| Actual usage | kubelet VolumeStats API | Utilization efficiency |

#### Data Format

```protobuf
message CostDataBatch {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  NodeCostData node_data = 4;
  repeated ContainerCostData container_data = 5;
  repeated PVCCostData pvc_data = 6;
}

message NodeCostData {
  string instance_type = 1;
  string region = 2;
  string zone = 3;
  string capacity_type = 4;        // on-demand, spot, preemptible
  int64 cpu_capacity_millicores = 5;
  int64 memory_capacity_bytes = 6;
  int64 cpu_allocatable_millicores = 7;
  int64 memory_allocatable_bytes = 8;
  int64 node_creation_timestamp_ms = 9;
  int32 pod_count = 10;
}

message ContainerCostData {
  string namespace = 1;
  string pod_name = 2;
  string container_name = 3;
  string owner_kind = 4;
  string owner_name = 5;
  map<string, string> labels = 6;  // for team/cost-center allocation
  
  // CPU
  int64 cpu_usage_millicores = 10;
  int64 cpu_request_millicores = 11;
  int64 cpu_limit_millicores = 12;
  int64 cpu_throttled_usec = 13;
  
  // Memory
  int64 memory_usage_bytes = 14;
  int64 memory_request_bytes = 15;
  int64 memory_limit_bytes = 16;
  int64 memory_oom_kills = 17;
  
  // Network
  int64 network_rx_bytes = 18;
  int64 network_tx_bytes = 19;
}

message PVCCostData {
  string namespace = 1;
  string pvc_name = 2;
  string storage_class = 3;
  int64 requested_bytes = 4;
  int64 used_bytes = 5;
  string bound_pod = 6;
}
```

#### Collection Interval
- **Container resource usage:** Every 60 seconds (cost attribution doesn't need 15s granularity)
- **Node metadata:** Every 5 minutes (rarely changes)
- **PVC data:** Every 5 minutes

#### Transport
- **Transport:** gRPC unary RPCs batched with metrics (same connection)
- **Compression:** Snappy

---

## 5. Data Transport Layer

### 5.1 gRPC Service Definition

The primary transport between Voyager Monitor and the Voyager Platform backend is gRPC with mTLS.

```protobuf
syntax = "proto3";
package voyager.monitor.v1;

service VoyagerIngestion {
  // Bidirectional streaming for metrics — agent streams data, 
  // server streams back acknowledgments and config updates
  rpc StreamMetrics(stream MetricsBatch) returns (stream MetricsAck);
  
  // Client-side streaming for logs
  rpc StreamLogs(stream LogBatch) returns (LogsAck);
  
  // Unary RPCs for lower-volume data
  rpc SendEvents(K8sEventBatch) returns (EventsAck);
  rpc SendSecurityEvents(SecurityEventBatch) returns (SecurityEventsAck);
  rpc SendNetworkSnapshot(NetworkSnapshot) returns (NetworkAck);
  rpc SendCostData(CostDataBatch) returns (CostDataAck);
  
  // Agent registration and heartbeat
  rpc Register(AgentRegistration) returns (AgentConfig);
  rpc Heartbeat(AgentHeartbeat) returns (AgentConfig);
}

message AgentRegistration {
  string cluster_id = 1;
  string node_name = 2;
  string agent_version = 3;
  repeated string enabled_modules = 4;
  NodeCapabilities capabilities = 5;
}

message NodeCapabilities {
  bool ebpf_supported = 1;
  string kernel_version = 2;
  bool btf_available = 3;
  string cgroup_version = 4;       // "v1" or "v2"
  string container_runtime = 5;    // "containerd", "cri-o", "docker"
  string os = 6;
  string arch = 7;
}

message AgentConfig {
  int32 metrics_interval_seconds = 1;
  int32 logs_batch_size = 2;
  int32 logs_flush_interval_seconds = 3;
  repeated string log_label_whitelist = 4;     // which pod labels to include in log entries
  repeated SecurityRule security_rules = 5;     // detection rules pushed from backend
  map<string, string> feature_flags = 6;
  int32 config_version = 7;
}

message AgentHeartbeat {
  string cluster_id = 1;
  string node_name = 2;
  string agent_version = 3;
  int32 config_version = 4;
  map<string, ModuleStatus> module_statuses = 5;
  AgentResourceUsage resource_usage = 6;
}

message ModuleStatus {
  string state = 1;          // RUNNING, DEGRADED, STOPPED, ERROR
  string last_error = 2;
  int64 items_collected = 3;
  int64 items_dropped = 4;
  int64 last_flush_ms = 5;
}

message AgentResourceUsage {
  double cpu_percent = 1;
  int64 memory_bytes = 2;
  int64 goroutine_count = 3;
  int64 open_fds = 4;
}

message MetricsAck {
  bool success = 1;
  int64 received_count = 2;
  AgentConfig updated_config = 3;  // non-nil if config has changed
}

// Similar ack messages for other data types...
message LogsAck { bool success = 1; int64 received_count = 2; }
message EventsAck { bool success = 1; int64 received_count = 2; }
message SecurityEventsAck { bool success = 1; int64 received_count = 2; }
message NetworkAck { bool success = 1; }
message CostDataAck { bool success = 1; }
```

### 5.2 Connection Management

```
┌────────────────────┐          ┌────────────────────────┐
│  Voyager Monitor   │          │  Voyager Platform      │
│  (per-node agent)  │          │  (Ingestion Gateway)   │
│                    │          │                        │
│  ┌──────────────┐  │  gRPC    │  ┌──────────────────┐ │
│  │ Connection   │──┼──mTLS───▶│  │ gRPC Server      │ │
│  │ Manager      │  │  HTTP/2  │  │ (per-cluster     │ │
│  │              │  │          │  │  connection pool) │ │
│  │ - 1 conn per │  │          │  └──────────────────┘ │
│  │   backend    │  │          │                        │
│  │ - auto       │  │          │                        │
│  │   reconnect  │  │          │                        │
│  │ - backoff    │  │          │                        │
│  └──────────────┘  │          └────────────────────────┘
└────────────────────┘
```

- **Single gRPC connection** per agent to the backend, multiplexed via HTTP/2 streams
- **mTLS authentication:** Agent uses a client certificate generated during Helm install (stored in a K8s Secret). Backend validates against the cluster's CA.
- **Reconnection:** Exponential backoff starting at 1s, max 60s, with jitter
- **Keepalive:** gRPC keepalive pings every 30s with 10s timeout
- **Compression:** Per-message Snappy compression via gRPC compressor

### 5.3 Fallback: HTTP Transport

When gRPC is not available (proxy limitations, firewall restrictions), the agent falls back to HTTP:

- **Endpoint:** `POST /api/v1/ingest/{data_type}`
- **Content-Type:** `application/x-protobuf`
- **Content-Encoding:** `snappy` or `zstd`
- **Authentication:** Bearer token (same as gRPC client cert, but token-based for HTTP)
- **Batching:** Same as gRPC batching, but sent as HTTP POST bodies

### 5.4 Prometheus Remote-Write Compatibility

For metrics, the agent can optionally export in Prometheus remote-write v2 format:

- **Wire format:** `io.prometheus.write.v2.Request` protobuf, Snappy compressed
- **Endpoint:** Configurable remote-write URL (e.g., VictoriaMetrics, Mimir, Thanos)
- **Use case:** Users who want to keep their existing Prometheus/Grafana stack alongside Voyager Platform
- **Label mapping:** K8s metadata labels are mapped to Prometheus labels: `namespace`, `pod`, `container`, `node`, `owner_kind`, `owner_name`

---

## 6. Protobuf Definitions

All protobuf definitions are consolidated in a single proto package. The full `.proto` file:

```protobuf
syntax = "proto3";
package voyager.monitor.v1;

option go_package = "github.com/voyager-platform/voyager-monitor/pkg/proto/v1";

// ──────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────

service VoyagerIngestion {
  rpc StreamMetrics(stream MetricsBatch) returns (stream MetricsAck);
  rpc StreamLogs(stream LogBatch) returns (LogsAck);
  rpc SendEvents(K8sEventBatch) returns (EventsAck);
  rpc SendSecurityEvents(SecurityEventBatch) returns (SecurityEventsAck);
  rpc SendNetworkSnapshot(NetworkSnapshot) returns (NetworkAck);
  rpc SendCostData(CostDataBatch) returns (CostDataAck);
  rpc Register(AgentRegistration) returns (AgentConfig);
  rpc Heartbeat(AgentHeartbeat) returns (AgentConfig);
}

// ──────────────────────────────────────────────────
// Common
// ──────────────────────────────────────────────────

message K8sObjectRef {
  string kind = 1;
  string namespace = 2;
  string name = 3;
  string uid = 4;
  string api_version = 5;
}

message ProcessInfo {
  int32 pid = 1;
  int32 tid = 2;
  int32 ppid = 3;
  int32 uid = 4;
  int32 gid = 5;
  string comm = 6;
  string exe = 7;
  string cmdline = 8;
  uint64 cap_effective = 9;
}

// ──────────────────────────────────────────────────
// Metrics
// ──────────────────────────────────────────────────

message MetricsBatch {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  repeated NodeMetric node_metrics = 4;
  repeated ContainerMetric container_metrics = 5;
}

message NodeMetric {
  string name = 1;
  double value = 2;
  map<string, string> labels = 3;
}

message ContainerMetric {
  string namespace = 1;
  string pod_name = 2;
  string container_name = 3;
  string container_id = 4;
  string owner_kind = 5;
  string owner_name = 6;
  string name = 7;
  double value = 8;
  map<string, string> labels = 9;
}

message MetricsAck {
  bool success = 1;
  int64 received_count = 2;
  AgentConfig updated_config = 3;
}

// ──────────────────────────────────────────────────
// Logs
// ──────────────────────────────────────────────────

message LogBatch {
  string cluster_id = 1;
  string node_name = 2;
  repeated LogEntry entries = 3;
}

message LogEntry {
  int64 timestamp_ns = 1;
  string namespace = 2;
  string pod_name = 3;
  string container_name = 4;
  string container_id = 5;
  string owner_kind = 6;
  string owner_name = 7;
  string stream = 8;
  string severity = 9;
  string message = 10;
  map<string, string> labels = 11;
  map<string, string> parsed_fields = 12;
}

message LogsAck {
  bool success = 1;
  int64 received_count = 2;
}

// ──────────────────────────────────────────────────
// Kubernetes Events
// ──────────────────────────────────────────────────

message K8sEventBatch {
  string cluster_id = 1;
  repeated K8sEvent events = 2;
}

message K8sEvent {
  int64 timestamp_ms = 1;
  string type = 2;
  string reason = 3;
  string message = 4;
  string category = 5;
  string priority = 6;
  K8sObjectRef involved_object = 7;
  string source_component = 8;
  string source_host = 9;
  int64 first_timestamp_ms = 10;
  int64 last_timestamp_ms = 11;
  int32 count = 12;
}

message EventsAck {
  bool success = 1;
  int64 received_count = 2;
}

// ──────────────────────────────────────────────────
// Security Events
// ──────────────────────────────────────────────────

message SecurityEventBatch {
  string cluster_id = 1;
  string node_name = 2;
  repeated SecurityEvent events = 3;
}

message SecurityEvent {
  int64 timestamp_ns = 1;
  string event_type = 2;
  string severity = 3;
  string rule_id = 4;
  string description = 5;
  ProcessInfo process = 6;
  ProcessInfo parent_process = 7;
  string namespace = 8;
  string pod_name = 9;
  string container_name = 10;
  string container_id = 11;
  oneof details {
    FileEvent file_event = 20;
    NetworkEvent network_event = 21;
    ProcessEvent process_event = 22;
    SyscallEvent syscall_event = 23;
  }
}

message FileEvent {
  string path = 1;
  string operation = 2;
  int32 flags = 3;
  string old_hash = 4;
  string new_hash = 5;
}

message NetworkEvent {
  string src_ip = 1;
  int32 src_port = 2;
  string dst_ip = 3;
  int32 dst_port = 4;
  string protocol = 5;
  string operation = 6;
}

message ProcessEvent {
  string operation = 1;
  int32 exit_code = 2;
  string new_exe = 3;
}

message SyscallEvent {
  int32 syscall_nr = 1;
  string syscall_name = 2;
  int64 return_value = 3;
}

message SecurityEventsAck {
  bool success = 1;
  int64 received_count = 2;
}

// ──────────────────────────────────────────────────
// Network
// ──────────────────────────────────────────────────

message NetworkSnapshot {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  repeated PodConnection connections = 4;
}

message PodConnection {
  string src_namespace = 1;
  string src_pod = 2;
  string src_ip = 3;
  int32 src_port = 4;
  string dst_namespace = 5;
  string dst_pod = 6;
  string dst_service = 7;
  string dst_ip = 8;
  int32 dst_port = 9;
  bool dst_is_external = 10;
  string protocol = 11;
  string state = 12;
  int64 bytes_sent = 13;
  int64 bytes_received = 14;
  int64 connection_start_ms = 15;
}

message NetworkAck {
  bool success = 1;
}

// ──────────────────────────────────────────────────
// Cost Data
// ──────────────────────────────────────────────────

message CostDataBatch {
  string cluster_id = 1;
  string node_name = 2;
  int64 timestamp_ms = 3;
  NodeCostData node_data = 4;
  repeated ContainerCostData container_data = 5;
  repeated PVCCostData pvc_data = 6;
}

message NodeCostData {
  string instance_type = 1;
  string region = 2;
  string zone = 3;
  string capacity_type = 4;
  int64 cpu_capacity_millicores = 5;
  int64 memory_capacity_bytes = 6;
  int64 cpu_allocatable_millicores = 7;
  int64 memory_allocatable_bytes = 8;
  int64 node_creation_timestamp_ms = 9;
  int32 pod_count = 10;
}

message ContainerCostData {
  string namespace = 1;
  string pod_name = 2;
  string container_name = 3;
  string owner_kind = 4;
  string owner_name = 5;
  map<string, string> labels = 6;
  int64 cpu_usage_millicores = 10;
  int64 cpu_request_millicores = 11;
  int64 cpu_limit_millicores = 12;
  int64 cpu_throttled_usec = 13;
  int64 memory_usage_bytes = 14;
  int64 memory_request_bytes = 15;
  int64 memory_limit_bytes = 16;
  int64 memory_oom_kills = 17;
  int64 network_rx_bytes = 18;
  int64 network_tx_bytes = 19;
}

message PVCCostData {
  string namespace = 1;
  string pvc_name = 2;
  string storage_class = 3;
  int64 requested_bytes = 4;
  int64 used_bytes = 5;
  string bound_pod = 6;
}

message CostDataAck {
  bool success = 1;
}

// ──────────────────────────────────────────────────
// Agent Lifecycle
// ──────────────────────────────────────────────────

message AgentRegistration {
  string cluster_id = 1;
  string node_name = 2;
  string agent_version = 3;
  repeated string enabled_modules = 4;
  NodeCapabilities capabilities = 5;
}

message NodeCapabilities {
  bool ebpf_supported = 1;
  string kernel_version = 2;
  bool btf_available = 3;
  string cgroup_version = 4;
  string container_runtime = 5;
  string os = 6;
  string arch = 7;
}

message AgentConfig {
  int32 metrics_interval_seconds = 1;
  int32 logs_batch_size = 2;
  int32 logs_flush_interval_seconds = 3;
  repeated string log_label_whitelist = 4;
  repeated SecurityRule security_rules = 5;
  map<string, string> feature_flags = 6;
  int32 config_version = 7;
}

message SecurityRule {
  string id = 1;
  string name = 2;
  string description = 3;
  string severity = 4;
  string condition = 5;    // rule expression (e.g., "process.exe == '/bin/sh' && container.id != ''")
  bool enabled = 6;
  repeated string tags = 7;
}

message AgentHeartbeat {
  string cluster_id = 1;
  string node_name = 2;
  string agent_version = 3;
  int32 config_version = 4;
  map<string, ModuleStatus> module_statuses = 5;
  AgentResourceUsage resource_usage = 6;
}

message ModuleStatus {
  string state = 1;
  string last_error = 2;
  int64 items_collected = 3;
  int64 items_dropped = 4;
  int64 last_flush_ms = 5;
}

message AgentResourceUsage {
  double cpu_percent = 1;
  int64 memory_bytes = 2;
  int64 goroutine_count = 3;
  int64 open_fds = 4;
}
```

---

## 7. Helm Chart Configuration

### 7.1 values.yaml

```yaml
# ============================================================
# Voyager Monitor Helm Chart - values.yaml
# ============================================================

# -- Global configuration
global:
  # -- Cluster identifier (required, set during install)
  clusterId: ""
  # -- Voyager Platform backend endpoint
  backend:
    # -- gRPC endpoint for data ingestion
    grpcEndpoint: "ingest.voyagerplatform.io:443"
    # -- HTTP fallback endpoint
    httpEndpoint: "https://ingest.voyagerplatform.io"
    # -- Use gRPC (true) or HTTP fallback (false)
    useGrpc: true
    # -- TLS configuration
    tls:
      enabled: true
      # -- Skip TLS verification (NOT recommended for production)
      insecureSkipVerify: false
      # -- Custom CA certificate (base64 encoded)
      caCert: ""
  # -- Authentication
  auth:
    # -- API key for authentication (required)
    apiKey: ""
    # -- Or reference an existing secret
    existingSecret: ""
    existingSecretKey: "api-key"

# -- Image configuration
image:
  repository: "ghcr.io/voyager-platform/voyager-monitor"
  tag: ""  # defaults to chart appVersion
  pullPolicy: IfNotPresent

imagePullSecrets: []

# -- Agent self-monitoring (exposes /metrics for Prometheus scraping)
selfMonitoring:
  enabled: true
  port: 9090
  path: /metrics

# -- Health check endpoint
healthCheck:
  port: 8080
  path: /healthz
  readinessPath: /readyz

# ============================================================
# Module Configuration
# ============================================================

# -- Existing modules (preserved from current deployment)
audit:
  # -- Enable audit logging module
  enabled: true
  # -- Resources to watch for deletions
  watchedResources:
    - deployments
    - statefulsets
    - services
    - configmaps
    - secrets
    - namespaces
    - persistentvolumeclaims

nodeCleanup:
  # -- Enable stuck node cleanup module
  enabled: true
  # -- Grace period before draining a NotReady node (seconds)
  gracePeriodSeconds: 300
  # -- Enable automatic drain (false = alert only)
  autoDrain: false

# -- Metrics Collector
metrics:
  # -- Enable metrics collection
  enabled: true
  # -- Node metrics collection interval (seconds)
  nodeInterval: 15
  # -- Container metrics collection interval (seconds)
  containerInterval: 15
  # -- Cost-related metrics collection interval (seconds)
  costInterval: 60
  # -- Use kubelet summary API fallback instead of direct cgroup reads
  useKubeletFallback: false
  # -- Kubelet port (usually 10250)
  kubeletPort: 10250
  # -- Enable Prometheus remote-write export
  prometheusRemoteWrite:
    enabled: false
    endpoint: ""
    # -- Additional remote-write headers
    headers: {}
  # -- eBPF enhanced metrics (Phase 2, requires kernel >= 5.8)
  ebpf:
    enabled: false

# -- Log Collector
logs:
  # -- Enable log collection
  enabled: true
  # -- Container log path pattern
  logPath: "/var/log/pods"
  # -- Per-container log rate limit (lines/sec)
  perContainerRateLimit: 1000
  # -- Global log rate limit (lines/sec)
  globalRateLimit: 50000
  # -- Batch size (number of log entries per batch)
  batchSize: 1000
  # -- Flush interval (seconds)
  flushIntervalSeconds: 5
  # -- Maximum log line length (bytes). Longer lines are truncated.
  maxLineLength: 32768
  # -- Disk buffer for overflow
  diskBuffer:
    enabled: true
    path: "/var/lib/voyager-monitor/log-buffer"
    maxSizeMB: 500
  # -- Pod labels to include in log entries (empty = all labels)
  includePodLabels: []
  # -- Namespaces to exclude from log collection
  excludeNamespaces:
    - kube-system
  # -- Pod name patterns to exclude (regex)
  excludePods: []
  # -- Enable multiline detection (Java stack traces, Python tracebacks)
  multilineDetection: true
  # -- Enable structured log parsing (extract JSON fields)
  structuredLogParsing: true

# -- Kubernetes Event Watcher
events:
  # -- Enable K8s event watching
  enabled: true
  # -- Event types to watch (empty = all)
  watchTypes: []
  # -- Namespaces to exclude
  excludeNamespaces: []
  # -- Batch flush interval (seconds)
  flushIntervalSeconds: 5
  # -- Maximum batch size
  batchSize: 100

# -- Security Scanner
security:
  # -- Enable security scanning module
  enabled: false  # disabled by default; opt-in
  # -- Detection mode: "userspace" (any kernel) or "ebpf" (kernel >= 5.8 + BTF)
  mode: "userspace"
  # -- File integrity monitoring
  fileIntegrity:
    enabled: true
    # -- Paths to monitor for changes
    paths:
      - /etc/passwd
      - /etc/shadow
      - /etc/group
      - /etc/sudoers
      - /etc/ssh/sshd_config
      - /etc/kubernetes
      - /var/lib/kubelet/config.yaml
    # -- Hash algorithm (sha256 or sha512)
    hashAlgorithm: "sha256"
    # -- Check interval for non-inotify paths (seconds)
    checkInterval: 30
  # -- Process execution tracking
  processTracking:
    enabled: true
    # -- Suspicious executables to alert on
    suspiciousExecutables:
      - /bin/sh
      - /bin/bash
      - /bin/dash
      - /usr/bin/wget
      - /usr/bin/curl
      - /usr/bin/nc
      - /usr/bin/ncat
      - /usr/bin/nmap
      - /usr/bin/socat
      - /usr/bin/ssh
      - /usr/bin/scp
      - /usr/bin/python
      - /usr/bin/python3
      - /usr/bin/perl
      - /usr/bin/ruby
      - /usr/bin/php
    # -- Poll interval for userspace mode (seconds)
    pollInterval: 5
  # -- Network connection monitoring within security context
  networkMonitoring:
    enabled: true
    # -- Alert on connections to known malicious IPs (threat intel feed)
    threatIntelFeed: ""
  # -- Container escape detection
  containerEscapeDetection:
    enabled: true
  # -- Custom detection rules (in addition to built-in rules)
  customRules: []
  # -- Namespaces to exclude from security scanning
  excludeNamespaces:
    - kube-system

# -- Network Monitor
network:
  # -- Enable network monitoring
  enabled: true
  # -- Snapshot interval (seconds)
  snapshotInterval: 30
  # -- Use conntrack for NAT-aware connection tracking
  useConntrack: true
  # -- eBPF socket tracking (Phase 2)
  ebpf:
    enabled: false
  # -- Exclude connections to/from these CIDRs
  excludeCIDRs: []
  # -- Exclude connections on these ports
  excludePorts: []

# -- Cost Data Collector
cost:
  # -- Enable cost data collection
  enabled: true
  # -- Collection interval (seconds)
  interval: 60
  # -- Labels to use for cost allocation (e.g., team, department)
  allocationLabels:
    - "team"
    - "department"
    - "cost-center"
    - "app"
    - "environment"
  # -- Include PVC cost data
  includePVC: true

# ============================================================
# Resource Configuration
# ============================================================

resources:
  requests:
    cpu: "100m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

# -- Per-module resource budgets (soft limits enforced in-process)
moduleBudgets:
  metrics:
    maxCpuPercent: 15
    maxMemoryMB: 64
  logs:
    maxCpuPercent: 20
    maxMemoryMB: 128
  events:
    maxCpuPercent: 5
    maxMemoryMB: 32
  security:
    maxCpuPercent: 20
    maxMemoryMB: 128
  network:
    maxCpuPercent: 10
    maxMemoryMB: 64
  cost:
    maxCpuPercent: 5
    maxMemoryMB: 32

# ============================================================
# Scheduling
# ============================================================

# -- Node selector
nodeSelector: {}

# -- Tolerations (default: tolerate all taints to run on ALL nodes)
tolerations:
  - operator: Exists

# -- Affinity rules
affinity: {}

# -- Priority class name (recommend high priority for monitoring)
priorityClassName: "system-node-critical"

# -- Update strategy
updateStrategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 1
    maxSurge: 0

# ============================================================
# Security Context
# ============================================================

podSecurityContext:
  runAsUser: 0
  runAsGroup: 0

containerSecurityContext:
  privileged: false
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    add:
      # Required for reading /proc and cgroup files of other containers
      - SYS_PTRACE
      # Required for reading /proc/[pid]/root for FIM
      - DAC_READ_SEARCH
      # Required for conntrack access
      - NET_ADMIN
      # Required for eBPF (only if security.mode=ebpf)
      # - SYS_ADMIN  # added dynamically when eBPF is enabled
      # - SYS_RESOURCE
      # - BPF
      # - PERFMON
    drop:
      - ALL

# ============================================================
# Volume Mounts
# ============================================================

# These are automatically configured; override only if needed
volumeMounts:
  # -- Host /proc (read-only, for metrics + security)
  hostProc: "/proc"
  # -- Host /sys (read-only, for cgroup access)
  hostSys: "/sys"
  # -- Container log directory (read-only, for log collection)
  hostVarLogPods: "/var/log/pods"
  # -- Container runtime socket (read-only, for container metadata)
  containerRuntimeSocket: "/run/containerd/containerd.sock"
  # -- Persistent state directory (read-write, for offset tracking)
  stateDir: "/var/lib/voyager-monitor"

# ============================================================
# RBAC
# ============================================================

rbac:
  # -- Create RBAC resources
  create: true

serviceAccount:
  # -- Create service account
  create: true
  # -- Service account name
  name: "voyager-monitor"
  # -- Annotations for service account (e.g., for IRSA on EKS)
  annotations: {}
```

### 7.2 RBAC Requirements

```yaml
# ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: voyager-monitor
rules:
  # -- Core resources: pods, nodes, events, services, endpoints
  - apiGroups: [""]
    resources:
      - pods
      - pods/log
      - nodes
      - nodes/stats
      - nodes/proxy
      - events
      - services
      - endpoints
      - namespaces
      - persistentvolumeclaims
      - persistentvolumes
      - configmaps
      - secrets
      - replicationcontrollers
      - resourcequotas
      - limitranges
    verbs: ["get", "list", "watch"]

  # -- Workload resources
  - apiGroups: ["apps"]
    resources:
      - deployments
      - statefulsets
      - daemonsets
      - replicasets
    verbs: ["get", "list", "watch"]

  # -- Batch resources
  - apiGroups: ["batch"]
    resources:
      - jobs
      - cronjobs
    verbs: ["get", "list", "watch"]

  # -- Autoscaling
  - apiGroups: ["autoscaling"]
    resources:
      - horizontalpodautoscalers
    verbs: ["get", "list", "watch"]

  # -- Network policies (for network monitor)
  - apiGroups: ["networking.k8s.io"]
    resources:
      - networkpolicies
      - ingresses
    verbs: ["get", "list", "watch"]

  # -- Storage classes (for cost data)
  - apiGroups: ["storage.k8s.io"]
    resources:
      - storageclasses
    verbs: ["get", "list", "watch"]

  # -- Node operations (for stuck node cleanup)
  - apiGroups: [""]
    resources:
      - nodes
    verbs: ["patch", "update"]  # for cordon/uncordon
  - apiGroups: [""]
    resources:
      - pods/eviction
    verbs: ["create"]  # for drain

  # -- Kubelet stats API access (when using kubelet fallback)
  - apiGroups: [""]
    resources:
      - nodes/stats
    verbs: ["get"]

---
# ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: voyager-monitor
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: voyager-monitor
subjects:
  - kind: ServiceAccount
    name: voyager-monitor
    namespace: voyager-system
```

### 7.3 DaemonSet Manifest (generated by Helm)

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: voyager-monitor
  namespace: voyager-system
  labels:
    app.kubernetes.io/name: voyager-monitor
    app.kubernetes.io/part-of: voyager-platform
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: voyager-monitor
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: voyager-monitor
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: voyager-monitor
      priorityClassName: system-node-critical
      hostPID: false      # we don't need host PID namespace
      hostNetwork: false   # we don't need host network
      dnsPolicy: ClusterFirst
      tolerations:
        - operator: Exists  # run on ALL nodes including masters
      containers:
        - name: voyager-monitor
          image: "ghcr.io/voyager-platform/voyager-monitor:{{ .Values.image.tag }}"
          imagePullPolicy: IfNotPresent
          args:
            - "--config=/etc/voyager-monitor/config.yaml"
          ports:
            - name: metrics
              containerPort: 9090
              protocol: TCP
            - name: health
              containerPort: 8080
              protocol: TCP
          env:
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: VOYAGER_CLUSTER_ID
              value: "{{ .Values.global.clusterId }}"
            - name: VOYAGER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: voyager-monitor-auth
                  key: api-key
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          securityContext:
            privileged: false
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
              add: ["SYS_PTRACE", "DAC_READ_SEARCH", "NET_ADMIN"]
          livenessProbe:
            httpGet:
              path: /healthz
              port: health
            initialDelaySeconds: 15
            periodSeconds: 30
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /readyz
              port: health
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
          volumeMounts:
            - name: host-proc
              mountPath: /host/proc
              readOnly: true
            - name: host-sys
              mountPath: /host/sys
              readOnly: true
            - name: host-var-log-pods
              mountPath: /host/var/log/pods
              readOnly: true
            - name: container-runtime-socket
              mountPath: /host/run/containerd/containerd.sock
              readOnly: true
            - name: state
              mountPath: /var/lib/voyager-monitor
            - name: config
              mountPath: /etc/voyager-monitor
              readOnly: true
      volumes:
        - name: host-proc
          hostPath:
            path: /proc
        - name: host-sys
          hostPath:
            path: /sys
        - name: host-var-log-pods
          hostPath:
            path: /var/log/pods
        - name: container-runtime-socket
          hostPath:
            path: /run/containerd/containerd.sock
        - name: state
          hostPath:
            path: /var/lib/voyager-monitor
            type: DirectoryOrCreate
        - name: config
          configMap:
            name: voyager-monitor-config
```

---

## 8. Security Scanning Module Deep Dive

### 8.1 Architecture

The Security Scanner implements a **rule-based detection engine** that evaluates system events against a set of rules (both built-in and user-defined).

```
┌─────────────────────────────────────────────────────────────┐
│                  SECURITY SCANNER MODULE                     │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  Data Sources   │  │  Data Sources   │  │ Data Sources  │  │
│  │  (Phase 1:      │  │  (Phase 2:      │  │ (always):     │  │
│  │   userspace)    │  │   eBPF)         │  │  K8s API      │  │
│  │                 │  │                 │  │               │  │
│  │ - /proc scan    │  │ - execve tp     │  │ - Pod specs   │  │
│  │ - inotify/FIM   │  │ - openat tp     │  │ - RBAC audit  │  │
│  │ - procfs poll   │  │ - connect tp    │  │ - Admission   │  │
│  └───────┬─────────┘  └───────┬─────────┘  └──────┬────────┘  │
│          │                    │                    │           │
│          └──────────┬─────────┘                    │           │
│                     ▼                              │           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              EVENT NORMALIZATION LAYER                    │ │
│  │  Raw events → SecurityEvent protobuf with full context   │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              RULE EVALUATION ENGINE                       │ │
│  │                                                           │ │
│  │  Built-in rules:              Custom rules:              │ │
│  │  - Shell in container         - User-defined via Helm    │ │
│  │  - Privilege escalation       - Pushed from backend      │ │
│  │  - Suspicious binary exec     - Expression language:     │ │
│  │  - File integrity violation     "process.exe == '/bin/sh'│ │
│  │  - Crypto miner patterns        && container.id != ''"   │ │
│  │  - Container escape attempt                              │ │
│  │  - Known exploit patterns                                │ │
│  │  - Reverse shell detection                               │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              ALERT PRIORITY QUEUE                         │ │
│  │  Critical → immediate flush                              │ │
│  │  High/Medium/Low → batched flush (5-10s)                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Syscall Monitoring Approach

#### Phase 1: Userspace Process Tracking

Periodically scan `/proc/` to detect new processes:

```go
// ProcessTracker scans /proc every pollInterval for new processes
type ProcessTracker struct {
    knownPIDs    map[int32]*ProcessInfo
    pollInterval time.Duration
    rules        []DetectionRule
}

func (pt *ProcessTracker) scan() []SecurityEvent {
    entries, _ := os.ReadDir("/proc")
    currentPIDs := make(map[int32]bool)
    var events []SecurityEvent
    
    for _, entry := range entries {
        pid, err := strconv.ParseInt(entry.Name(), 10, 32)
        if err != nil { continue } // skip non-PID entries
        
        currentPIDs[int32(pid)] = true
        
        if _, known := pt.knownPIDs[int32(pid)]; !known {
            // New process detected
            info := readProcessInfo(int32(pid))
            pt.knownPIDs[int32(pid)] = info
            
            // Evaluate rules
            for _, rule := range pt.rules {
                if rule.Matches(info) {
                    events = append(events, rule.CreateEvent(info))
                }
            }
        }
    }
    
    // Clean up exited processes
    for pid := range pt.knownPIDs {
        if !currentPIDs[pid] { delete(pt.knownPIDs, pid) }
    }
    
    return events
}
```

**Limitations of userspace approach:**
- 5-second poll interval means short-lived processes (<5s) may be missed
- Higher CPU overhead than eBPF due to frequent `/proc` scanning
- Cannot capture syscall arguments

#### Phase 2: eBPF Tracepoint Programs

Using `cilium/ebpf` with CO-RE to attach to syscall tracepoints:

```c
// Simplified eBPF program for execve monitoring (compiled with bpf2go)
SEC("tracepoint/syscalls/sys_enter_execve")
int trace_execve(struct trace_event_raw_sys_enter *ctx) {
    struct event_t event = {};
    
    event.pid = bpf_get_current_pid_tgid() >> 32;
    event.tid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    event.uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    event.timestamp = bpf_ktime_get_ns();
    
    // Read the filename argument
    const char *filename = (const char *)ctx->args[0];
    bpf_probe_read_user_str(&event.filename, sizeof(event.filename), filename);
    
    // Read the comm (process name)
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    // Get cgroup ID for container mapping
    event.cgroup_id = bpf_get_current_cgroup_id();
    
    // Submit to ring buffer
    bpf_ringbuf_output(&events, &event, sizeof(event), 0);
    
    return 0;
}
```

**eBPF ring buffer configuration:**
- Default ring buffer size: 8MB per CPU (configurable)
- Events are read from Go userspace via `ringbuf.Reader`
- Backpressure: if ring buffer is full, events are dropped (counter tracked)

**Required Linux capabilities for eBPF:**
- `CAP_BPF` (or `CAP_SYS_ADMIN` on kernels <5.8)
- `CAP_PERFMON` (for tracepoint attachment)
- `CAP_SYS_RESOURCE` (for `setrlimit` memlock increase)
- `CAP_SYS_PTRACE` (for reading `/proc/[pid]/environ`)

### 8.3 File Integrity Monitoring (FIM)

#### Monitored Paths (default)

| Path | Why | Severity if Modified |
|------|-----|---------------------|
| `/etc/passwd` | User account changes | HIGH |
| `/etc/shadow` | Password hash changes | CRITICAL |
| `/etc/group` | Group membership changes | HIGH |
| `/etc/sudoers`, `/etc/sudoers.d/` | Privilege escalation risk | CRITICAL |
| `/etc/ssh/sshd_config` | SSH backdoor risk | CRITICAL |
| `/etc/kubernetes/` | Cluster credential theft | CRITICAL |
| `/var/lib/kubelet/config.yaml` | Kubelet configuration tampering | CRITICAL |
| `/etc/crontab`, `/etc/cron.d/` | Persistence mechanism | HIGH |
| `/etc/ld.so.preload` | LD_PRELOAD injection | CRITICAL |
| `/etc/pam.d/` | Authentication bypass | CRITICAL |

#### Implementation

```go
type FileIntegrityMonitor struct {
    watcher    *fsnotify.Watcher
    baselines  map[string]FileBaseline  // path → hash at startup
    hashAlgo   string                    // sha256 or sha512
}

type FileBaseline struct {
    Hash     string
    Mode     os.FileMode
    UID      int
    GID      int
    Size     int64
    ModTime  time.Time
}

// On startup, compute baseline hashes for all monitored paths
func (fim *FileIntegrityMonitor) computeBaseline(path string) FileBaseline {
    info, _ := os.Stat(path)
    h := sha256.New()
    f, _ := os.Open(path)
    io.Copy(h, f)
    f.Close()
    return FileBaseline{
        Hash:    hex.EncodeToString(h.Sum(nil)),
        Mode:    info.Mode(),
        UID:     /* from stat syscall */,
        Size:    info.Size(),
        ModTime: info.ModTime(),
    }
}

// inotify watches for real-time modification events
// Periodic re-scan (every checkInterval) catches changes missed by inotify
```

### 8.4 Process Execution Tracking — Built-in Detection Rules

| Rule ID | Name | Condition | Severity |
|---------|------|-----------|----------|
| `VM-SEC-001` | Shell spawned in container | `process.exe in ["/bin/sh", "/bin/bash", "/bin/dash"] && container.id != ""` | HIGH |
| `VM-SEC-002` | Package manager executed | `process.exe in ["/usr/bin/apt", "/usr/bin/yum", "/usr/bin/apk", "/usr/bin/dnf"]` | MEDIUM |
| `VM-SEC-003` | Network tool executed | `process.exe in ["/usr/bin/wget", "/usr/bin/curl", "/usr/bin/nc", "/usr/bin/nmap"]` | MEDIUM |
| `VM-SEC-004` | Privilege escalation attempt | `process.cap_effective changed && new cap includes CAP_SYS_ADMIN` | CRITICAL |
| `VM-SEC-005` | Setuid/setgid binary execution | `process.exe has setuid bit && container.id != ""` | HIGH |
| `VM-SEC-006` | Kernel module load attempt | `syscall == "init_module" \|\| syscall == "finit_module"` | CRITICAL |
| `VM-SEC-007` | Namespace manipulation | `syscall in ["setns", "unshare"] && container.id != ""` | CRITICAL |
| `VM-SEC-008` | Ptrace usage in container | `syscall == "ptrace" && container.id != ""` | HIGH |
| `VM-SEC-009` | Crypto miner signature | `process.cmdline matches /(xmrig|minerd|cgminer|stratum\+tcp)/` | HIGH |
| `VM-SEC-010` | Reverse shell pattern | `process.cmdline matches /\/dev\/tcp\// \|\| (process.exe == "/bin/sh" && fd points to socket)` | CRITICAL |
| `VM-SEC-011` | Container escape via mount | `syscall == "mount" && container.id != ""` | CRITICAL |
| `VM-SEC-012` | Write to /etc (sensitive config) | `file.path starts_with "/etc/" && file.operation in ["MODIFY", "CREATE"]` | MEDIUM |
| `VM-SEC-013` | Binary dropped in /tmp | `file.path matches /\/(tmp|dev\/shm)\/.*/ && file.operation == "CREATE" && file is executable` | HIGH |
| `VM-SEC-014` | Credential access | `file.path matches /(\.kube|\.aws|\.ssh|\.gnupg)/ && file.operation == "READ"` | HIGH |
| `VM-SEC-015` | Suspicious DNS resolution | `network.dst_port == 53 && dns.query matches known-bad patterns` | MEDIUM |

### 8.5 Container Escape Detection

| Escape Technique | Detection Method |
|-----------------|-----------------|
| **Privileged container abuse** | Check pod spec: `securityContext.privileged == true`, alert as risk. Runtime: detect mount of host filesystems. |
| **Docker socket mount** | Check for volume mount of `/var/run/docker.sock` or `/run/containerd/containerd.sock`. If a container process accesses these, alert. |
| **Host PID namespace** | Check pod spec: `hostPID == true`. Runtime: detect process enumeration outside container cgroup. |
| **Host network namespace** | Check pod spec: `hostNetwork == true`. Runtime: detect binding to host-level ports. |
| **Kernel exploit (dirty pipe, etc.)** | Detect unexpected capability acquisition, unexpected namespace changes, or process execution outside container cgroup boundaries. |
| **Symlink race conditions** | Detect `openat` calls with `O_NOFOLLOW` bypasses on sensitive paths. |
| **cgroup escape** | Monitor for writes to cgroup `release_agent` or `notify_on_release`. |

### 8.6 Comparison: Voyager Monitor vs. Separate Falco

| Aspect | Falco (standalone) | Voyager Monitor Security |
|--------|-------------------|-------------------------|
| **Deployment** | Separate DaemonSet + separate config | Built into existing DaemonSet — zero additional deployment |
| **Resource overhead** | 100-300MB RAM + 100-200m CPU per node | Shared process — adds ~50-100MB RAM, ~50-100m CPU to existing agent |
| **K8s metadata** | Must independently query API server for pod context | Shares MetadataCache with all modules — zero additional API load |
| **Data correlation** | Security events isolated; manual correlation with metrics/logs | Events automatically correlated: same timeline, same data model, same pod reference |
| **AI analysis** | Requires external pipeline to feed events to any AI | Events flow to Voyager AI which cross-references with metrics, logs, cost data |
| **Rules management** | YAML files, Helm values, manual updates | Rules pushed from backend UI, version-controlled, applied instantly |
| **Detection depth** | Deeper syscall coverage (~350+ syscalls), mature rulesets | Focused on high-value detections (~50 rules), expandable over time |
| **Community rules** | Rich community rule ecosystem | Start with curated subset; consider Falco rule import format compatibility |
| **Output** | gRPC/HTTP to SIEM, no native dashboard | Native integration with Voyager Platform dashboard |
| **Maintenance** | Separate upgrade cycle, separate config, separate monitoring | Single upgrade, single config, self-monitoring |
| **Cost** | Free (OSS), but requires operational effort | Included — no additional cost, no additional ops |

**Recommendation:** Use Voyager Monitor's built-in security for 80% of use cases. For organizations requiring the full depth of Falco's 350+ syscall coverage and community rules, support a Falco sidecar integration that forwards Falco's gRPC output into Voyager's ingestion pipeline.

### 8.7 Performance Impact Estimates

| Mode | CPU Impact per Node | Memory Impact per Node | Syscall Overhead |
|------|-------------------|----------------------|-----------------|
| **Security disabled** | 0 | 0 | 0 |
| **Userspace mode (Phase 1)** | +30-80m CPU (5s poll) | +40-80MB RAM | 0 (no syscall interception) |
| **eBPF mode (Phase 2)** | +50-150m CPU | +80-150MB RAM | <1% per-syscall overhead (measured by Falco: ~64ns per event) |

**Benchmark methodology:** Measure with `pprof` CPU/memory profiling under synthetic load of 100 containers per node generating 1000 process execs/min, 500 file modifications/min, 200 network connections/min.

---

## 9. Resource Budget & Scaling

### 9.1 Base Resource Budget (All Modules Enabled)

| Module | CPU Request | CPU Limit | Memory Request | Memory Limit |
|--------|------------|-----------|----------------|--------------|
| Core (config, health, k8s cache, pipeline) | 20m | 50m | 40MB | 60MB |
| Audit Logger (existing) | 10m | 30m | 20MB | 30MB |
| Node Cleanup (existing) | 5m | 20m | 10MB | 20MB |
| Metrics Collector | 30m | 80m | 40MB | 64MB |
| Log Collector | 40m | 100m | 80MB | 128MB |
| K8s Event Watcher | 10m | 30m | 20MB | 32MB |
| Security Scanner (userspace) | 30m | 80m | 40MB | 80MB |
| Security Scanner (eBPF) | 50m | 150m | 80MB | 150MB |
| Network Monitor | 20m | 60m | 30MB | 64MB |
| Cost Data Collector | 10m | 30m | 20MB | 32MB |
| **Total (userspace security)** | **175m** | **480m** | **300MB** | **510MB** |
| **Total (eBPF security)** | **195m** | **550m** | **340MB** | **580MB** |

**Default Helm values:** requests=100m/256Mi, limits=500m/512Mi (conservative; adjust based on workload)

### 9.2 Scaling Impact by Pod Density

The primary scaling factor is **number of containers per node**, which affects:
- MetadataCache size
- Number of cgroup files to read (metrics)
- Number of log files to tail (logs)
- Number of `/proc/[pid]` entries to scan (security)
- Number of network connections to track (network)

| Pods per Node | CPU Estimate | Memory Estimate | Network Bandwidth (to backend) |
|--------------|-------------|-----------------|-------------------------------|
| **10** | 100-150m | 200-300MB | ~50 KB/s |
| **50** | 150-250m | 300-400MB | ~200 KB/s |
| **100** | 200-350m | 350-500MB | ~400 KB/s |
| **200** | 300-450m | 450-650MB | ~800 KB/s |
| **500** | 400-600m | 600-900MB | ~1.5 MB/s |

**Detailed breakdown for 100 pods/node:**

| Data Type | Raw Data Rate | After Compression | Collection Overhead |
|-----------|--------------|-------------------|-------------------|
| Metrics (15s interval, ~50 metrics/container) | ~33 KB/s | ~8 KB/s | 80m CPU, 60MB RAM |
| Logs (avg 100 lines/s total across all containers) | ~200 KB/s | ~35 KB/s | 100m CPU, 120MB RAM |
| K8s Events (avg 5 events/min) | ~0.5 KB/s | ~0.2 KB/s | 10m CPU, 20MB RAM |
| Security (avg 50 events/s, userspace) | ~25 KB/s | ~6 KB/s | 60m CPU, 80MB RAM |
| Network (30s snapshots, ~200 connections) | ~2 KB/s | ~0.5 KB/s | 30m CPU, 40MB RAM |
| Cost data (60s interval) | ~1 KB/s | ~0.3 KB/s | 10m CPU, 20MB RAM |
| **Total** | **~262 KB/s** | **~50 KB/s** | **~290m CPU, ~340MB RAM** |

### 9.3 Network Bandwidth Budget

| Scenario | Compressed Data Rate | Monthly Egress per Node |
|----------|---------------------|------------------------|
| Minimal (metrics + events only) | ~10 KB/s | ~26 GB |
| Standard (metrics + logs + events) | ~50 KB/s | ~130 GB |
| Full (all modules, 100 pods) | ~80 KB/s | ~207 GB |
| Full (all modules, 500 pods) | ~250 KB/s | ~648 GB |

**Bandwidth optimization strategies:**
1. **Sampling:** For high-cardinality metrics, sample at 50% above 200 pods/node
2. **Log filtering:** Exclude noisy namespaces (kube-system) by default
3. **Delta encoding:** For network snapshots, only send changes
4. **Adaptive intervals:** Increase collection intervals when backend is under pressure (communicated via `AgentConfig` in heartbeat response)

### 9.4 Storage Buffer Requirements

| Buffer | Default Size | Purpose |
|--------|-------------|---------|
| Metrics ring buffer | 50MB | In-memory buffer for metric batches |
| Log ring buffer | 100MB | In-memory buffer for log entries |
| Log disk buffer | 500MB | Disk overflow when memory buffer is full |
| Event buffer | 5MB | In-memory buffer for K8s events |
| Security event buffer | 10MB | In-memory priority queue for security events |
| Network snapshot buffer | 20MB | In-memory buffer for network snapshots |
| eBPF ring buffer (per-CPU) | 8MB × N CPUs | Kernel-to-userspace event transfer |
| Log offset tracking | <1MB | Persistent file tracking read positions |
| FIM baselines | <5MB | File hashes for integrity monitoring |
| **Total on-disk (default)** | **~505MB** | `/var/lib/voyager-monitor/` |
| **Total in-memory (default)** | **~185MB + eBPF** | Managed within container memory limit |

---

## 10. Deployment & Upgrade Strategy

### 10.1 Rolling Update Strategy

DaemonSet updates use `RollingUpdate` strategy with `maxUnavailable: 1`:

```yaml
updateStrategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 1  # only one node loses monitoring at a time
    maxSurge: 0        # DaemonSets don't support surge
```

**Update sequence:**
1. New DaemonSet spec is applied (Helm upgrade or ArgoCD sync)
2. K8s controller selects one node at a time to update
3. Old pod is terminated (receives SIGTERM → graceful shutdown):
   - Flush all in-memory buffers to backend
   - Persist log offsets to disk
   - Close gRPC connections
   - Graceful shutdown timeout: 30 seconds
4. New pod starts on the same node
5. New pod reads persisted log offsets → resumes from where old pod left off
6. New pod registers with backend (includes new `agent_version`)
7. Controller moves to next node

**Zero-data-loss guarantee:** Between old pod termination and new pod startup (typically <30s), data is not collected. This is acceptable for metrics (next collection cycle recovers) and logs (persisted offsets ensure no duplicate/missed lines). Security events may have a brief blind spot during the transition.

### 10.2 Canary Deployment Approach

Canary deployments for DaemonSets are not natively supported by Kubernetes. We implement canary via **node labeling**:

**Step 1: Deploy canary DaemonSet targeting labeled nodes**

```yaml
# voyager-monitor-canary DaemonSet
spec:
  template:
    spec:
      nodeSelector:
        voyager.io/monitor-canary: "true"
      # New image version
      containers:
        - image: ghcr.io/voyager-platform/voyager-monitor:v2.1.0-rc1
```

```bash
# Label 1-2 nodes for canary
kubectl label node node-1 voyager.io/monitor-canary=true
kubectl label node node-2 voyager.io/monitor-canary=true
```

**Step 2: The stable DaemonSet excludes canary nodes**

```yaml
# voyager-monitor (stable) DaemonSet
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: voyager.io/monitor-canary
                    operator: NotIn
                    values: ["true"]
```

**Step 3: Monitor canary for 24-48 hours**

Compare canary vs stable:
- Error rates in agent self-monitoring metrics
- Data completeness (backend verifies expected data flow)
- Resource usage (CPU/memory)
- Module health statuses

**Step 4: Promote or rollback**

```bash
# Promote: update stable DaemonSet image, remove canary
helm upgrade voyager-monitor ./chart --set image.tag=v2.1.0
kubectl delete ds voyager-monitor-canary -n voyager-system
kubectl label node node-1 node-2 voyager.io/monitor-canary-

# Rollback: remove canary, stable keeps running
kubectl delete ds voyager-monitor-canary -n voyager-system
kubectl label node node-1 node-2 voyager.io/monitor-canary-
```

### 10.3 Backward Compatibility Requirements

| Requirement | Implementation |
|-------------|---------------|
| **Agent version skew** | Backend must support agents within N-2 versions. Use protobuf's forward/backward compatibility: new fields are optional, old fields are never removed. |
| **Config version negotiation** | Agent sends `config_version` in heartbeat. Backend responds with config only if version differs. Agent always applies latest config. |
| **Protobuf schema evolution** | Never remove or renumber existing fields. Use `reserved` for deprecated fields. New fields use the next available field number. |
| **Feature flag gating** | New modules are always behind feature flags (`feature_flags` in `AgentConfig`). Backend can remotely disable a module if it causes issues. |
| **Graceful degradation** | If agent sends fields the backend doesn't understand (newer agent), backend ignores unknown fields (protobuf default behavior). If backend sends fields the agent doesn't understand, agent ignores them. |

### 10.4 Version Negotiation Protocol

```
Agent                                    Backend
  │                                         │
  │──── Register(version=2.1.0,            │
  │     modules=[metrics,logs,security],   │
  │     capabilities={ebpf:true,           │
  │       kernel:5.15, cgroup:v2})         │
  │                                         │
  │                    AgentConfig ─────────│
  │    (intervals, rules, feature_flags,   │
  │     config_version=42)                 │
  │                                         │
  │  ... collect data ...                  │
  │                                         │
  │──── Heartbeat(version=2.1.0,           │
  │     config_version=42,                 │
  │     module_statuses={...},             │
  │     resource_usage={...})              │
  │                                         │
  │                    AgentConfig ─────────│
  │    (config_version=42 → no change)     │
  │    (config_version=43 → new rules!)    │
  │                                         │
```

**Heartbeat interval:** 60 seconds (configurable from backend)

**Config update triggers:**
- Security rules changed by user in Voyager Platform UI
- Collection intervals adjusted based on backend load
- Feature flags toggled (e.g., enable eBPF mode remotely)
- Module enable/disable from dashboard

---

## 11. Implementation Roadmap

### Phase 1: Core Collection (Weeks 1-4)

**Goal:** Metrics + Logs + Events + Cost Data flowing to backend

| Week | Deliverables |
|------|-------------|
| 1 | Module framework: `Module` interface, `ModuleManager`, config loading, health endpoints. Refactor existing audit/node-cleanup into Module pattern. |
| 2 | Metrics Collector (userspace): `/proc` node metrics, cgroup container metrics. K8s MetadataCache with informers. |
| 3 | Log Collector: file discovery, tailing, CRI parsing, offset tracking, severity detection. |
| 3-4 | gRPC transport layer: connection manager, mTLS, streaming. Protobuf schema v1. |
| 4 | K8s Event Watcher + Cost Data Collector. Integration testing with backend ingestion gateway. |

### Phase 2: Security + Network (Weeks 5-8)

**Goal:** Security scanning (userspace) + Network monitoring operational

| Week | Deliverables |
|------|-------------|
| 5 | Security Scanner (userspace): process tracking via `/proc`, file integrity monitoring via inotify. |
| 6 | Detection rule engine: built-in rules, rule evaluation, priority queue. Container escape detection. |
| 7 | Network Monitor: `/proc/net/tcp` parsing, conntrack integration, pod-to-pod mapping. |
| 8 | End-to-end testing: all modules running simultaneously. Resource profiling. Helm chart finalization. |

### Phase 3: eBPF Enhancement (Weeks 9-12)

**Goal:** eBPF-based collection for security and metrics on compatible kernels

| Week | Deliverables |
|------|-------------|
| 9 | eBPF infrastructure: `cilium/ebpf` integration, CO-RE program loading, ring buffer reader. |
| 10 | eBPF security: execve, openat, connect, setuid tracepoints. Replace userspace polling where eBPF is available. |
| 11 | eBPF metrics: sched_switch for CPU, block_rq for I/O latency histograms. |
| 12 | eBPF network: socket tracking, DNS query capture. Performance benchmarking. |

### Phase 4: Optimization & Hardening (Weeks 13-16)

**Goal:** Production-ready with performance guarantees

| Week | Deliverables |
|------|-------------|
| 13 | Adaptive sampling: dynamic rate adjustment based on pod density and backend pressure. |
| 14 | Prometheus remote-write export for metrics compatibility. |
| 15 | Comprehensive testing: chaos testing (node failures, backend unavailability), load testing (500 pods/node). |
| 16 | Documentation, runbooks, operational playbooks. Security audit of eBPF programs. |

---

## Appendix A: Go Package Structure

```
voyager-monitor/
├── cmd/
│   └── voyager-monitor/
│       └── main.go                  # Entry point, flag parsing, module init
├── pkg/
│   ├── agent/
│   │   ├── agent.go                 # Main agent lifecycle
│   │   ├── module.go                # Module interface
│   │   └── manager.go               # ModuleManager (start/stop/restart modules)
│   ├── config/
│   │   ├── config.go                # Configuration structs
│   │   └── watcher.go               # Dynamic config reload
│   ├── k8s/
│   │   ├── cache.go                 # MetadataCache
│   │   ├── informers.go             # Shared informer factory
│   │   └── enricher.go              # Enrich raw events with K8s context
│   ├── modules/
│   │   ├── audit/
│   │   │   └── audit.go             # Existing audit logger (refactored to Module)
│   │   ├── nodecleanup/
│   │   │   └── cleanup.go           # Existing node cleanup (refactored to Module)
│   │   ├── metrics/
│   │   │   ├── collector.go         # Metrics collection orchestration
│   │   │   ├── node.go              # Node metrics from /proc
│   │   │   ├── container.go         # Container metrics from cgroups
│   │   │   ├── kubelet.go           # Kubelet API fallback
│   │   │   └── ebpf.go              # eBPF-enhanced metrics (Phase 3)
│   │   ├── logs/
│   │   │   ├── collector.go         # Log collection orchestration
│   │   │   ├── tailer.go            # File tailing with offset tracking
│   │   │   ├── parser.go            # CRI log format parser
│   │   │   ├── severity.go          # Log severity detection
│   │   │   └── multiline.go         # Multiline log detection
│   │   ├── events/
│   │   │   └── watcher.go           # K8s event watcher
│   │   ├── security/
│   │   │   ├── scanner.go           # Security scanner orchestration
│   │   │   ├── process_tracker.go   # Process tracking (/proc or eBPF)
│   │   │   ├── fim.go               # File integrity monitoring
│   │   │   ├── rules.go             # Detection rule engine
│   │   │   ├── builtin_rules.go     # Built-in detection rules
│   │   │   ├── escape.go            # Container escape detection
│   │   │   └── ebpf/
│   │   │       ├── programs.go      # eBPF program management
│   │   │       ├── execve.go        # execve tracepoint handler
│   │   │       ├── openat.go        # openat tracepoint handler
│   │   │       ├── connect.go       # connect tracepoint handler
│   │   │       └── bpf/             # Compiled eBPF programs (bpf2go)
│   │   │           ├── execve_bpfel.go
│   │   │           ├── execve_bpfeb.go
│   │   │           └── execve.c
│   │   ├── network/
│   │   │   ├── monitor.go           # Network monitoring orchestration
│   │   │   ├── conntrack.go         # Conntrack integration
│   │   │   ├── proc_net.go          # /proc/net/tcp parser
│   │   │   └── ebpf.go              # eBPF socket tracking (Phase 3)
│   │   └── cost/
│   │       └── collector.go         # Cost data collection
│   ├── pipeline/
│   │   ├── pipeline.go              # Data pipeline orchestration
│   │   ├── buffer.go                # Ring buffer implementation
│   │   ├── disk_buffer.go           # Disk overflow buffer
│   │   └── exporter.go              # gRPC/HTTP export
│   ├── transport/
│   │   ├── grpc_client.go           # gRPC connection management
│   │   ├── http_client.go           # HTTP fallback transport
│   │   ├── prom_remote_write.go     # Prometheus remote-write exporter
│   │   └── compression.go           # Snappy/zstd compression
│   └── proto/
│       └── v1/
│           ├── voyager_monitor.proto # Protobuf definitions
│           ├── voyager_monitor.pb.go # Generated Go code
│           └── voyager_monitor_grpc.pb.go
├── deploy/
│   └── helm/
│       └── voyager-monitor/
│           ├── Chart.yaml
│           ├── values.yaml
│           └── templates/
│               ├── daemonset.yaml
│               ├── clusterrole.yaml
│               ├── clusterrolebinding.yaml
│               ├── serviceaccount.yaml
│               ├── configmap.yaml
│               ├── secret.yaml
│               └── _helpers.tpl
├── Dockerfile
├── Makefile
├── go.mod
└── go.sum
```

## Appendix B: Key Go Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `k8s.io/client-go` | v0.29+ | Kubernetes API client, informers |
| `google.golang.org/grpc` | v1.62+ | gRPC client for data transport |
| `google.golang.org/protobuf` | v1.33+ | Protobuf serialization |
| `github.com/cilium/ebpf` | v0.14+ | eBPF program loading and management |
| `github.com/fsnotify/fsnotify` | v1.7+ | File system notifications (FIM, log discovery) |
| `github.com/golang/snappy` | v0.0.4+ | Snappy compression |
| `github.com/klauspost/compress/zstd` | v1.17+ | Zstd compression for logs |
| `github.com/prometheus/client_golang` | v1.19+ | Self-monitoring metrics |
| `github.com/prometheus/common/model` | v0.52+ | Prometheus remote-write compatibility |
| `github.com/vishvananda/netlink` | v1.3+ | Conntrack access via netlink |
| `log/slog` | stdlib | Structured logging |

## Appendix C: Self-Monitoring Metrics

Voyager Monitor exposes the following Prometheus metrics for self-monitoring:

```
# Module status
voyager_monitor_module_status{module="metrics"} 1  # 1=running, 0=stopped, -1=error
voyager_monitor_module_uptime_seconds{module="metrics"} 3600

# Data collection
voyager_monitor_items_collected_total{module="metrics", type="node"} 12345
voyager_monitor_items_collected_total{module="metrics", type="container"} 67890
voyager_monitor_items_collected_total{module="logs"} 1234567
voyager_monitor_items_dropped_total{module="logs", reason="rate_limit"} 42
voyager_monitor_items_dropped_total{module="logs", reason="buffer_overflow"} 0

# Transport
voyager_monitor_export_batches_total{transport="grpc", status="success"} 5000
voyager_monitor_export_batches_total{transport="grpc", status="error"} 3
voyager_monitor_export_latency_seconds{transport="grpc", quantile="0.5"} 0.023
voyager_monitor_export_latency_seconds{transport="grpc", quantile="0.99"} 0.150
voyager_monitor_bytes_sent_total{transport="grpc"} 1073741824

# Buffer utilization
voyager_monitor_buffer_usage_ratio{module="metrics"} 0.23
voyager_monitor_buffer_usage_ratio{module="logs"} 0.67
voyager_monitor_disk_buffer_bytes{module="logs"} 52428800

# Resource usage
voyager_monitor_cpu_seconds_total 1234.56
voyager_monitor_memory_bytes 314572800
voyager_monitor_goroutines 89
voyager_monitor_open_fds 45

# eBPF (when enabled)
voyager_monitor_ebpf_events_total{program="execve"} 50000
voyager_monitor_ebpf_events_dropped_total{program="execve"} 0
voyager_monitor_ebpf_ringbuf_usage_ratio{program="execve"} 0.12

# Security
voyager_monitor_security_events_total{severity="CRITICAL"} 2
voyager_monitor_security_events_total{severity="HIGH"} 15
voyager_monitor_security_rules_loaded 50
voyager_monitor_fim_files_monitored 25
voyager_monitor_fim_violations_total 3
```

## Appendix D: Environment Variable Reference

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_NAME` | Downward API `spec.nodeName` | Name of the node this agent runs on |
| `POD_NAME` | Downward API `metadata.name` | Agent pod name |
| `POD_NAMESPACE` | Downward API `metadata.namespace` | Agent pod namespace |
| `VOYAGER_CLUSTER_ID` | Helm value | Cluster identifier |
| `VOYAGER_API_KEY` | K8s Secret | Authentication key for backend |
| `VOYAGER_BACKEND_GRPC` | Helm value | gRPC endpoint (override) |
| `VOYAGER_BACKEND_HTTP` | Helm value | HTTP endpoint (override) |
| `VOYAGER_LOG_LEVEL` | Helm value | Agent log level: debug, info, warn, error |
| `VOYAGER_PROC_PATH` | Default `/host/proc` | Mounted host /proc path |
| `VOYAGER_SYS_PATH` | Default `/host/sys` | Mounted host /sys path |
| `VOYAGER_LOG_PATH` | Default `/host/var/log/pods` | Mounted container log path |
| `VOYAGER_STATE_DIR` | Default `/var/lib/voyager-monitor` | Persistent state directory |
| `GOMAXPROCS` | Auto (via `automaxprocs`) | Set via `uber-go/automaxprocs` to respect cgroup CPU limits |

---

*This specification is implementation-ready. A Go developer should be able to implement each module by following the collection methods, data formats, and interfaces defined above. For questions or clarifications, reference the corresponding section number.*

*Last updated: February 4, 2026*
