# Voyager Platform — Unified Cloud Operations Dashboard

## Vision
A modern, AI-powered unified cloud operations platform combining:
1. **ClusterOps** — Cluster health, pod status, logs, Lens-like drill-down
2. **FinOps** — Cloud cost visibility, waste detection, optimization
3. **SecurityOps** — Vulnerability findings, compliance, threat detection
4. **AI Layer** — Intelligent debugging, root cause analysis, automated suggestions
5. **Voyager Monitor** — DaemonSet-based node-level scanning (runtime security, suspicious activity)

## Architecture Notes
- Existing: Voyager Monitor Helm chart (DaemonSet on all clusters)
- Clusters: EKS + Azure (AKS)
- Current stack: Prometheus + Grafana + AlertManager → VictoriaMetrics + Splunk
- Need: Unified modern dashboard replacing fragmented tools

## Research Phase
Deep competitive analysis before any code. See /research for findings.

## Owner
Viktor (Vik) — DevOps Engineer @ Voyager Labs
Atlas ⚡ — Architecture, Research, AI Strategy
