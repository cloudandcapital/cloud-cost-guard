# Cloud Cost Guard

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Multi-cloud](https://img.shields.io/badge/cloud-AWS%20%7C%20Azure%20%7C%20GCP-orange)](https://github.com/cloudandcapital/cloud-cost-guard)
[![Kubernetes](https://img.shields.io/badge/K8s-cost%20visibility-326CE5)](https://github.com/cloudandcapital/cloud-cost-guard)
[![SaaS](https://img.shields.io/badge/SaaS-spend%20tracking-blueviolet)](https://github.com/cloudandcapital/cloud-cost-guard)
[![AI for FinOps](https://img.shields.io/badge/AI-Lumen%20%2B%20MCP-ff6b35)](https://github.com/cloudandcapital/cloud-cost-guard)
[![FOCUS 2026](https://img.shields.io/badge/FOCUS-2026-brightgreen)](https://focus.finops.org)

**The unified FinOps dashboard for Cloud · Kubernetes · AI · SaaS — with Lumen AI and MCP server support.**

[**Live Demo →**](https://guard.cloudandcapital.com) · [**GitHub**](https://github.com/cloudandcapital/cloud-cost-guard)

---

The first open-source dashboard that shows Cloud (AWS/Azure/GCP) + Kubernetes + AI spend + SaaS licenses in a single view — with an AI assistant (Lumen) and an MCP server so it works natively inside Claude Code and Cursor.

**Features:**
- Multi-cloud cost dashboard — AWS, Azure, GCP with per-cloud service breakdowns
- Kubernetes visibility — namespace spend, node pool efficiency, over-provisioning waste
- AI spend tracking — per-model costs across OpenAI, Anthropic, and AWS Bedrock
- SaaS license governance — per-seat costs, unused seats, renewal forecasting
- Lumen AI assistant — natural language FinOps queries via floating chat or MCP tools
- MCP server — expose all Lumen tools directly inside Claude Code, Cursor, and other AI assistants
- Prioritized findings with evidence, CLI remediation commands, confidence levels
- Real connectors for all three clouds + Kubernetes — wire in credentials to switch from demo to live data

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
# Frontend only (no backend required — uses synthetic demo data)
cd frontend
npm install
npm start
```

```bash
# With FastAPI backend
pip install -r backend/requirements.txt
uvicorn app:app --reload --port 8000

# In a second terminal:
cd frontend && npm start
```

The app runs on synthetic demo data by default — no cloud credentials needed.

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

## Live Data Connectors

By default everything runs on synthetic demo data. To switch a scope to live data:

### AWS
```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
pip install boto3
```
IAM required: `ReadOnlyAccess` + `CostExplorerFullAccess`.

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
export GCP_BILLING_ACCOUNT_ID=01AB23-...
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
pip install google-cloud-bigquery
```

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

Connectors live in `backend/connectors/`. Each has `is_configured()` — the app falls back to synthetic data automatically when credentials are absent. Mix and match freely.

---

## Tech

- React (CRA + craco), Recharts, shadcn/ui, lucide-react, Tailwind CSS
- FastAPI synthetic data backend (multi-cloud: AWS / Azure / GCP / Kubernetes)
- MCP server for Claude Code and Cursor integration
- Vercel for hosting

---

## License

MIT © 2025 Diana Molski, Cloud & Capital
