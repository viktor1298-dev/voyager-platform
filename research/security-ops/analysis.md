# Cloud Security / SecurityOps Competitive Analysis

> **Research Date:** February 2026  
> **Purpose:** Deep competitive intelligence for building a competing DaemonSet-based cloud security product  
> **Analyst:** Voyager Platform Research

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Individual Platform Analysis](#individual-platform-analysis)
   - [Wiz](#1-wiz)
   - [Prisma Cloud (Palo Alto)](#2-prisma-cloud-by-palo-alto-networks)
   - [Aqua Security](#3-aqua-security)
   - [Sysdig](#4-sysdig)
   - [Lacework FortiCNAPP (Fortinet)](#5-lacework-forticnapp-by-fortinet)
   - [Snyk](#6-snyk)
   - [Falco (Open Source)](#7-falco-open-source)
   - [AWS GuardDuty + Inspector](#8-aws-guardduty--inspector)
3. [Comparison Matrix](#comparison-matrix)
4. [Feature Analysis](#feature-analysis)
5. [Opportunity Analysis](#opportunity-analysis)
6. [DaemonSet-Based Scanner Advantages](#daemonset-based-scanner-unique-value-proposition)

---

## Executive Summary

The Cloud Security / CNAPP (Cloud-Native Application Protection Platform) market is dominated by ~8 major players across three tiers:

- **Tier 1 (Market Leaders):** Wiz (~$500M+ ARR, acquired by Google for $32B), Prisma Cloud (Palo Alto, largest cybersecurity vendor)
- **Tier 2 (Strong Competitors):** Sysdig (runtime-first), Aqua Security (container pioneer), Lacework/FortiCNAPP (Fortinet-backed)
- **Tier 3 (Specialized/Adjacent):** Snyk (developer-first), Falco (open-source runtime), AWS native tools (GuardDuty/Inspector)

**Key Market Trends:**
- Consolidation: The market is rapidly consolidating (Wiz→Google, Lacework→Fortinet, Prisma rebranding to Cortex Cloud)
- Runtime is the new frontier: Every vendor is racing to add real-time runtime detection after starting agentless
- AI/ML integration: Every platform now has an AI copilot/assistant feature
- Hybrid approach wins: The market is converging on agentless + optional agent/sensor models
- Pricing is opaque: Nearly every vendor uses custom enterprise pricing; transparency is rare

**Critical Gap Identified:** No vendor effectively delivers continuous, in-cluster, DaemonSet-native security scanning with deep syscall-level visibility combined with real-time container forensics, without requiring cloud API access or external data egress.

---

## Individual Platform Analysis

### 1. Wiz

**Company:** Wiz (founded 2020, Israel) — Acquired by Google Cloud for $32B (2025)  
**Category:** CNAPP (Cloud-Native Application Protection Platform)  
**Revenue:** ~$500M+ ARR (2024), fastest-growing cybersecurity company ever

#### Core Features

| Feature | Details |
|---------|---------|
| **CSPM** | Cloud Security Posture Management across AWS, Azure, GCP, OCI, Alibaba, VMware |
| **Vulnerability Management** | Agentless scanning of VMs, containers, serverless; risk-based prioritization |
| **CWPP** | Cloud Workload Protection with agentless + optional sensor |
| **KSPM** | Kubernetes Security Posture Management |
| **CIEM** | Cloud Infrastructure Entitlement Management |
| **DSPM** | Data Security Posture Management |
| **IaC Scanning** | Infrastructure-as-Code security for Terraform, CloudFormation, etc. |
| **Container Security** | Image scanning, registry scanning, runtime protection |
| **Code Security (Wiz Code)** | SAST, SCA, secrets detection, CI/CD pipeline security |
| **Runtime Protection (Wiz Defend)** | eBPF-based sensor for real-time threat detection and response |
| **AI SPM** | AI Security Posture Management for LLM/AI workloads |
| **Security Graph** | Contextual risk graph connecting all security findings |

#### Pricing Model

| Tier | Price | Details |
|------|-------|---------|
| Wiz Essential | $24,000/yr | 100 cloud workloads, 12-month commitment |
| Wiz Advanced | $38,000/yr | 100 cloud workloads, 12-month commitment |
| Wiz Sensor (add-on) | $28,000/yr | 100 sensors for runtime protection |
| Wiz Code (add-on) | $58,500/yr | 100 code licenses |
| **Typical enterprise deal** | **$24K–$354K/yr** | **Median ~$111,500/yr (Vendr data)** |

#### Target Audience
- **Primary:** Large enterprises (50%+ of Fortune 100 are customers)
- **Secondary:** Mid-market companies with significant cloud footprint
- Not cost-effective for small teams or startups

#### Key Differentiators
1. **Agentless-first architecture** — deploys in minutes via cloud API, no agents needed for initial visibility
2. **Security Graph** — correlates vulnerabilities, misconfigurations, network exposure, identities, and data into attack paths
3. **Speed of deployment** — often deployed across entire multi-cloud estate in <24 hours
4. **Wiz Defend (runtime)** — lightweight eBPF sensor launched 2024/2025, hybrid agentless + agent model
5. **Google acquisition** — future deep GCP integration expected (concern for AWS/Azure users)

#### Weaknesses & User Complaints
- **Expensive** — prohibitive for smaller orgs; minimum $24K/yr even for basic tier
- **Primarily agentless** — until recently had no runtime protection; Wiz Defend/Sensor is still maturing
- **Google acquisition concern** — multi-cloud users worried about neutrality under Google ownership
- **Alert noise** — some users report too many findings without sufficient prioritization context
- **"Outpost" data residency** — only available on top-tier subscriptions; data still sent to Wiz backend on lower tiers
- **UI/UX** — some reviews mention the interface could be more intuitive
- **No blocking/prevention** — primarily a detection/visibility tool; doesn't actively block attacks in runtime (yet)
- **Patent lawsuit from Orca** — legal issues around agentless scanning IP

#### Integration Capabilities
- **200+ integrations** via Wiz Integration (WIN) platform
- Native integrations with SIEM (Splunk, Sentinel, QRadar), ticketing (Jira, ServiceNow), Slack, PagerDuty
- CI/CD: GitHub, GitLab, Jenkins, CircleCI, Azure DevOps
- Cloud: AWS, Azure, GCP, OCI, Alibaba, VMware vSphere

#### AI/ML Features
- **AI-powered risk prioritization** — contextual scoring of vulnerabilities
- **AI SPM** — Security for AI/ML workloads and models
- **Wiz AskAI** — natural language query interface for security graph

#### Runtime Protection
- **Wiz Defend** (GA April 2025): eBPF-based sensor, cloud telemetry analysis, threat detection and response
- Hybrid model: agentless cloud API scanning + optional runtime sensor
- Runtime detection for containers, Kubernetes, Linux, Windows (preview)
- Not yet at parity with Sysdig/Aqua for deep runtime blocking

---

### 2. Prisma Cloud (by Palo Alto Networks)

**Company:** Palo Alto Networks (PANW, public, ~$80B market cap)  
**Category:** CNAPP — rebranding to "Cortex Cloud" (2025/2026)  
**Note:** Being merged with Cortex XDR to create unified cloud + SOC platform

#### Core Features

| Feature | Details |
|---------|---------|
| **CSPM** | Comprehensive cloud posture management, 1T+ events analyzed daily |
| **CWP** | Cloud Workload Protection for hosts, containers, serverless |
| **Container Security** | Full lifecycle from build to runtime (formerly Twistlock) |
| **CIEM** | Identity and access management for cloud |
| **Code Security** | SAST, SCA, IaC scanning, secrets detection |
| **API Security** | API discovery and protection |
| **Web Application Security** | WAF-like protection (WAAS) |
| **DSPM** | Data security posture management |
| **AI SPM** | AI security posture management |
| **Network Security** | Microsegmentation, network visualization |
| **Compliance** | Extensive compliance frameworks (CIS, SOC2, PCI, HIPAA, etc.) |
| **AppDNA** | Application behavior and dependency analysis |

#### Pricing Model

| Edition | Price | Details |
|---------|-------|---------|
| Business Edition | $9,000/yr | 100 credits; CSPM, compliance, remediation |
| Enterprise Edition | $18,000/yr | 100 credits; adds UEBA, network monitoring, host vuln mgmt |
| **Credit-based licensing** | Varies | Credits consumed based on resources protected and features used |
| **Typical enterprise deal** | **$50K–$500K+/yr** | **Highly variable based on scope** |

#### Target Audience
- **Primary:** Large enterprises already in the Palo Alto ecosystem
- **Secondary:** Regulated industries (finance, healthcare, government)
- Strong with existing PANW firewall/Cortex customers (cross-sell motion)

#### Key Differentiators
1. **Most comprehensive feature set** — broadest coverage of any CNAPP (CSPM, CWP, CIEM, code, API, WAAS, network, data)
2. **Palo Alto ecosystem integration** — Cortex XDR, XSOAR, firewall, Prisma Access SASE
3. **Twistlock heritage** — deep container security from acquired Twistlock (2019)
4. **Enterprise sales machine** — massive enterprise salesforce and partner network
5. **Cortex Cloud convergence** — merging cloud security + SOC into single platform

#### Weaknesses & User Complaints
- **Extremely complex** — steep learning curve; requires significant expertise to configure
- **Expensive** — credit-based pricing is confusing and costs escalate quickly
- **Too much noise** — excessive alerts and findings without adequate actionable guidance
- **Reporting is awful** — frequently cited as the worst aspect (Reddit: "created more work than it solved")
- **Heavy resource utilization** — scanning can impact cloud resource performance
- **Integration lock-in** — works best within Palo Alto ecosystem; limited third-party flexibility
- **Slow innovation** — acquired product (Twistlock, Bridgecrew) stitched together; UI inconsistencies
- **Support issues** — mixed reviews on support quality and responsiveness

#### Integration Capabilities
- Deep integration with Palo Alto ecosystem (Cortex XDR, XSOAR, firewalls, Prisma Access)
- CI/CD: GitHub, GitLab, Jenkins, Azure DevOps, JFrog
- SIEM: Splunk, AWS Security Hub, ServiceNow, Cortex XSIAM
- Cloud: AWS, Azure, GCP
- IaC: Terraform, CloudFormation, Kubernetes manifests

#### AI/ML Features
- **Precision AI** — AI-powered risk prioritization across code-to-cloud
- **Prisma Cloud Copilot** — conversational AI for investigation and remediation
- **UEBA** — User and Entity Behavior Analytics (ML-based anomaly detection)
- **AI SPM** — AI security posture management

#### Runtime Protection
- **Agent-based (Defender)** — containerized agent for runtime protection, formerly Twistlock
- Process-level monitoring, file integrity monitoring
- Runtime policies with auto-learn and custom rules
- Microsegmentation and network policies
- Forensics and incident investigation
- **Mature runtime capabilities** — among the strongest in the market due to Twistlock heritage

---

### 3. Aqua Security

**Company:** Aqua Security (founded 2015, Israel) — Private, ~$1B+ valuation  
**Category:** CNAPP with focus on container/cloud-native security  
**Heritage:** Pioneer in container security

#### Core Features

| Feature | Details |
|---------|---------|
| **Container Image Scanning** | Vulnerability, malware, secrets scanning (Aqua Lightning for speed) |
| **Runtime Protection** | MicroEnforcer agents with drift prevention, real-time blocking |
| **CSPM** | Cloud posture management for AWS, Azure, GCP |
| **Kubernetes Security** | Kube-bench, admission control, manifest scanning, Helm chart analysis |
| **Software Supply Chain Security** | CI/CD pipeline scanning, SBOM generation, code scanning |
| **Dynamic Threat Analysis (DTA)** | Sandbox behavioral analysis of unknown container images |
| **Network Firewall** | Container-level network firewall and microsegmentation |
| **Secrets Management** | Vault integration, secrets injection |
| **Compliance** | CIS benchmarks, PCI DSS, HIPAA, SOC 2 |
| **AI Security** | AI application lifecycle security, prompt injection protection |
| **vShield** | Virtual patching for known vulnerabilities |

#### Pricing Model

| Tier | Price | Details |
|------|-------|---------|
| Free/Open-source tools | Free | Kube-Bench, MicroScanner, Trivy (acquired) |
| Starter | ~$100/month | Limited workloads |
| Enterprise | Custom | Priced per node/host; ~$50K+/yr for mid-size |
| Pay-per-scan (AWS) | $0.29/scan | Image scanning via AWS Marketplace |
| GCP Marketplace | $0.05–$0.33/node/hr | Based on node size |
| **Typical enterprise deal** | **$10K–$25K+/yr** per TrustRadius; enterprise custom quotes $50K+ |

#### Target Audience
- **Primary:** Mid-to-large enterprises with mature DevOps/container environments
- **Secondary:** Organizations with heavy Kubernetes workloads
- Strong in finance, healthcare, government, and software companies

#### Key Differentiators
1. **Container security pioneer** — deepest expertise in container lifecycle security
2. **Best-in-class runtime protection** — MicroEnforcer with drift prevention, real-time blocking
3. **Dynamic Threat Analysis** — unique sandbox behavioral analysis of container images
4. **Open-source contributions** — Trivy (vulnerability scanner), Kube-Bench, Tracee (eBPF tracing)
5. **Agent + agentless hybrid** — combined approach with lightweight agents
6. **AI application security** — first-mover in LLM/AI workload protection including prompt injection defense

#### Weaknesses & User Complaints
- **Steep learning curve** — requires dedicated security expertise to operate
- **Complex UI** — interface can be overwhelming for less technical users
- **Higher pricing** — premium pricing compared to some competitors
- **Limited CSPM depth** — not as comprehensive as Wiz/Prisma for cloud posture
- **Some runtime performance issues** — older reviews noted enforcer impacting workload performance
- **Market visibility** — less marketing/brand awareness than Wiz or Prisma Cloud

#### Integration Capabilities
- CI/CD: Jenkins, GitHub Actions, GitLab CI, Azure DevOps, CircleCI, Bamboo
- Registries: Docker Hub, ECR, ACR, GCR, Harbor, JFrog, Nexus
- Orchestrators: Kubernetes, Docker EE, OpenShift, Rancher, ECS, EKS, AKS, GKE
- SIEM: Splunk, Sumo Logic, ArcSight, QRadar
- IaC: Terraform, CloudFormation
- Secrets: HashiCorp Vault
- Cloud: AWS, Azure, GCP, on-prem, hybrid

#### AI/ML Features
- **Aqua Lightning** — high-speed vulnerability scanning engine
- **ML-based behavioral policies** — runtime behavioral profiling using machine learning
- **AI Security Dashboard** — visibility into AI workloads and model risks
- **AI Application Protection** — prompt injection detection, model integrity monitoring

#### Runtime Protection
- **MicroEnforcer** — lightweight agent deployable as sidecar or DaemonSet
- **Drift prevention** — blocks unauthorized file and process changes in running containers
- **Real-time threat blocking** — actively blocks suspicious activity, not just alerts
- **Network firewall** — container-level network policy enforcement
- **Forensics** — deep container forensics and incident investigation
- **Strongest runtime blocking** in the market — one of few that actually prevents attacks, not just detects

---

### 4. Sysdig

**Company:** Sysdig (founded 2013) — Private, ~$5B valuation  
**Category:** CNAPP with runtime-first approach  
**Heritage:** Created Falco (open-source) and Sysdig Inspect; Wireshark founders involved

#### Core Features

| Feature | Details |
|---------|---------|
| **Runtime Threat Detection** | eBPF-based syscall monitoring, Falco-powered detection engine |
| **Vulnerability Management** | Agent-based + agentless scanning, in-use vulnerability prioritization |
| **CSPM** | Cloud Security Posture Management across AWS, GCP, Azure |
| **CIEM** | Cloud identity and entitlement management |
| **IaC Security** | Infrastructure-as-Code scanning |
| **Compliance** | Continuous compliance monitoring (PCI, HIPAA, NIST, SOC 2) |
| **Cloud Detection & Response (CDR)** | Real-time threat detection across cloud, containers, K8s |
| **Network Security** | Network policy visualization and enforcement |
| **Cloud Monitoring** | Prometheus-compatible monitoring, cost optimization |
| **Forensics** | Deep capture for post-incident analysis |

#### Pricing Model

| Component | Details |
|-----------|---------|
| **CNAPP** | Per host/month licensing; compute instances for CSPM |
| **Detection & Response** | Per host/month; per events processed for cloud logs |
| **Cloud Monitoring** | Host-based or time-series-based licensing |
| **Typical enterprise deal** | Custom pricing; estimated $20K–$200K+/yr based on host count |

#### Target Audience
- **Primary:** Cloud-native organizations with strong Kubernetes adoption
- **Secondary:** DevSecOps teams needing runtime + monitoring convergence
- Strong in technology, financial services, and SaaS companies

#### Key Differentiators
1. **Runtime-first philosophy** — "Cloud security starts at runtime"; deepest runtime intelligence
2. **eBPF-based detection** — uses extended BPF for performant syscall-level monitoring
3. **Falco foundation** — built on the CNCF-graduated Falco project (created by Sysdig)
4. **In-use vulnerability prioritization** — only flags vulnerabilities in packages actually loaded at runtime
5. **Sysdig Sage AI** — agentic AI security analyst, reduces MTTR by 76%
6. **Monitoring + Security convergence** — unique combined security and observability platform

#### Weaknesses & User Complaints
- **Forced product bundling** — historically required purchasing monitoring with security
- **Complex deployment** — agent-based approach requires more operational overhead
- **Administrative drain** — some users report excessive maintenance requirements
- **Smaller market share** — less brand recognition than Wiz/Prisma
- **Agent dependency** — requires deploying and maintaining agents across infrastructure
- **Pricing complexity** — host-based pricing can be unpredictable with auto-scaling

#### Integration Capabilities
- Cloud: AWS, Azure, GCP
- Orchestrators: Kubernetes (EKS, AKS, GKE), OpenShift
- CI/CD: GitHub, GitLab, Jenkins, Harbor
- SIEM: Splunk, IBM QRadar, Sumo Logic
- Ticketing: Jira, ServiceNow, PagerDuty, Slack
- Monitoring: Prometheus, Grafana (native compatibility)
- Cloud services: AWS Fargate, Google Cloud Run (serverless)

#### AI/ML Features
- **Sysdig Sage** — first agentic AI cloud security analyst; multi-step reasoning, remediation playbooks
- **Behavioral anomaly detection** — ML-based behavioral profiling
- **In-use risk prioritization** — AI-driven assessment of real runtime risk
- Over 50% of customers actively using Sysdig Sage

#### Runtime Protection
- **eBPF-based agent** — lightweight kernel-level syscall interception
- **Falco rules engine** — real-time detection based on customizable rules
- **Container/K8s detection** — process, file, network activity monitoring
- **Cloud log detection** — AWS CloudTrail, GCP Audit Logs, Azure Activity Logs, Okta, GitHub
- **Serverless detection** — AWS Fargate, Google Cloud Run
- **Deep capture** — full syscall recording for forensic investigation
- **The strongest runtime-first platform** in the commercial market

---

### 5. Lacework FortiCNAPP (by Fortinet)

**Company:** Fortinet (acquired Lacework for ~$200–230M in 2024)  
**Category:** CNAPP integrated into Fortinet Security Fabric  
**History:** Lacework was a cloud security unicorn ($8.3B peak valuation) before massive down-round

#### Core Features

| Feature | Details |
|---------|---------|
| **Anomaly Detection** | Patented ML-based behavioral anomaly detection (no rules needed) |
| **CSPM** | Cloud Security Posture Management for AWS, Azure, GCP |
| **CIEM** | Cloud identity risk scoring and permission right-sizing |
| **Vulnerability Management** | Agentless + agent-based scanning |
| **Compliance** | PCI DSS, HIPAA, SOC 2, ISO 27001 continuous compliance |
| **Container Security** | Image scanning, Kubernetes security |
| **Code Security** | IaC scanning, SCA |
| **Runtime Threat Detection** | Agent-based anomaly detection and zero-day threat identification |
| **Attack Path Analysis** | Visualization of entity relationships and lateral movement risks |
| **FortiGuard Integration** | Outbreak alerts and threat intelligence from Fortinet |

#### Pricing Model

| Tier | Price | Details |
|------|-------|---------|
| Starter Pack | $22,000/yr | Includes 3-day consulting (AWS Marketplace) |
| Enterprise | Custom | Based on workloads and cloud accounts |
| **Typical deal** | **$22K–$150K+/yr** | **Variable based on deployment scope** |

#### Target Audience
- **Primary:** Existing Fortinet/Security Fabric customers
- **Secondary:** Organizations wanting integrated network + cloud security
- Growing focus on mid-market with Fortinet's channel

#### Key Differentiators
1. **Patented ML anomaly detection** — detects zero-day threats without pre-written rules
2. **Fortinet Security Fabric integration** — unified with FortiGate, FortiGuard, FortiSIEM
3. **Low alert noise** — claims to reduce critical alerts to ~1.4/day and eliminate 95% false positives
4. **Automated remediation** — active blocking of runtime threats (added post-Fortinet acquisition)
5. **Threat intelligence** — FortiGuard Outbreak Alerts for emerging threats

#### Weaknesses & User Complaints
- **Lacks remediation features** — historically weak on automated fix capabilities (improving)
- **Code Security immaturity** — "features on paper" but don't reflect real customer processes
- **No SCIM** — surprisingly missing for a security tool
- **Post-acquisition uncertainty** — product direction unclear as Fortinet integrates
- **Reporting limitations** — needs significant improvement
- **Overlap with AWS-native tools** — some users report redundancy with CloudTrail, GuardDuty, Security Hub
- **Smaller community** — less ecosystem and community support than competitors

#### Integration Capabilities
- Fortinet ecosystem: FortiGate, FortiSIEM, FortiSOAR, FortiGuard
- Cloud: AWS, Azure, GCP
- CI/CD: GitHub, GitLab, Jenkins
- Ticketing: Jira, ServiceNow, Slack, PagerDuty
- SIEM: Splunk, Sumo Logic

#### AI/ML Features
- **Patented ML anomaly detection** — behavioral baseline modeling, no manual rule maintenance
- **Zero-day detection** — detects compromised credentials, ransomware, cryptojacking without pre-defined patterns
- **FortiGuard AI** — Fortinet's global threat intelligence AI

#### Runtime Protection
- **Agent-based monitoring** — Linux agent for runtime behavioral analysis
- **Anomaly-based detection** — ML-driven, no rule writing required
- **Automated blocking** — can block active runtime threats (newer feature)
- **Cloud log analysis** — AWS, Azure, GCP log-based detections
- Less mature than Sysdig/Aqua for deep syscall-level runtime protection

---

### 6. Snyk

**Company:** Snyk (founded 2015, Israel/UK) — Private, ~$7.4B valuation  
**Category:** Developer Security Platform (DevSecOps-focused)  
**Note:** Snyk is more AppSec than CloudSec; included for container scanning capabilities

#### Core Features

| Feature | Details |
|---------|---------|
| **Snyk Open Source (SCA)** | Software Composition Analysis, dependency vulnerability scanning |
| **Snyk Code (SAST)** | Static Application Security Testing with DeepCode AI engine |
| **Snyk Container** | Container image vulnerability scanning, base image recommendations |
| **Snyk IaC** | Infrastructure-as-Code scanning (Terraform, CloudFormation, K8s) |
| **DeepCode AI Fix** | AI-powered automated code fixes |
| **SBOM Generation** | Software Bill of Materials creation and enrichment |
| **License Compliance** | Open-source license compliance checking |
| **Snyk AI Security Platform** | Security for AI-generated and AI-assisted code |

#### Pricing Model

| Plan | Price | Details |
|------|-------|---------|
| **Free** | $0 | Individual developers; limited tests (100-300/mo per product) |
| **Team** | $25/dev/month | Up to 10 developers; Jira integration, license compliance |
| **Ignite** | Custom | Up to 100 developers; reports, SSO, SBOM, private registries |
| **Enterprise** | Custom | Unlimited developers; custom roles, FedRAMP, rich API |
| **Typical enterprise deal** | **$50K–$500K+/yr** | **Based on developer count and products** |

#### Target Audience
- **Primary:** Developer teams and AppSec programs
- **Secondary:** DevSecOps organizations wanting shift-left security
- Strongest with development teams; weaker for security/ops teams

#### Key Differentiators
1. **Developer-first UX** — designed for developers, not security analysts
2. **IDE integration** — real-time scanning inside VS Code, IntelliJ, etc.
3. **Free tier** — generous free plan for individual developers and small teams
4. **DeepCode AI** — fast, accurate SAST engine (rated "second-to-none" for speed)
5. **Fix guidance** — provides fix recommendations, not just findings
6. **Broad language support** — 14+ programming languages

#### Weaknesses & User Complaints
- **No runtime protection** — purely shift-left; no runtime/cloud security
- **CLI ≠ UI disconnect** — ignoring issues in CLI doesn't sync with web UI
- **Per-project counting is confusing** — each pom.xml and Dockerfile counts as separate project
- **Cost at scale** — enterprise pricing escalates significantly with developer count
- **SCA vs SAST trade-off** — "decent SCA with bolted-on janky SAST" (user quote)
- **Aggressive sales team** — multiple users report off-putting sales tactics
- **Limited cloud security** — not a CNAPP; no CSPM, CWPP, CIEM capabilities
- **Alert fatigue** — "yells about vulnerabilities once a week" without context

#### Integration Capabilities
- IDE: VS Code, IntelliJ, Eclipse, Visual Studio, Vim
- SCM: GitHub, GitLab, Bitbucket, Azure Repos
- CI/CD: Jenkins, CircleCI, Azure Pipelines, GitHub Actions, GitLab CI
- Registries: Docker Hub, ECR, ACR, GCR, JFrog, Harbor
- Ticketing: Jira, Slack
- CLI: Standalone CLI tool
- Broker: For air-gapped/private environments

#### AI/ML Features
- **DeepCode AI Engine** — semantic code analysis using ML
- **DeepCode AI Fix** — automated code fix suggestions in IDE
- **Snyk AI Security Platform** — security scanning for AI-generated code
- **Snyk MCP Server** — enables AI coding assistants to integrate Snyk scanning
- Exploring AI for base image upgrade prediction and Dockerfile fix suggestions

#### Runtime Protection
- **None** — Snyk has no runtime protection capabilities
- Purely pre-deployment/shift-left scanning
- Container scanning is for images only (pre-deployment vulnerability detection)
- No runtime agent, no cloud workload protection, no threat detection

---

### 7. Falco (Open Source)

**Company:** CNCF Graduated Project (originally created by Sysdig)  
**Category:** Open-source runtime security  
**License:** Apache 2.0  
**GitHub Stars:** 7K+

#### Core Features

| Feature | Details |
|---------|---------|
| **Syscall Monitoring** | Kernel-level system call interception via eBPF or kernel module |
| **Rule-Based Detection** | YAML-based rules for defining security policies |
| **Container Context** | Enriches events with container runtime and Kubernetes metadata |
| **K8s Audit Logs** | Ingests and analyzes Kubernetes audit log events |
| **Plugin System** | Extensible via plugins for additional event sources |
| **Real-Time Alerts** | Immediate notification on rule violations |
| **Multiple Output Channels** | Stdout, file, syslog, HTTP(S), gRPC |
| **Falcosidekick** | Event routing to 50+ outputs (Slack, Teams, S3, Kafka, etc.) |

#### Pricing Model

| Component | Price |
|-----------|-------|
| Falco | **Free (Apache 2.0)** |
| Community Support | Free |
| Enterprise Support | Via Sysdig (commercial) |

#### Target Audience
- **Primary:** DevOps/SRE teams with Kubernetes expertise
- **Secondary:** Organizations wanting customizable runtime security
- Requires significant expertise to deploy and maintain effectively

#### Key Differentiators
1. **Free and open-source** — no licensing costs, full transparency
2. **CNCF graduated** — highest maturity level in cloud-native ecosystem
3. **eBPF-native** — modern, performant kernel-level monitoring
4. **Highly customizable** — flexible rule language for any detection scenario
5. **Foundation for commercial products** — Sysdig Secure is built on Falco
6. **Community-driven** — active community and ecosystem (falcosidekick, falcoctl)

#### Weaknesses & User Complaints
- **Detection only** — no blocking/prevention capabilities; alerts but doesn't stop attacks
- **No GUI/dashboard** — command-line only; requires separate visualization tools
- **Rule management complexity** — writing and maintaining rules requires deep expertise
- **No vulnerability scanning** — runtime detection only; no CVE scanning, SBOM, etc.
- **Privileged deployment** — requires privileged containers or host-level access (DaemonSet)
- **No cloud posture management** — no CSPM, CIEM, IaC scanning
- **No central management** — must be managed per-cluster; no multi-cluster management plane
- **Alert fatigue** — without tuning, can generate excessive false positives

#### Integration Capabilities
- Kubernetes (primary platform)
- Output: Stdout, syslog, file, HTTP(S), gRPC
- Via Falcosidekick: Slack, Teams, Discord, PagerDuty, OpsGenie, Kafka, NATS, AWS SNS/SQS/S3/Lambda, GCP Pub/Sub, Elasticsearch, Loki, Datadog, and 50+ more
- Cloud audit logs via plugins (AWS CloudTrail, GCP, Okta, GitHub)

#### AI/ML Features
- **None** — purely rule-based detection
- No ML-based anomaly detection or AI-powered analysis
- Community-maintained rule sets

#### Runtime Protection
- **Deep syscall monitoring** — eBPF driver captures kernel-level events
- **Detection only** — cannot block or prevent attacks; only alerts
- **Default rule set** covers: privilege escalation, namespace changes, sensitive file access, shell spawning, unexpected network connections, process spawning
- **Can be deployed as DaemonSet** on Kubernetes nodes
- **No prevention/response** — requires external tools (e.g., Kubernetes admission controllers, network policies) for enforcement

---

### 8. AWS GuardDuty + Inspector

**Company:** Amazon Web Services  
**Category:** AWS-native security services  
**Note:** These are two separate services that complement each other

#### Core Features — GuardDuty

| Feature | Details |
|---------|---------|
| **Threat Detection** | Continuous monitoring for malicious activity across AWS accounts |
| **AI/ML Detection** | Anomaly detection using machine learning and threat intelligence |
| **VPC Flow Log Analysis** | Network traffic analysis for unusual patterns |
| **CloudTrail Analysis** | API call analysis for suspicious account activity |
| **DNS Log Analysis** | DNS query analysis for C2 communication detection |
| **Malware Protection** | Scans EBS volumes, S3 objects, and backups for malware |
| **EKS Protection** | Kubernetes audit log monitoring for EKS clusters |
| **ECS Runtime Monitoring** | Container workload threat detection for ECS |
| **Lambda Protection** | Serverless function monitoring |
| **RDS Protection** | Database access monitoring and brute force detection |
| **S3 Protection** | Data access pattern monitoring and anomaly detection |
| **Extended Threat Detection** | AI/ML-based multi-stage attack sequence identification |

#### Core Features — Inspector

| Feature | Details |
|---------|---------|
| **Vulnerability Scanning** | Automated scanning of EC2, Lambda, ECR images, code repos |
| **Software Composition Analysis** | Open-source dependency vulnerability detection |
| **Network Exposure Analysis** | Identifies unintended network accessibility |
| **SBOM Management** | Software Bill of Materials export and management |
| **CI/CD Integration** | Vulnerability scanning in build pipelines |
| **Risk Scoring** | Contextual risk scores for vulnerability prioritization |
| **Agent + Agentless** | Seamless switching between scanning modes |
| **Multi-source Intelligence** | 50+ vulnerability intelligence sources |

#### Pricing Model

| Service | Pricing | Details |
|---------|---------|---------|
| **GuardDuty** | Pay-per-use | Per 1M events (CloudTrail), per GB (flow/DNS logs) |
| | Free tier | 30-day free trial |
| | Typical cost | $50–$200/month for 500-1000 resources |
| | Per-account minimum | ~$0.10–$0.30/day even for inactive accounts |
| **Inspector** | Pay-per-scan | Per EC2 instance, Lambda function, or container image scanned |
| | Free tier | 30-day free trial |
| **Combined typical** | **$100–$1,000/month** | **For mid-size AWS deployment** |

#### Target Audience
- **Primary:** Any AWS customer (built-in, easy to enable)
- **Secondary:** Organizations wanting baseline cloud security without third-party tools
- Ideal as a complement to third-party CNAPP, not a replacement

#### Key Differentiators
1. **Native AWS integration** — one-click enablement, no deployment needed
2. **Low cost** — dramatically cheaper than any third-party CNAPP
3. **Automatic scaling** — no agents, no capacity planning, no management
4. **AWS threat intelligence** — access to AWS's own threat intelligence feeds
5. **Extended Threat Detection** — AI/ML attack sequence identification (launched re:Invent 2025)
6. **Backup scanning** — unique ability to scan EBS and S3 backups for malware

#### Weaknesses & User Complaints
- **AWS-only** — no multi-cloud support whatsoever
- **Limited depth** — covers detection breadth but not actionable depth
- **No remediation** — findings only; no automated fix or blocking capability
- **Cost unpredictability** — charges based on volume; can spike unexpectedly
- **No container runtime security** — GuardDuty monitors EKS audit logs, not syscalls
- **No CSPM** — no misconfiguration detection (need AWS Config / Security Hub for that)
- **No code security** — no SAST, no IaC scanning beyond Inspector's basic checks
- **Fragmented UX** — GuardDuty, Inspector, Security Hub, Config, Macie are all separate services
- **Regional deployment** — must be enabled per-region; adds cost and complexity

#### Integration Capabilities
- AWS native: Security Hub, EventBridge, CloudWatch, SNS, Lambda, Step Functions, S3
- SIEM: Via Security Hub integration or EventBridge to Splunk, Sumo Logic, etc.
- Ticketing: Via Lambda/EventBridge to Jira, ServiceNow, PagerDuty
- Limited third-party native integrations

#### AI/ML Features
- **GuardDuty ML models** — behavioral anomaly detection for accounts and resources
- **Extended Threat Detection** — AI/ML-based multi-stage attack identification (2025)
- **RDS anomaly detection** — ML-based login pattern analysis
- **Inspector risk scoring** — contextual vulnerability prioritization

#### Runtime Protection
- **GuardDuty EKS Runtime Monitoring** — monitors EKS cluster events via audit logs
- **GuardDuty ECS Runtime Monitoring** — agent-based ECS task monitoring
- **Malware scanning** — scans EBS volumes when suspicious activity detected
- **No syscall-level monitoring** — relies on cloud APIs and audit logs, not kernel events
- **No blocking/prevention** — detection and alerting only
- Can trigger automated response via Lambda/Step Functions but requires custom implementation

---

## Comparison Matrix

### Feature Comparison

| Feature | Wiz | Prisma Cloud | Aqua | Sysdig | FortiCNAPP | Snyk | Falco | AWS GD+Insp |
|---------|-----|-------------|------|--------|------------|------|-------|-------------|
| **CSPM** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ (Config) |
| **CWPP** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ |
| **CIEM** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **DSPM** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ (Macie) |
| **Container Scanning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (Inspector) |
| **Runtime Detection** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| **Runtime Blocking** | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ |
| **Code Security (SAST)** | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ | ❌ |
| **SCA** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **IaC Scanning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| **K8s Security** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ (EKS) |
| **Multi-Cloud** | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | N/A | ❌ |
| **Agentless Scanning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Agent/Sensor** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| **eBPF-based** | ✅ | ❌ | ⚠️ (Tracee) | ✅ | ❌ | ❌ | ✅ | ❌ |
| **AI Copilot/Assistant** | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ❌ | ❌ |
| **Compliance Frameworks** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ |
| **SBOM** | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| **API Security** | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| **Network Segmentation** | ⚠️ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Free Tier** | ❌ | ❌ | ⚠️ (OSS tools) | ❌ | ❌ | ✅ | ✅ | ⚠️ (trial) |
| **AI/ML Workload Security** | ✅ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌ |

**Legend:** ✅ = Full support | ⚠️ = Partial/limited | ❌ = Not available

### Pricing Comparison (Annual, ~100 workloads)

| Platform | Entry Price | Typical Enterprise | Pricing Model |
|----------|------------|-------------------|---------------|
| Wiz | $24,000/yr | $111,500/yr median | Per workload |
| Prisma Cloud | $9,000/yr | $50K–$500K+/yr | Credit-based |
| Aqua Security | ~$10,000/yr | $50K+/yr | Per node/host |
| Sysdig | Custom | $20K–$200K+/yr | Per host/month |
| FortiCNAPP | $22,000/yr | $22K–$150K+/yr | Per workload |
| Snyk | Free–$300/yr | $50K–$500K+/yr | Per developer |
| Falco | Free | Free (support via Sysdig) | Open-source |
| AWS GD+Inspector | ~$600/yr | $1K–$12K/yr | Pay-per-use |

---

## Feature Analysis

### Table Stakes (Features ALL/Most Have)

These are baseline requirements — if you don't have them, you're not in the game:

1. **Vulnerability Scanning** — Container image and host CVE detection
2. **CSPM** — Cloud misconfiguration detection and compliance
3. **Multi-Cloud Support** — AWS, Azure, GCP at minimum
4. **CI/CD Integration** — Shift-left scanning in pipelines
5. **Compliance Frameworks** — CIS, PCI DSS, SOC 2, HIPAA baseline
6. **Container Security** — Image scanning, registry integration
7. **Kubernetes Security** — At least KSPM and cluster visibility
8. **SIEM/Ticketing Integration** — Splunk, Jira, ServiceNow, Slack
9. **Risk Prioritization** — Some form of risk scoring beyond raw CVE severity
10. **Dashboard/Reporting** — Centralized security posture visualization

### Differentiators (Features Only 1-2 Have)

| Feature | Who Has It | Why It Matters |
|---------|-----------|----------------|
| **Security Graph (attack path visualization)** | Wiz, Prisma Cloud | Connects disparate findings into exploitable attack paths |
| **Dynamic Threat Analysis (sandbox)** | Aqua Security | Detonates unknown images in sandbox to detect malware behavior |
| **In-use vulnerability prioritization** | Sysdig | Only flags CVEs in packages actually loaded at runtime — massive noise reduction |
| **Ruleless ML anomaly detection** | FortiCNAPP/Lacework | Detects zero-days without pre-written rules via behavioral ML |
| **Agentic AI security analyst** | Sysdig (Sage) | Multi-step reasoning AI that can investigate across domains |
| **Deep syscall capture/forensics** | Sysdig | Full system call recording for post-incident forensic replay |
| **Developer-first UX** | Snyk | Designed for developers in IDE, not security analysts in dashboards |
| **Runtime blocking/drift prevention** | Aqua Security | Actually blocks unauthorized changes in running containers |
| **Backup malware scanning** | AWS GuardDuty | Scans EBS/S3 backups for malware before restoration |
| **AI/LLM application security** | Aqua, Wiz | Prompt injection detection, model integrity, AI workload protection |
| **Container-level network firewall** | Aqua, Prisma Cloud | Microsegmentation at the container level |
| **Monitoring + Security convergence** | Sysdig | Combined observability and security in one agent/platform |

### Opportunity Gaps (Features NONE Have Well)

These are areas where **no vendor delivers a satisfying solution** — ripe for disruption:

1. **Real-time container forensics without cloud API dependency**
   - All agentless platforms depend on cloud provider APIs; none do deep in-cluster forensics independently
   - Opportunity: DaemonSet-based continuous file system monitoring and process recording

2. **True air-gapped / on-prem-first security**
   - Most CNAPPs are SaaS-first; air-gapped deployment is an afterthought
   - No good solution for classified environments, edge computing, on-prem K8s

3. **Runtime binary analysis and supply chain verification**
   - Scanning finds known CVEs but doesn't verify binary integrity at runtime
   - Opportunity: Continuous runtime binary attestation and SBOM verification

4. **eBPF-powered network behavior baselining**
   - Network policies exist but no vendor does automatic behavioral network baselining
   - Opportunity: Learn normal network patterns per-pod and alert on deviations

5. **Container drift forensics with full state capture**
   - Drift detection exists (Aqua) but no vendor captures the full before/after state
   - Opportunity: Snapshot container filesystem state changes with full diffs

6. **Ephemeral workload security (short-lived containers)**
   - Containers that live <60 seconds are largely invisible to agentless scanning
   - Only agent-based approaches can catch them; no vendor specializes in this

7. **Cost-effective runtime security for startups/SMBs**
   - Cheapest commercial CNAPP is ~$10K+/yr; Falco is free but requires expertise
   - Gap: No "developer-friendly runtime security under $5K/yr"

8. **Cross-cluster security correlation**
   - Each cluster is treated independently; no good cross-cluster attack detection
   - Opportunity: Correlate signals across multiple K8s clusters for lateral movement detection

9. **Automated runtime response/remediation**
   - Most tools detect and alert; few actually auto-remediate (kill pods, isolate, rollback)
   - Even Aqua's blocking is basic; no sophisticated automated response orchestration

10. **Real-time SBOM with runtime verification**
    - SBOMs are generated at build time but never verified against what's actually running
    - Opportunity: Continuous runtime SBOM validation

---

## Common User Complaints Across the Category

Based on Reddit threads, G2 reviews, Gartner Peer Insights, and PeerSpot:

### 1. **Alert Fatigue / Too Much Noise** (Cited for: ALL platforms)
> "Too much noise, not enough actionable details" — Common across Prisma, Wiz, Aqua
- Every platform generates more findings than teams can handle
- Prioritization is improving but still insufficient
- Users want "tell me the 3 things to fix today" not "here are 10,000 vulnerabilities"

### 2. **Pricing Opacity and Cost** (Cited for: Wiz, Prisma, Aqua, Snyk, Sysdig)
> "They are very pricy" — Universal complaint
- Custom pricing means no ability to plan budgets
- Costs escalate rapidly with cloud growth
- Credit-based models (Prisma) are particularly confusing
- Startups and SMBs are effectively priced out

### 3. **Complex Setup and Learning Curve** (Cited for: Prisma, Aqua, Sysdig)
> "Requires expertise to properly integrate and fine-tune security policies"
- Weeks to months for full deployment
- Need dedicated security engineers to manage
- Prisma especially cited for complexity

### 4. **Reporting Weaknesses** (Cited for: Prisma, Lacework, Sysdig)
> "Reporting on Prisma was awful and created more work than the tool solved"
- Reports not executive-friendly
- Difficult to show ROI or improvement over time
- Compliance reports often need manual augmentation

### 5. **Agentless Limitations** (Cited for: Wiz, Prisma agentless mode)
> "Agentless is great for visibility but can't stop attacks"
- Periodic scanning misses real-time threats
- Can't detect process-level activity
- Snapshot-based scanning has delays (hours to detect changes)

### 6. **Agent Operational Overhead** (Cited for: Sysdig, Aqua, Prisma Defender)
> "Administrative drain and required way too much time"
- Agent deployment across large fleets is painful
- Agent updates require coordination
- Resource consumption concerns on production workloads

### 7. **Feature Sprawl / Product Stitching** (Cited for: Prisma Cloud, Snyk)
> "Disjointed product; CLI not talking to the UI"
- Acquired products bolted together with inconsistent UX
- Different modules have different quality levels
- Context doesn't flow between features

### 8. **Vendor Lock-in Concerns** (Cited for: Wiz/Google, Prisma/PANW, AWS)
> "One of our biggest concerns is that Wiz's AWS support won't stay the same under Google"
- Acquisitions change product direction
- Platform tie-in reduces flexibility
- AWS tools only work on AWS

---

## DaemonSet-Based Scanner: Unique Value Proposition

### Why DaemonSet-Based (Agent-in-Cluster) Beats Cloud-API-Based Scanning

| Capability | Cloud-API / Agentless | DaemonSet-Based | Advantage |
|-----------|----------------------|-----------------|-----------|
| **Detection Latency** | Minutes to hours (snapshot-based) | Real-time (sub-second) | 100-1000x faster detection |
| **Runtime Visibility** | Limited (no process/syscall data) | Full (syscall, network, file) | Deep behavioral analysis |
| **Ephemeral Workload Coverage** | Poor (missed if container dies before scan) | Complete (monitoring from start) | No blind spots |
| **Data Sovereignty** | Data sent to vendor SaaS | Data stays in-cluster | Air-gap compatible |
| **Cloud API Dependency** | Total dependency on CSP APIs | Zero dependency | Works anywhere K8s runs |
| **Cost Scaling** | Scales with cloud API calls | Fixed per-node cost | Predictable pricing |
| **Process-Level Forensics** | Not possible | Full syscall recording | Complete audit trail |
| **Network Behavior Analysis** | VPC Flow Logs only (coarse) | Per-container, per-connection | Microsegment-level visibility |
| **Binary Integrity** | Hash comparison at scan time | Continuous runtime verification | Catches tampering |
| **Multi-Cloud Consistency** | Different APIs per cloud | Identical behavior everywhere | True multi-cloud parity |
| **On-Prem / Edge Support** | Not available | Full support | Supports any K8s cluster |

### What a DaemonSet-Based Scanner Could Uniquely Offer

#### 1. **Zero-Trust Runtime Verification**
- Continuously verify that running binaries match their build-time SBOMs
- Detect supply chain compromises post-deployment (e.g., backdoored dependency loaded at runtime)
- No existing vendor does continuous binary attestation at runtime

#### 2. **Ephemeral Workload Full Coverage**
- Capture complete lifecycle of even sub-minute containers (init containers, jobs, batch)
- Process, network, and filesystem activity from container creation to termination
- Agentless tools completely miss workloads that live <5 minutes

#### 3. **In-Cluster Data Sovereignty**
- All scanning, analysis, and storage stays within the cluster boundary
- Perfect for regulated industries, government, defense, financial services
- Compliance advantage: data never leaves your infrastructure

#### 4. **eBPF-Powered Behavioral Baselining**
- Learn per-container, per-pod normal behavior patterns
- Automatically detect deviations without rules (similar to Lacework's ML, but in-cluster)
- Network connection patterns, process trees, file access patterns, syscall profiles

#### 5. **Real-Time Container Drift Forensics**
- When drift is detected, capture complete filesystem diff
- Record the exact process and user that made changes
- Full state capture for incident response — what changed, when, by whom

#### 6. **Cross-Container Lateral Movement Detection**
- Correlate activity across containers within the same node
- Detect container escape attempts at the kernel level
- Monitor inter-container and pod-to-pod communication patterns
- No vendor does effective same-node lateral movement detection

#### 7. **Cost-Effective Runtime Security**
- Fixed cost per node (DaemonSet), not per workload or per scan
- Dramatically cheaper than CNAPP platforms for pure runtime security
- Target price point: $50-100/node/month vs $500-1000/workload/year for CNAPPs

#### 8. **Kubernetes-Native Operations**
- Deployed via Helm chart, managed via CRDs, integrated with K8s RBAC
- Security policies as Kubernetes resources (GitOps-friendly)
- Native integration with admission controllers for enforce-on-deploy

#### 9. **Offline/Air-Gapped Capability**
- Fully operational without internet access
- Vulnerability database synced via offline bundles
- Perfect for edge computing, IoT platforms, classified environments

#### 10. **Developer-Friendly Runtime Insights**
- Feed runtime data back to developers: "This CVE is actually loaded in your production pods"
- Runtime-informed prioritization that goes beyond static scanning
- Integration with developer tools (not just security dashboards)

### Competitive Positioning Matrix

```
                    ┌──────────────────────────────────────────────┐
                    │          CLOUD API / AGENTLESS               │
                    │    (Broad visibility, slow detection)        │
                    │                                              │
                    │  ┌─────┐  ┌──────────┐  ┌───────────────┐  │
                    │  │ Wiz │  │  Prisma   │  │ AWS GD+Insp   │  │
                    │  │     │  │  Cloud    │  │               │  │
                    │  └─────┘  └──────────┘  └───────────────┘  │
                    └──────────────────────────────────────────────┘
                    
    ┌────────────────────────────────────────────────────────────────┐
    │                    HYBRID (BOTH)                                │
    │            (Best coverage, most complexity)                     │
    │                                                                │
    │  ┌──────────┐  ┌─────────┐  ┌──────────────┐                 │
    │  │  Sysdig  │  │  Aqua   │  │  FortiCNAPP  │                 │
    │  │          │  │Security │  │  (Lacework)  │                 │
    │  └──────────┘  └─────────┘  └──────────────┘                 │
    └────────────────────────────────────────────────────────────────┘
    
                    ┌──────────────────────────────────────────────┐
                    │        IN-CLUSTER / AGENT-ONLY              │
                    │  (Deep runtime, limited cloud posture)      │
                    │                                              │
                    │  ┌────────┐          ┌────────────────────┐ │
                    │  │ Falco  │          │ 🎯 YOUR PRODUCT    │ │
                    │  │ (OSS)  │          │ (DaemonSet-based   │ │
                    │  │        │          │  with ML + forensics│ │
                    │  └────────┘          │  + SBOM verify)    │ │
                    │                      └────────────────────┘ │
                    └──────────────────────────────────────────────┘
    
    ┌────────────────────────────────────────────────────────────────┐
    │                DEVELOPER / PRE-DEPLOY                           │
    │              (Shift-left, no runtime)                          │
    │                                                                │
    │  ┌──────────┐                                                  │
    │  │  Snyk    │                                                  │
    │  │          │                                                  │
    │  └──────────┘                                                  │
    └────────────────────────────────────────────────────────────────┘
```

### Recommended Go-to-Market Strategy for DaemonSet Scanner

1. **Start with runtime detection** — be the "Falco Pro" with ML, forensics, and better UX
2. **Add runtime SBOM verification** — unique feature no one has
3. **Target the gaps**: air-gapped, edge, on-prem K8s clusters that CNAPPs can't reach
4. **Price aggressively** — $50-100/node/month; significantly undercut CNAPPs
5. **Complement, don't compete** — position as the runtime depth layer that works alongside Wiz/Prisma for posture
6. **Open-source core** — follow Sysdig/Falco model; open core with commercial management plane
7. **Developer integration** — feed runtime insights back to dev tools (IDE, GitHub, CI/CD)
8. **Focus on Kubernetes-native** — Helm, CRDs, GitOps; don't try to be a VM security tool

---

## Appendix: Research Sources

- Company websites: wiz.io, paloaltonetworks.com, aquasec.com, sysdig.com, fortinet.com, snyk.io, falco.org, aws.amazon.com
- Review platforms: G2.com, Gartner Peer Insights, PeerSpot, TrustRadius, Capterra
- Reddit communities: r/cybersecurity, r/devsecops, r/devops, r/kubernetes, r/aws
- Market analysis: Vendr, UnderDefense, eSecurity Planet, Forrester, Nerdisa
- AWS Marketplace listings for pricing data
- CNCF project documentation (Falco)

---

*Last updated: February 2026*
