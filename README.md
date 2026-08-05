# Cloud Cost Guard

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Multi-cloud](https://img.shields.io/badge/cloud-AWS%20%7C%20Azure%20%7C%20GCP-orange)](https://github.com/cloudandcapital/cloud-cost-guard)
[![Kubernetes](https://img.shields.io/badge/K8s-cost%20visibility-326CE5)](https://github.com/cloudandcapital/cloud-cost-guard)
[![SaaS](https://img.shields.io/badge/SaaS-spend%20tracking-blueviolet)](https://github.com/cloudandcapital/cloud-cost-guard)
[![AI for FinOps](https://img.shields.io/badge/AI-Lumen%20%2B%20MCP-ff6b35)](https://github.com/cloudandcapital/cloud-cost-guard)
[![Demo data](https://img.shields.io/badge/data-illustrative%20demo-8B6F47)](https://github.com/cloudandcapital/cloud-cost-guard)

**A finance-first decision dashboard for cloud, Kubernetes, AI, and SaaS spend, with Lumen and MCP support.**

[**Live Demo →**](https://guard.cloudandcapital.com) · [**GitHub**](https://github.com/cloudandcapital/cloud-cost-guard)

---

The public application is an illustrative demo. It uses one deterministic sample report so every total, period, chart, and finding can be inspected without connecting a customer billing account.

**Features:**
- Multi-cloud cost dashboard — AWS, Azure, GCP with per-cloud service breakdowns
- Kubernetes visibility with namespace spend, node pool efficiency, and an explicit non-additive cloud allocation treatment
- AI spend visibility by provider and model
- SaaS spend and license utilization visibility
- Lumen analysis grounded in the trusted illustrative report
- MCP tools for local exploration in compatible AI assistants
- Reviewable findings with evidence, confidence, risk, read-only investigation commands, and estimated opportunities
- Reference billing connectors for AWS, Azure, GCP, and Kubernetes development

---

## Part of the Cloud & Capital Pipeline

| Tool | Role |
|------|------|
| **Cloud Cost Guard** | Dashboard — unified view of all spend scopes |
| [FinOps Lite](https://github.com/cloudandcapital/finops-lite) | Cost pull — AWS/Azure/GCP with FOCUS 2026 export |
| [FinOps Watchdog](https://github.com/cloudandcapital/finops-watchdog) | Anomaly detection — baseline-aware spend spikes |
| [Recovery Economics](https://github.com/cloudandcapital/recovery-economics) | Resilience modeling — backup and restore costs |
| [AI Cost Lens](https://github.com/cloudandcapital/ai-cost-lens) | AI spend observability — model-level LLM costs |
| [SaaS Cost Analyzer](https://github.com/cloudandcapital/saas-cost-analyzer) | SaaS governance — unused licenses, per-seat costs |
| [Tech Spend Command Center](https://github.com/cloudandcapital/tech-spend-command-center) | Executive reporting — unified Cloud+AI+SaaS report |

---

## Quickstart

```bash
# Frontend only (no backend required; uses illustrative demo data)
cd frontend
npm ci
npm start
```

```bash
# With FastAPI backend
pip install -r backend/requirements.txt
uvicorn app:app --reload --port 8000

# In a second terminal:
cd frontend && npm start
```

The public app runs on illustrative demo data. No cloud credentials are used or required.

### Local environment configuration

Create local runtime configuration from the sanitized examples when needed:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The example values are safe development defaults or unmistakable placeholders, not credentials. Runtime `.env` files must never be committed. Every `REACT_APP_*` value is public and may be included in browser-delivered JavaScript, so secrets must never use that prefix. Production secrets belong in the deployment provider's protected environment configuration.

---

## MCP Server (Claude Code / Cursor)

Cloud Cost Guard ships an MCP server that exposes Lumen's FinOps tools directly inside your AI coding assistant.

```bash
pip install mcp
python backend/mcp_server.py
```

**Tools available via MCP:**
- `get_cloud_summary` — AWS/Azure/GCP totals and trends
- `get_findings` — prioritized savings findings with evidence
- `get_cost_by_cloud` — per-cloud service breakdown
- `get_saas_spend` — SaaS tool spend and unused license data
- `get_ai_spend` — AI/LLM model-level costs and trends
- `get_k8s_spend` — Kubernetes namespace and node pool data
- `ask_lumen` — natural language FinOps query

**Claude Code setup** (`~/.claude/mcp_servers.json`):
```json
{
  "mcpServers": {
    "cloud-cost-guard": {
      "command": "python",
      "args": ["/absolute/path/to/cloud-cost-guard/backend/mcp_server.py"]
    }
  }
}
```

**Cursor setup** (`.cursor/mcp.json` in project root):
```json
{
  "mcpServers": {
    "lumen": {
      "command": "python",
      "args": ["backend/mcp_server.py"]
    }
  }
}
```

---

## Connector Status

The files in `backend/connectors/` are reference billing adapters for development. They are not connected to the public dashboard and should not be treated as a production deployment path without additional authentication, normalization, pagination, data-quality, and security work.

### AWS
```bash
export AWS_PROFILE=cloud-cost-guard-readonly
export AWS_DEFAULT_REGION=us-east-1
pip install boto3
```
The AWS billing connector currently calls `ce:GetCostAndUsage`. Prefer a short-lived role or workload identity and grant only the actions required by the configured connector.

### Azure
```bash
export AZURE_SUBSCRIPTION_ID=...
export AZURE_TENANT_ID=...
export AZURE_CLIENT_ID=...
export AZURE_CLIENT_SECRET=...
pip install azure-identity azure-mgmt-costmanagement
```

### GCP
```bash
export GCP_PROJECT_ID=my-project
export GCP_BILLING_TABLE=my-project.billing.gcp_billing_export_v1_01AB23_CDEF45_678901
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
pip install google-cloud-bigquery
```
The connector also supports Application Default Credentials without a key file.

### Kubernetes
```bash
# Option A — Prometheus
export K8S_PROMETHEUS_URL=http://prometheus.monitoring.svc:9090
export K8S_CLUSTER_NAME=prod-cluster
pip install requests

# Option B — kubeconfig / in-cluster
export KUBECONFIG=/path/to/kubeconfig
export K8S_CLUSTER_NAME=prod-cluster
pip install kubernetes
```

Never place cloud credentials in the public frontend or commit them to the repository.

---

## Tech

- React (CRA + craco), Recharts, shadcn/ui, lucide-react, Tailwind CSS
- FastAPI reference backend and billing connector prototypes
- MCP server for Claude Code and Cursor integration
- Vercel for hosting

---

## License

MIT © 2026 Diana Molski, Cloud & Capital
