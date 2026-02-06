# Technical Pitfalls Research: Lessons from Competitors & Community

**Purpose:** Learn from others' mistakes in Kubernetes monitoring, FinOps, and security tooling so Voyager Platform avoids repeating them.

**Research Date:** 2026-02-04
**Sources:** Reddit (r/kubernetes, r/devops, r/aws, r/azure), GitHub Issues, HackerNews, StackOverflow, vendor docs, security research papers

---

## Table of Contents

1. [Known Bugs & Technical Issues with Competitors](#1-known-bugs--technical-issues-with-competitors)
2. [Common K8s Platform Pitfalls](#2-common-k8s-platform-pitfalls)
3. [Infrastructure Gotchas](#3-infrastructure-gotchas)
4. [Security Tool Failures](#4-security-tool-failures)

---

## 1. Known Bugs & Technical Issues with Competitors

### 1.1 Datadog Agent: Memory Leaks, OOM Kills, Resource Consumption

#### Issue: Slow Memory Leak in Datadog Agent (Multiple Versions)
- **Specific Issue:** Datadog agent v7.21.1 exhibits a slow memory leak where agents gradually consume all allocated memory until OOM-killed by Kubernetes. Users report `Last State: Terminated, Reason: OOMKilled` repeatedly across DaemonSet pods.
- **Source:** https://github.com/DataDog/datadog-agent/issues/6270
- **Impact:** HIGH — Agent pods restart repeatedly, causing gaps in monitoring data. In production, this means blind spots during the exact moments you most need observability.
- **Root Cause:** Memory is not returned to the OS after bursty events. The Go runtime allocates heap during metric bursts but the agent doesn't properly release cached data.
- **Voyager Design Decision:** Our agent MUST have configurable memory limits with graceful degradation (drop low-priority metrics before OOMing). Implement a memory pressure watchdog that starts shedding load at 80% of limit. Never let the monitoring agent take down the workloads it monitors.

#### Issue: Cluster Agent Memory Leak (v7.46.0)
- **Specific Issue:** Datadog Cluster Agent v7.46.0 running on EKS exhibits a slow memory leak. Agent ran continuously since Oct 2023 with steadily increasing memory consumption.
- **Source:** https://github.com/DataDog/datadog-agent/issues/21726
- **Impact:** HIGH — Cluster-level metadata collection degrades, causing incomplete tagging and metric attribution across the entire cluster.
- **Root Cause:** Long-running leader election combined with accumulating cached Kubernetes metadata that's never garbage collected.
- **Voyager Design Decision:** Implement periodic cache eviction in any cluster-level component. Use bounded LRU caches with explicit TTLs. Add memory usage metrics on our own agent with automated self-restart when leak patterns are detected.

#### Issue: Datadog kubernetes_apiserver Check Causes API Server Memory Leak
- **Specific Issue:** The Datadog agent's kubernetes_apiserver check triggers a memory leak *on the Kubernetes API server itself* by closing connections to `/api/v1/events` while the API server is still sending cached watch state. This causes the API server to leak goroutines and memory until OOM.
- **Source:** https://github.com/DataDog/datadog-agent/issues/2534
- **Impact:** CRITICAL — Not just the agent leaking, but causing the *cluster control plane* to crash. This can take down the entire cluster.
- **Root Cause:** Client-side timeout closing the connection during initial watch state catch-up, combined with an etcd2 behavior that doesn't clean up orphaned watches.
- **Voyager Design Decision:** NEVER use unbounded API server watches from DaemonSet pods. Use a single centralized watcher (operator pattern) that fans out to agents. Implement proper watch bookmark resumption and connection timeouts that account for initial state sync. Test against large clusters (350+ nodes) specifically for API server impact.

#### Issue: Datadog Agent High CPU — Using More Resources Than Monitored Workloads
- **Specific Issue:** Kubernetes Datadog agent pod running dogstatsd uses more CPU (380m+ spikes) than the actual processes/pods it monitors.
- **Source:** https://github.com/DataDog/datadog-agent/issues/3793
- **Impact:** MEDIUM-HIGH — The monitoring tool itself becomes a significant cost and resource consumer, undermining its own ROI story.
- **Root Cause:** High metric collection frequency combined with resource-intensive checks and insufficient resource limits.
- **Voyager Design Decision:** Our agent should NEVER use more resources than the workload it monitors. Implement adaptive collection frequency that backs off under resource pressure. Default resource limits should be conservative (50m CPU, 128Mi mem) with documented guidelines for scaling.

#### Issue: Pod Metrics Disappear as Service Count Increases
- **Specific Issue:** Datadog stops reporting metrics for pods when the number of services in the cluster increases. Metrics appear briefly then vanish completely. Restarting agent/cluster-agent doesn't help.
- **Source:** https://github.com/DataDog/datadog-agent/issues/26479
- **Impact:** HIGH — Silent data loss that's hard to detect — you don't know what you're not seeing.
- **Voyager Design Decision:** Implement a "coverage monitor" that tracks what percentage of known workloads are reporting metrics. Alert when coverage drops below threshold. Never silently drop metrics.

---

### 1.2 Prometheus: Cardinality Explosions & Scaling Walls

#### Issue: Cardinality Explosion Consuming 60GB RAM
- **Specific Issue:** Prometheus instance consumed 50-60GB RAM due to cardinality explosion from three causes: (1) duplicate scraping from both pods and ServiceMonitors, (2) histogram metrics (`*_duration_seconds_bucket`) generating hundreds of thousands of series, (3) high-cardinality labels like `replicaset`, `path`, and `container_id` with 10k+ unique values each.
- **Source:** https://www.reddit.com/r/PrometheusMonitoring/comments/1k0hduo/i_brought_prometheus_memory_usage_down_from_60gb/
- **Impact:** HIGH — Scrape reliability degraded, UI sluggish, PromQL queries timing out. Fixed by dropping to ~20GB after aggressive metric pruning.
- **Root Cause:** Labels with unbounded cardinality (especially `path` from HTTP routes and `container_id` from Kubernetes) combined with duplicate scrape configs.
- **Voyager Design Decision:** Build cardinality analysis INTO the platform. Automatically detect and warn about high-cardinality labels before they explode. Implement per-tenant cardinality limits. Pre-aggregate histograms where possible. Never expose raw `container_id` or `pod` hashes as labels in stored metrics.

#### Issue: "query processing would load too many samples into memory"
- **Specific Issue:** Prometheus rejects queries that would load too many samples, giving users cryptic errors. This happens when queries touch metrics with high cardinality across large time ranges.
- **Source:** https://last9.io/blog/troubleshooting-common-prometheus-pitfalls-cardinality-resource-utilization-and-storage-challenges/
- **Impact:** MEDIUM-HIGH — Dashboard queries fail for the most important aggregate views (e.g., "show me all pods across all namespaces").
- **Root Cause:** Prometheus's in-memory query engine has a hard sample limit to prevent OOM. High cardinality metrics easily exceed this.
- **Voyager Design Decision:** Use a query engine that can stream results rather than loading all into memory. Implement query cost estimation BEFORE execution and warn users. Support recording rules as first-class citizens for expensive queries.

#### Issue: Prometheus Single-Node Architecture Can't Scale Horizontally
- **Specific Issue:** Prometheus is fundamentally a single-node database. Scaling requires sharding (complex operational burden) or bolt-on solutions like Thanos/Cortex/VictoriaMetrics, each with their own operational complexity.
- **Source:** https://news.ycombinator.com/item?id=21995942 and https://monitoring2.substack.com/p/big-prometheus
- **Impact:** HIGH — Organizations with 100+ clusters running Prometheus per cluster face a "query federation nightmare" trying to get global views. Cloudflare ran 188 clusters in 2017.
- **Root Cause:** Architectural decision — Prometheus chose simplicity and reliability of single-node over distributed complexity.
- **Voyager Design Decision:** Design multi-cluster metrics as a first-class feature from day one. Use a distributed TSDB backend (VictoriaMetrics or similar) that supports horizontal scaling natively. Never require users to run Thanos sidecars or federation configs.

---

### 1.3 Grafana: Dashboard Performance at Scale

#### Issue: UI Extremely Slow with Large Log Volumes
- **Specific Issue:** Grafana Explore UI becomes very slow when Loki queries return more than 30,000-40,000 log lines. The browser-side rendering becomes the bottleneck, not the backend.
- **Source:** https://community.grafana.com/t/grafana-explore-ui-very-slow-for-loki-on-queries-that-fetch-more-than-40000-log-lines/111599
- **Impact:** MEDIUM — Users can't investigate incidents that generate lots of logs. They must artificially narrow time ranges or filter more aggressively.
- **Root Cause:** Client-side DOM rendering can't handle rendering 40k+ log entries efficiently. JSON parsing of large result sets also contributes.
- **Voyager Design Decision:** Implement server-side pagination with virtual scrolling in log viewers. Never send more than ~1000 rendered items to the browser at once. Use server-side aggregation for large result sets.

#### Issue: Dashboard Load Hangs After Grafana 11 Upgrade
- **Specific Issue:** After upgrading to Grafana 11.0.0, dashboards with variable filters (e.g., `node_boot_time_seconds`) that previously loaded in 0.5s got stuck on 2 internal queries, hanging the entire dashboard load.
- **Source:** https://github.com/grafana/grafana/issues/88136
- **Impact:** MEDIUM — Dashboard rendering regressions during upgrades block visibility during incidents. ~800 server environment.
- **Root Cause:** Variable resolution query changes in Grafana 11 caused unexpected query patterns.
- **Voyager Design Decision:** Dashboard variable resolution must be decoupled from panel rendering — a slow variable query should not block all panels. Implement variable caching. Run upgrade regression tests against large-scale dashboards.

#### Issue: Template Variables with "All" Option Cause Query Timeouts
- **Specific Issue:** When a Grafana template variable has thousands of possible values and the "All" option is selected, it generates a massive query that tries to plot every series, leading to timeout.
- **Source:** https://medium.com/@saurabh2k1/10-ways-to-speed-up-grafana-a-developers-guide-to-performance-tuning-1a1b6efd1522
- **Impact:** MEDIUM — Common UX anti-pattern that every Grafana deployment hits eventually.
- **Voyager Design Decision:** Limit "All" selections to a configurable maximum. When a user selects "All" on a high-cardinality variable, show a warning and offer to use pre-aggregated data instead. Default to "top N" views rather than "all."

---

### 1.4 Kubecost: Cost Accuracy Issues

#### Issue: Node Hourly Cost Underestimated Compared to Azure Pricing
- **Specific Issue:** Kubecost's `node_total_hourly_cost` metric reports values significantly below Azure's effective unit price for all instance types except spot instances (which happened to be correct). Standard and reserved instances showed incorrect pricing.
- **Source:** https://github.com/kubecost/cost-analyzer-helm-chart/issues/1754
- **Impact:** HIGH — Teams make infrastructure decisions based on wrong cost data. Underestimation is worse than overestimation because it creates false confidence.
- **Root Cause:** Kubecost uses public pricing APIs by default and doesn't account for EDPs (Enterprise Discount Programs), reserved instances, or custom pricing agreements unless explicitly configured with cloud billing integration.
- **Voyager Design Decision:** ALWAYS reconcile costs against actual cloud billing data (CUR for AWS, Cost Export for Azure). Show a prominent "estimated" vs "reconciled" indicator. Never show costs without a confidence level.

#### Issue: AWS Spot Instance Pricing Integration Broken
- **Specific Issue:** Kubecost fails to detect spot instances even with spot data feed properly configured. "No spot instances detected" despite running spot nodes. Athena query integration also breaks with `SYNTAX_ERROR` when AWS changes schema.
- **Source:** https://github.com/kubecost/cost-analyzer-helm-chart/issues/1210 and https://github.com/kubecost/cost-analyzer-helm-chart/issues/2290
- **Impact:** HIGH — For organizations using 99% spot instances, "all the costs are wrong" (direct quote from issue).
- **Root Cause:** Fragile integration with AWS Spot Data Feed and Athena. Schema changes in AWS billing exports break parsing.
- **Voyager Design Decision:** Implement resilient cloud billing parsers with schema version detection and graceful degradation. Test against multiple AWS CUR versions. When spot pricing can't be determined, show "unknown" rather than wrong on-demand pricing.

#### Issue: Network Costs Unusable for Multi-AZ Clusters
- **Specific Issue:** Kubecost's network cost monitoring can't be configured based on source/target IP, making it useless for multi-AZ clusters where cross-AZ traffic is a major hidden cost.
- **Source:** https://www.reddit.com/r/kubernetes/comments/1nl14bp/do_you_use_kubecost_or_opencost/
- **Impact:** MEDIUM — Cross-AZ data transfer is one of the biggest hidden K8s costs (often 20-30% of total), and Kubecost can't help identify it.
- **Voyager Design Decision:** Implement AZ-aware network cost tracking from day one. Tag all network flows with source/destination AZ. Show cross-AZ traffic as a first-class cost dimension.

#### Issue: Shared Idle Cost Allocation Creates Phantom Costs
- **Specific Issue:** When sharing idle costs by cluster/node AND setting custom shared resources (namespaces), total aggregated costs change incorrectly — costs either double-counted or phantom costs appear.
- **Source:** https://github.com/kubecost/cost-analyzer-helm-chart/issues/2359
- **Impact:** MEDIUM — Finance teams lose trust in cost data when totals don't add up correctly.
- **Root Cause:** Complex interaction between multiple cost distribution methods (idle sharing, custom shared resources) creating double-counting.
- **Voyager Design Decision:** Implement a strict cost conservation invariant: sum of all allocated costs MUST equal actual cloud bill within tolerance. Show any discrepancy prominently. Use a waterfall model for cost allocation with clear audit trail.

#### Issue: "Never Seems Close to Accurate, Needs a Ton of Effort"
- **Specific Issue:** Multiple users report Kubecost requiring extensive configuration effort just to get basic accuracy, with costs still not matching cloud bills.
- **Source:** https://www.reddit.com/r/devops/comments/10999w4/monitoring_infra_cost_which_tool_do_you_use/
- **Impact:** HIGH — Users abandon the tool entirely, losing all cost visibility.
- **Voyager Design Decision:** Cost accuracy must work well out-of-the-box with zero configuration. Use cloud billing APIs immediately on install. Show a "setup completeness" score that tells users what they're missing and how it affects accuracy.

---

### 1.5 Falco: False Positives, Performance Impact, Kernel Compatibility

#### Issue: Falco Kubernetes Support Causes 18x CPU Increase
- **Specific Issue:** With Kubernetes metadata enrichment enabled, Falco CPU usage jumped from 9 cores to 161 cores across a 350-node cluster. It also caused significant load on the API server via excessive `/api/v1/watch` requests. 3,100 restarts observed.
- **Source:** https://github.com/falcosecurity/falco/issues/2346
- **Impact:** CRITICAL — The security tool itself becomes a denial-of-service against the cluster. CPU usage exceeded resource limits causing constant restarts, meaning security monitoring was effectively offline.
- **Root Cause:** Each Falco DaemonSet pod independently watches the Kubernetes API for metadata enrichment, creating N×(watch connections) where N = number of nodes. No caching or centralized metadata service.
- **Voyager Design Decision:** NEVER have DaemonSet pods independently watch the K8s API. Use a centralized metadata service (operator pattern) that caches K8s metadata and distributes to agents via efficient protocol. Measure and limit API server impact during load testing.

#### Issue: High CPU (90-100%) with Event Drops During Intensive Workloads
- **Specific Issue:** Falco 0.30.0 with eBPF driver consumes 90-100% of a single core during video processing workloads, with event drop rates exceeding 100% (more events dropped than processed). Statistics showed 54M events processed vs 64M dropped.
- **Source:** https://github.com/falcosecurity/falco/issues/1809
- **Impact:** CRITICAL — Security monitoring blind spot during exactly the high-activity periods when attacks are most likely to occur. More events are being DROPPED than processed.
- **Root Cause:** Syscall-level monitoring generates enormous event volumes during I/O-intensive workloads. The eBPF ring buffer overflows and events are silently lost.
- **Voyager Design Decision:** Implement adaptive sampling for security events. During high syscall volume, intelligently sample rather than drop random events. Always maintain coverage for critical security events (exec, network connections) even when general syscall monitoring is overwhelmed. Report drop rates prominently.

#### Issue: False Positives on GKE and AKS with Default Rules
- **Specific Issue:** Falco's default rules generate false positives on managed Kubernetes (GKE, AKS) because they trigger on legitimate cloud-provider system operations (node management, metadata queries, system pod activity).
- **Source:** https://github.com/falcosecurity/falco/issues/439 and https://github.com/falcosecurity/falco/issues/1177
- **Impact:** MEDIUM-HIGH — Alert fatigue causes operators to ignore or disable rules, reducing actual security coverage. Output fields filled with "N/A" values make triage difficult.
- **Root Cause:** Default rules are written for generic Kubernetes but don't account for managed K8s specifics. Each cloud provider's system operations look different.
- **Voyager Design Decision:** Ship cloud-provider-specific rule profiles (EKS, AKS, GKE) out of the box. Include a "learning mode" that observes normal behavior before generating alerts. Auto-detect the managed K8s environment and apply appropriate exclusions.

#### Issue: Kernel Module Compatibility Across Distributions
- **Specific Issue:** Falco's kernel module fails to compile on various distributions (Oracle Linux, custom kernels, AKS Ubuntu). The modern eBPF probe requires kernel 5.8+ with BTF support, limiting compatibility.
- **Source:** https://github.com/falcosecurity/falco/issues/1453, https://github.com/falcosecurity/falco/issues/2467, https://github.com/falcosecurity/falco/issues/3390
- **Impact:** HIGH — Security monitoring simply doesn't deploy on some nodes, leaving them unprotected with no alternative.
- **Voyager Design Decision:** For kernel-level monitoring, use modern eBPF (no kernel module compilation needed) as the only supported path, and clearly document minimum kernel requirements. For older kernels, fall back to userspace monitoring with documented coverage limitations. Never fail silently — always report what level of monitoring is active.

---

### 1.6 Helm Chart DaemonSet Upgrade Failures

#### Issue: "UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress"
- **Specific Issue:** Helm upgrades get stuck in a failed state, particularly on EKS and AKS, when a previous upgrade was interrupted (CI pipeline timeout, network issue). The release enters a "pending-upgrade" state that blocks all future operations.
- **Source:** https://stackoverflow.com/questions/71599858/upgrade-failed-another-operation-install-upgrade-rollback-is-in-progress and https://github.com/aws/aws-cdk/issues/27641
- **Impact:** HIGH — Blocks all deployments and updates. Requires manual intervention (deleting Helm secrets) which is risky and error-prone.
- **Root Cause:** Helm stores release state in Kubernetes secrets. If an upgrade is interrupted, the state remains "pending" and Helm refuses to proceed.
- **Voyager Design Decision:** Use `--atomic` flag by default for all Helm installations/upgrades (auto-rollback on failure). Implement self-healing release state detection. Provide a single-command recovery tool for stuck releases. Consider if Helm is even the right deployment mechanism for DaemonSets (CRD-based operators may be more reliable).

#### Issue: DaemonSet Not Updating After Helm Upgrade
- **Specific Issue:** After Helm 3 upgrade, the DaemonSet resource is not updated even though Helm reports success. Old pods continue running with stale configuration.
- **Source:** https://github.com/helm/charts/issues/23537
- **Impact:** HIGH — Silent failure — operators think the upgrade succeeded but old code is still running. Could mean security patches are not applied.
- **Root Cause:** Helm's "unchanged" detection for DaemonSets can incorrectly determine no changes are needed, especially with immutable fields.
- **Voyager Design Decision:** Always include a configuration hash annotation on DaemonSet pod template to force rolling updates. Implement post-upgrade verification that checks running image versions match expected versions. Never trust Helm's success status alone.

---

## 2. Common K8s Platform Pitfalls

### 2.1 WebSocket Scaling Issues in K8s Dashboards

#### Issue: Can't Horizontally Scale WebSocket Applications
- **Specific Issue:** WebSocket connections are stateful and bound to specific pods. Standard Kubernetes HPA creates new replicas but existing connections stay on old pods, creating severe load imbalance (110 clients on old pods vs 10 on new ones after scale-up).
- **Source:** https://medium.com/lumen-engineering-blog/how-to-implement-a-distributed-and-auto-scalable-websocket-server-architecture-on-kubernetes-4cc32e1dfa45 and https://www.reddit.com/r/kubernetes/comments/1eynocn/websocket_load_balancing/
- **Impact:** HIGH — Dashboards using WebSockets (for real-time updates) can't scale properly. Load balancer distributes new connections but can't rebalance existing ones.
- **Root Cause:** WebSocket is inherently stateful. Kubernetes load balancing operates at connection establishment time, not per-message. Connection affinity prevents even distribution.
- **Voyager Design Decision:** Use Server-Sent Events (SSE) over WebSockets where possible (simpler, reconnects automatically). If WebSockets are needed, implement connection redistribution on scale-up events. Use a message bus (Redis pub/sub, NATS) to decouple message routing from WebSocket connections. Set maximum connection lifetime with graceful reconnection.

#### Issue: Load Balancer Timeouts Kill WebSocket Connections
- **Specific Issue:** AWS Classic Load Balancer terminates WebSocket connections after idle timeout. ALB/NLB handle WebSockets but require explicit timeout configuration. Default K8s ingress timeouts (60s) are too short.
- **Source:** https://stackoverflow.com/questions/78638161/how-to-scale-kubernetes-for-websockets
- **Impact:** MEDIUM — Users experience random disconnections. Debugging is difficult because it appears to be a client issue.
- **Voyager Design Decision:** Document and auto-configure appropriate WebSocket timeouts in Helm charts. Implement heartbeat/ping mechanism to keep connections alive. Use NLB or NGINX ingress with proper WebSocket timeout configuration.

---

### 2.2 Time-Series Database Performance at Scale

#### Issue: Prometheus Local Storage Limitations
- **Specific Issue:** Prometheus uses in-memory indices for all time series, which limits scalability to available RAM. At high cardinality (>5M series), Prometheus becomes unstable and queries slow dramatically.
- **Source:** https://uptrace.dev/comparisons/high-cardinality-time-series-databases
- **Impact:** HIGH — The de facto standard for K8s monitoring hits a wall at medium-large scale, forcing complex bolt-on solutions.
- **Root Cause:** Prometheus's TSDB is optimized for single-node reliability over distributed scale. The inverted index must fit in memory.
- **Voyager Design Decision:** Use VictoriaMetrics or a columnar TSDB backend that can handle high cardinality without linear RAM growth. Support Prometheus as a scrape-only agent that remote-writes to our backend. Never expose users to TSDB scaling decisions.

#### Issue: Thanos Operational Complexity
- **Specific Issue:** Running Thanos requires deploying and managing 6+ microservices (sidecar, store, query, compactor, ruler, receive), each with their own scaling and failure modes. "The operational complexity is incredibly high."
- **Source:** https://news.ycombinator.com/item?id=21995942
- **Impact:** MEDIUM-HIGH — Teams adopt Thanos for long-term storage but spend significant engineering time operating it rather than deriving value from metrics.
- **Voyager Design Decision:** Embed long-term storage and multi-cluster querying in the platform. Users should install ONE thing, not assemble a metrics Rube Goldberg machine.

---

### 2.3 Log Aggregation Bottlenecks & Storage Costs

#### Issue: Elasticsearch Stops Ingesting Under Load
- **Specific Issue:** ELK stack stops ingesting logs after 10-15 minutes at 25-30 MB/second ingestion rate. Elasticsearch's full-text indexing becomes the bottleneck.
- **Source:** https://www.reddit.com/r/devops/comments/mv4ztu/wtf_is_loki_and_should_i_replace_elk_with_it_if/
- **Impact:** HIGH — Log loss during exactly the high-traffic periods when you need logs most (incidents, traffic spikes).
- **Root Cause:** Full-text indexing of every log line requires massive JVM heap and I/O. Elasticsearch was designed for search, not log ingestion.
- **Voyager Design Decision:** Use label-based indexing (like Loki) rather than full-text indexing for log storage. Full-text search is rarely needed — most log queries are `{namespace="X"} |= "error"`. Store compressed chunks in object storage (S3/GCS) for massive cost reduction vs Elasticsearch.

#### Issue: Elasticsearch Storage Costs 10-20x Higher Than Alternatives
- **Specific Issue:** "If your system generates 1 TB of logs per day, Loki may store only 50-100 GB of data after compression. Using Amazon S3 Standard pricing, storing 100 GB costs only a few dollars per month. Elasticsearch stores multiple copies of data, dramatically increasing storage costs."
- **Source:** https://middleware.io/blog/grafana-loki/
- **Impact:** HIGH — Log storage is often the biggest hidden cost of observability. Organizations discover they're spending $10k+/month on log storage alone.
- **Voyager Design Decision:** Default to object storage (S3/GCS/Azure Blob) for log retention. Use in-cluster storage only for hot/recent data (last 2-24 hours). Implement automatic tiering. Show log storage cost projections during setup.

---

### 2.4 Multi-Cluster Authentication & Connectivity

#### Issue: No Built-in Multi-Cluster Service Discovery
- **Specific Issue:** Kubernetes lacks built-in tooling to identify and connect services across clusters. Teams must cobble together solutions using service meshes, DNS federation, or custom controllers.
- **Source:** https://www.groundcover.com/blog/kubernetes-multi-cluster
- **Impact:** HIGH — Cross-cluster communication is brittle and inconsistent. Each team invents their own approach.
- **Voyager Design Decision:** Build multi-cluster awareness into the platform from day one. Agents should auto-register with a central control plane. Use a hub-spoke model where agents connect outbound (no inbound firewall rules needed).

#### Issue: CIDR Overlap Between Clusters
- **Specific Issue:** When connecting multiple K8s clusters, networking overlaps cause routing failures. Teams discover this only when trying to enable cross-cluster communication.
- **Source:** https://www.plural.sh/blog/connect-two-kubernetes-clusters/
- **Impact:** MEDIUM — Requires network redesign which can be extremely expensive and disruptive.
- **Voyager Design Decision:** Voyager's multi-cluster communication should use application-layer (L7) connectivity rather than network-layer (L3), avoiding any dependency on non-overlapping CIDRs. Use agent-initiated outbound connections.

---

### 2.5 RBAC Implementation Mistakes

#### Issue: Cluster-Admin Granted Too Broadly
- **Specific Issue:** Organizations routinely grant `cluster-admin` to users, service accounts, and CI/CD tools. During ABAC-to-RBAC migration, teams replicate ABAC's permissive configuration with cluster-admin.
- **Source:** https://www.redhat.com/en/blog/5-kubernetes-rbac-mistakes-you-must-avoid
- **Impact:** CRITICAL — Account compromise or CI/CD pipeline breach gives full cluster control.
- **Voyager Design Decision:** Voyager's service account should request ONLY the minimum permissions needed. Document exact RBAC requirements. Provide read-only and full modes. Never require cluster-admin.

#### Issue: RBAC Doesn't Provide Namespace Isolation Alone
- **Specific Issue:** Teams assume RBAC provides strong namespace isolation, but users with pod creation rights can create privileged pods to escape to the host and access other namespaces' resources (read service account tokens, access other pods).
- **Source:** https://certitude.consulting/blog/en/kubernetes-rbac-security-pitfalls/
- **Impact:** CRITICAL — False sense of security. Multi-tenancy based solely on RBAC + namespaces is breakable.
- **Root Cause:** RBAC controls API access, not what happens on the node. Privileged containers bypass namespace isolation.
- **Voyager Design Decision:** Our security features should detect and warn about this exact gap. Report when Pod Security Standards are not enforced alongside RBAC. Never suggest RBAC alone is sufficient for multi-tenant isolation.

#### Issue: Privilege Escalation via Create-Pod Permission
- **Specific Issue:** Any user with pod creation rights can impersonate ANY service account in the same namespace by specifying it in the pod spec. This is a well-known but under-appreciated escalation path.
- **Source:** https://certitude.consulting/blog/en/kubernetes-rbac-security-pitfalls/
- **Impact:** HIGH — Pod creation is the most commonly granted permission and also the most dangerous.
- **Voyager Design Decision:** Flag create-pod permissions as a high-risk finding in security scanning. Recommend PodSecurity admission to restrict which service accounts can be mounted.

---

### 2.6 Cost Calculation Inaccuracies

#### Issue: Request-Based vs Usage-Based Cost Shows Wildly Different Numbers
- **Specific Issue:** Most K8s cost tools calculate based on resource requests, but actual usage is often 10-50% of requests. Teams see "you're spending $100k/month on namespace X" when actual utilization cost is $15k.
- **Source:** https://cast.ai/blog/kubernetes-cost-estimation-4-problems-and-how-to-solve-them/
- **Impact:** HIGH — Leadership makes wrong capacity decisions. Teams are blamed for costs they're not actually using.
- **Root Cause:** K8s scheduler allocates based on requests, but resource consumption follows usage. The gap is "idle cost" — real money spent on unused capacity.
- **Voyager Design Decision:** Show BOTH request-based and usage-based cost views with clear labels. Show the gap as "optimization opportunity." Recommend right-sizing based on usage patterns.

#### Issue: Shared Resource Costs Are Hard to Attribute
- **Specific Issue:** Persistent volumes, load balancers, cluster-wide services, and cross-AZ network traffic are difficult to fairly attribute to specific teams/namespaces. Flat-rate splitting rarely reflects actual usage.
- **Source:** https://amnic.com/blogs/challenges-of-kubernetes-cost-management
- **Impact:** MEDIUM — Teams dispute cost allocations, leading to political conflicts and loss of trust in FinOps data.
- **Voyager Design Decision:** Implement proportional allocation for shared resources based on usage metrics (bytes read/written for PVs, requests processed for LBs). Provide transparent allocation rules that teams can inspect and agree on.

---

## 3. Infrastructure Gotchas

### 3.1 EKS-Specific Issues

#### Issue: API Server Rate Limiting (429 Too Many Requests)
- **Specific Issue:** EKS API server returns HTTP 429 when concurrent request limits are exceeded. Monitoring tools that heavily poll the API (Falco, Datadog, custom controllers) can consume the rate limit, causing legitimate operations (deploys, scaling) to fail.
- **Source:** https://aws.github.io/aws-eks-best-practices/scalability/docs/control-plane/ and https://kubernetes.io/docs/concepts/cluster-administration/flow-control/
- **Impact:** HIGH — Monitoring tools can cause deployment failures. "The monitoring system broke prod" is a terrible outcome.
- **Root Cause:** API Priority and Fairness (APF) limits concurrent requests per priority level. Monitoring tools often don't properly implement backoff.
- **Voyager Design Decision:** Implement exponential backoff with jitter for ALL K8s API calls. Respect `Retry-After` headers. Use watches with bookmarks instead of periodic list calls. Configure API Priority (FlowSchema) to put Voyager in a lower-priority bucket than workload controllers.

#### Issue: Service Account Token Expiry (90 Days)
- **Specific Issue:** EKS rejects requests with service account tokens older than 90 days. Applications that don't periodically refetch tokens get HTTP 401 unauthorized errors. This particularly affects long-running monitoring agents.
- **Source:** https://docs.aws.amazon.com/eks/latest/userguide/troubleshooting.html and https://github.com/kiali/kiali/issues/5070
- **Impact:** HIGH — Silent auth failure after ~3 months of uptime. The monitoring agent stops working but appears healthy.
- **Root Cause:** EKS enforces projected service account token rotation. Legacy token mounting (pre-K8s 1.21) doesn't auto-rotate.
- **Voyager Design Decision:** Use projected service account tokens exclusively. Implement token refresh validation that verifies token is not stale. Add a self-check that reports auth status. Test 90+ day uptime in E2E tests.

#### Issue: VPC CNI IP Address Exhaustion
- **Specific Issue:** AWS VPC CNI assigns real VPC IPs to each pod. On large clusters, this exhausts available IPs, preventing new pods from scheduling. "Running out of IPs on EKS" is an extremely common issue.
- **Source:** https://www.reddit.com/r/kubernetes/comments/1n3ipu0/running_out_of_ips_on_eks_use_secondary_cidr_vpc/ and https://www.reddit.com/r/kubernetes/comments/1jokwt6/using_eks_how_big_are_your_clusters/
- **Impact:** HIGH — New pods (including monitoring agents) can't schedule. DaemonSet pods may fail to start on new nodes.
- **Root Cause:** AWS VPC CNI defaults to allocating one ENI IP per pod. Each node has a limited number of ENIs and IPs per ENI.
- **Voyager Design Decision:** Document IP requirements per node (agent + sidecar pods). Recommend prefix delegation mode for VPC CNI. Test deployment on nodes with minimal available IPs. Keep pod count per node minimal (single agent pod + config-reloader sidecar).

#### Issue: EKS Version Upgrade Breaks Networking
- **Specific Issue:** EKS v1.32 upgrade broke networking due to VPC CNI incompatibility. Pods lose connectivity mid-upgrade.
- **Source:** https://www.reddit.com/r/kubernetes/comments/1idrqev/eks_v132_upgrade_broke_networking/
- **Impact:** HIGH — Complete pod networking failure during K8s upgrade.
- **Voyager Design Decision:** Test Voyager against EVERY EKS version upgrade path (N-1 → N). Maintain a compatibility matrix. Ensure our DaemonSet survives K8s version upgrades without reconfiguration.

---

### 3.2 AKS-Specific Issues

#### Issue: Node Pool Scaling Failures
- **Specific Issue:** AKS fails to add nodes to node pools with confusing errors. Scaling from 6 to 7 nodes shows the 7th VM running but never joins the K8s cluster. Duplicate IP configuration errors block new node pool creation.
- **Source:** https://www.reddit.com/r/AZURE/comments/plou7t/unable_to_scale_node_pool_in_aks/ and https://stackoverflow.com/questions/69559293/azure-kubernetes-service-aks-no-longer-able-to-create-new-nodepools
- **Impact:** HIGH — Auto-scaling fails silently, leaving clusters under-provisioned during demand spikes.
- **Voyager Design Decision:** Detect AKS node pool health and report when nodes are in Azure but not in K8s. Monitor the gap between desired and actual node count.

#### Issue: AKS Stateful Workload Reliability
- **Specific Issue:** AKS has persistent issues with stateful workloads. "Do not use AKS if your workloads are stateful" — Azure premium support's solution was "drain the node and delete it."
- **Source:** https://www.reddit.com/r/kubernetes/comments/duqz9p/be_warned_do_not_under_any_circumstances_use/
- **Impact:** MEDIUM for Voyager (we're mostly stateless) — but relevant for any persistent storage (TSDB, local caching).
- **Voyager Design Decision:** Design all Voyager components to be stateless where possible. For any required state (metric buffering, local cache), implement graceful recovery from sudden pod termination. Use cloud-managed databases for persistent data rather than StatefulSets on AKS.

#### Issue: Azure AD Integration Complexity
- **Specific Issue:** Azure AD (now Entra ID) integration with AKS requires restricted permissions, and insufficient permissions lead to deployment failures. The OpenID Connect integration between Azure AD and AKS is error-prone.
- **Source:** https://www.reddit.com/r/kubernetes/comments/j3b4xh/using_terraform_to_create_and_manage_a_ha_aks/
- **Impact:** MEDIUM — Authentication setup is a common barrier to deploying tools on AKS.
- **Voyager Design Decision:** Support workload identity (managed identity) as the primary auth mechanism on AKS. Minimize required Azure permissions. Provide clear documentation and a permissions validator tool.

---

### 3.3 Cross-Cloud Inconsistencies

#### Issue: IAM/Identity Differs Completely Between Clouds
- **Specific Issue:** EKS uses IRSA (IAM Roles for Service Accounts) via OIDC, AKS uses Azure Workload Identity, GKE uses Workload Identity Federation. Each requires different setup, different RBAC models, and different credential handling.
- **Source:** https://jason-umiker.medium.com/cross-cloud-identities-between-gcp-and-aws-from-gke-and-or-eks-182652bddadb
- **Impact:** HIGH — Platform teams must build and maintain separate authentication paths for each cloud. Helm values are completely different per cloud.
- **Voyager Design Decision:** Abstract cloud identity into a unified Voyager identity model. The Helm chart should auto-detect the cloud provider and configure the appropriate identity mechanism. Provide a single `voyager.cloudAuth.enabled=true` flag rather than cloud-specific configuration.

#### Issue: Storage Classes, Load Balancers, and Networking Are All Different
- **Specific Issue:** PersistentVolume types (EBS, Azure Disk, GCE PD), load balancers (ALB, Azure LB, GCE LB), and networking models (VPC CNI, Azure CNI, GKE native) all behave differently. A Helm chart that works on EKS may fail on AKS.
- **Source:** https://www.veeam.com/blog/managed-kubernetes-aks-eks-gke.html
- **Impact:** HIGH — Users report "I installed it on EKS and it works, but it fails on AKS" frequently.
- **Voyager Design Decision:** CI/CD must test on ALL three major clouds (EKS, AKS, GKE) for every release. Use cloud-agnostic storage (emptyDir for cache, PVC for persistent with cloud-specific storage class documented). Never hard-code AWS/Azure/GCP-specific assumptions.

---

## 4. Security Tool Failures

### 4.1 False Positive Rates in Runtime Security

#### Issue: Default Falco Rules Generate Noise on Managed K8s
- **Specific Issue:** Falco's default rules trigger on cloud-provider system operations that are legitimate (metadata service queries, node management, CSI driver operations). On GKE, ordinary actions trigger false positives. Output fields show "N/A" making triage impossible.
- **Source:** https://github.com/falcosecurity/falco/issues/439 and https://www.sysdig.com/blog/day-2-falco-container-security-tuning-the-rules
- **Impact:** HIGH — Alert fatigue leads to disabling rules, which is worse than no security tool at all (false sense of security).
- **Root Cause:** Rules are written for bare-metal K8s assumptions. Managed K8s providers run proprietary agents and system pods that look suspicious to generic rules.
- **Voyager Design Decision:** IF we do runtime security: ship per-cloud-provider baseline profiles. Include a mandatory "learning/audit" phase before enforcement. Report false positive rate as a first-class metric. Auto-detect managed K8s environment.

### 4.2 eBPF Event Loss Under High Syscall Volume

#### Issue: Ring Buffer Overflow Silently Drops Security Events
- **Specific Issue:** eBPF-based security tools use kernel ring buffers to transport events to userspace. Under high syscall volume (e.g., I/O-intensive workloads), the ring buffer overflows and events are silently lost. "It is very common to find solutions implementing ways to tell users that eBPF events are lost."
- **Source:** https://accuknox.com/wp-content/uploads/Container_Runtime_Security_Tooling.pdf and https://github.com/falcosecurity/falco/issues/1809
- **Impact:** CRITICAL — An attacker who generates enough I/O noise can blind eBPF-based security monitoring. Security events are lost during exactly the conditions that indicate an attack.
- **Root Cause:** eBPF perf/ring circular buffers have fixed sizes. When userspace can't consume events fast enough, events are overwritten.
- **Voyager Design Decision:** If implementing eBPF security: use in-kernel filtering to reduce event volume (only pass security-relevant syscalls). Monitor and alert on event drop rate. Use per-CPU ring buffers with back-pressure signaling. Critical events (exec, connect) must have dedicated higher-priority buffers.

### 4.3 CVE Scanner Accuracy Problems

#### Issue: Same Image, Three Scanners, Three Different Results
- **Specific Issue:** Running Trivy, Grype, and Clair on the same container image produces "hilariously inconsistent" results. Same CVE-2023-XXXXX shows as critical in one tool, low in another, and not found in the third.
- **Source:** https://www.reddit.com/r/devops/comments/1q7njto/ran_trivy_grype_and_clair_on_the_same_image_got/
- **Impact:** HIGH — Teams can't trust vulnerability scan results. Critical vulnerabilities may be missed by any single scanner.
- **Root Cause:** Each scanner uses different advisory databases, different SBOM catalogers, and different version matching heuristics. NVD CPE matching produces false positives, and language-specific ecosystems are handled differently.
- **Voyager Design Decision:** If we do image scanning: aggregate from multiple vulnerability databases. Be transparent about data sources and confidence levels. Never present a single vulnerability count as authoritative — show the range.

#### Issue: Scanners Misdetect Package Versions, Causing False Positives
- **Specific Issue:** Trivy misdetects Python 3.11.2 (from a stdlib package) in a Debian Bookworm image that actually has Python 3.12.3 installed, reporting many false positive CVEs. Grype detects the same Python version *twice* through different catalogers.
- **Source:** https://www.augmentedmind.de/2025/08/27/image-security-1-fallacies-scanner/
- **Impact:** HIGH — False positives waste engineering time on non-existent vulnerabilities. Teams learn to ignore scanner results, reducing actual security.
- **Root Cause:** Package metadata on disk (deb package database) doesn't always reflect the actual running software version. Multiple catalogers find the same package through different detection methods.
- **Voyager Design Decision:** Cross-reference multiple detection methods and resolve conflicts (prefer binary version detection over package manager metadata). Report detected vs actual versions when there's a discrepancy. Implement VEX (Vulnerability Exploitability eXchange) support to let users mark false positives.

#### Issue: Scanner Database Update Lag Means Missing Recent CVEs
- **Specific Issue:** Clair's vulnerability database updates lag behind, regularly missing newer vulnerabilities. Even Trivy and Grype can be 24-48 hours behind NVD on new CVEs.
- **Source:** https://www.reddit.com/r/devops/comments/1q7njto/ran_trivy_grype_and_clair_on_the_same_image_got/
- **Impact:** MEDIUM — New critical CVEs (e.g., Log4Shell) may not be detected for hours or days.
- **Voyager Design Decision:** Show database freshness prominently ("Last updated: 2 hours ago"). Implement continuous re-scanning of deployed images when database updates arrive. Never show a clean scan result alongside stale data.

### 4.4 Container Escape Detection Blind Spots

#### Issue: eBPF Can Be Misused for Cross-Container Attacks
- **Specific Issue:** Research paper demonstrates that eBPF tracing programs can access other processes' memory and syscall arguments via `bpf_probe_read_user` helper, enabling cross-container data theft and kernel address exposure for container escape.
- **Source:** https://www.usenix.org/system/files/usenixsecurity23-he.pdf (USENIX Security 2023)
- **Impact:** HIGH — The security monitoring tool's own mechanism (eBPF) could be an attack vector if an attacker gains eBPF privileges inside a container.
- **Root Cause:** eBPF's design allows broad kernel access for tracing purposes. The same power used for security monitoring can be weaponized.
- **Voyager Design Decision:** Restrict eBPF capabilities to the minimum needed. Run eBPF programs only from a privileged init container that loads programs at startup, then drops capabilities. Monitor for unauthorized BPF program loading as a security event itself.

#### Issue: File Path Resolution in eBPF Is Unreliable
- **Specific Issue:** Open syscalls can be given relative and unresolved paths. eBPF-based file integrity monitoring that relies on syscall path arguments "has hidden limitations which may lead to coverage loss" because paths like `../../../etc/shadow` resolve differently than expected.
- **Source:** https://www.sstic.org/media/SSTIC2021/SSTIC-actes/runtime_security_with_ebpf/SSTIC2021-Article-runtime_security_with_ebpf-fournier_afchain_baubeau.pdf
- **Impact:** MEDIUM-HIGH — An attacker can use relative paths to access sensitive files while evading detection rules that match on absolute paths.
- **Voyager Design Decision:** If monitoring file access: resolve paths to absolute in kernel-space before matching against rules. Use directory file descriptor (dirfd) based resolution rather than string matching on syscall arguments.

---

## Summary: Top Design Principles for Voyager

Based on all findings above, these are the non-negotiable design principles:

1. **Monitor the Monitor:** Our agent MUST track its own resource usage, report coverage gaps, and never consume more resources than the workloads it monitors.

2. **API Server Kindness:** Never hit the K8s API from DaemonSet pods. Use a centralized operator with informer caches and proper watch semantics.

3. **Cardinality as a First-Class Concern:** Build cardinality analysis, limits, and warnings into the metrics pipeline. Never allow unbounded label values.

4. **Multi-Cloud from Day One:** Test every release on EKS, AKS, and GKE. Abstract cloud-specific identity, storage, and networking.

5. **Cost Accuracy or Nothing:** Reconcile against actual cloud billing. Show confidence levels. Never show inaccurate costs — it's worse than no data.

6. **Graceful Degradation over Silent Failure:** When limits are hit, shed load intelligently. Never silently drop data. Always report what coverage level is active.

7. **Security Rules Per Cloud Provider:** Ship cloud-specific rule profiles. Include learning mode. Report false positive rates.

8. **WebSocket Alternatives:** Use SSE or polling with caching over WebSockets for dashboard real-time updates. Avoid stateful connection scaling problems.

9. **Log Storage in Object Storage:** Default to S3/GCS/Blob for log retention. Label-based indexing over full-text indexing.

10. **Helm Resilience:** Use `--atomic`, include configuration hash annotations, verify post-upgrade state, and handle stuck releases automatically.
