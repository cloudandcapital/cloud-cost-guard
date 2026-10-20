# Cloud Cost Guard

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CCAC](https://img.shields.io/badge/CCAC-1.1-6b8f71)](https://github.com/cloudandcapital/cloud-capital-analysis-contract)
[![Read only](https://img.shields.io/badge/actions-read--only-8B6F47)](https://github.com/cloudandcapital/cloud-cost-guard)
[![AI for FinOps](https://img.shields.io/badge/AI-Lumen-ff6b35)](https://github.com/cloudandcapital/cloud-cost-guard)
[![Local CSV review](https://img.shields.io/badge/data-browser--local%20CSV-6b8f71)](docs/billing-upload.md)

**Understand your cloud bill with a browser-local CSV review: totals, services, credits, and an optional earlier-period comparison. An optional illustrative dashboard preserves the validated Cloud, direct-AI, and SaaS example.**

[**Cloud Cost Guard →**](https://guard.cloudandcapital.com) · [**Architecture & trust →**](docs/architecture-and-trust.md) · [**GitHub**](https://github.com/cloudandcapital/cloud-cost-guard)

---

**Review your own billing CSV without cloud credentials.** Files and uploaded-report Lumen questions stay in browser memory. [Supported formats, export instructions, accounting rules, privacy and release coordination →](docs/billing-upload.md)

The main flow supports FOCUS BilledCost CSVs and a simple Date/Service/Cost/Currency template, with downloads built from the same uploaded records. “Try an example” opens the preserved deterministic CCAC report. Its Refresh button only reloads that example; it does not synchronize a cloud account.

**CSV review:**
- Exact decimal totals, signed credits, service breakdowns, charge-date charts, and period comparisons
- Downloadable template and invented fixtures, with AWS/Azure FOCUS export instructions
- Deliberate currency, interval, coverage, duplicate, invalid-row, and replacement handling
- Local HTML/JSON/CSV downloads and a deterministic local Lumen guide; no file upload or AI transfer

**Optional CCAC example:**
- Exact, reconciled Technology Spend across canonical Cloud, direct-AI, and SaaS scopes
- AWS service and daily Cloud evidence; Azure, GCP, and Kubernetes remain explicitly unavailable in the validated report
- Direct-AI detail plus a separately labeled, non-additive broader-AI analysis
- Same-period SaaS scope with annual and quarterly invoice evidence kept separate
- Reviewable diagnostic findings with producer, quality, evidence, and methodology traceability
- Deterministic HTML and JSON canonical exports generated locally in the browser
- Lumen presets and free-form explanations grounded in the same validated CCAC 1.1 presentation model
- Explicit unsupported registries, read-only triage, and human-review requirements

---

## Part of the Cloud & Capital Pipeline

| Tool | Role |
|------|------|
| **Cloud Cost Guard** | Read-only presentation, canonical exports, and Lumen explanations |
| [FinOps Lite](https://github.com/cloudandcapital/finops-lite) | Cost pull — AWS/Azure/GCP with FOCUS 2026 export |
| [FinOps Watchdog](https://github.com/cloudandcapital/finops-watchdog) | Anomaly detection — baseline-aware spend spikes |
| [Recovery Economics](https://github.com/cloudandcapital/recovery-economics) | Resilience modeling — backup and restore costs |
| [AI Cost Lens](https://github.com/cloudandcapital/ai-cost-lens) | AI spend observability — model-level LLM costs |
| [SaaS Cost Analyzer](https://github.com/cloudandcapital/saas-cost-analyzer) | SaaS governance — unused licenses, per-seat costs |
| [Tech Spend Command Center](https://github.com/cloudandcapital/tech-spend-command-center) | Executive reporting — unified Cloud+AI+SaaS report |

---

## Quickstart

```bash
# Canonical dashboard (no local backend required)
cd frontend
npm ci
npm start
```

The application starts with the browser-local billing upload flow. No cloud credentials or backend are required. Uploaded-report Lumen uses local prepared answers. “Try an example” loads the tracked, validated CCAC 1.1 illustrative report; its free-form Lumen additionally requires the deployed serverless API.

### Local environment configuration

Create local runtime configuration from the sanitized examples when needed:

```bash
cp frontend/.env.example frontend/.env
```

The example values are safe development defaults or unmistakable placeholders, not credentials. Runtime `.env` files must never be committed. Every `REACT_APP_*` value is public and may be included in browser-delivered JavaScript, so secrets must never use that prefix. Production secrets belong in the deployment provider's protected environment configuration.

---

## Reference MCP Server (Separate Demo Path)

Cloud Cost Guard includes a reference MCP server for local exploration in compatible AI assistants. It is not the grounding path used by the public dashboard or its production Lumen API, and its synthetic helper dataset must not be mixed with the validated CCAC 1.1 presentation model.

```bash
pip install mcp
python backend/mcp_server.py
```

**Tools available via MCP:**
- `get_cloud_summary` — illustrative AWS/Azure/GCP totals and trends
- `get_findings` — illustrative findings with evidence and estimated opportunities
- `get_cost_by_cloud` — illustrative per-cloud service breakdown
- `get_saas_spend` — illustrative SaaS tool spend and unused license data
- `get_ai_spend` — illustrative AI/LLM model-level costs and trends
- `get_k8s_spend` — illustrative Kubernetes namespace and node pool data
- `ask_lumen` — natural-language analysis grounded only in the synthetic demo dataset

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
- Serverless Lumen API with fail-closed canonical claim selection
- Reference billing connector prototypes, separate from the public runtime
- MCP server for Claude Code and Cursor integration
- Vercel for hosting

---

## License

MIT © 2026 Diana Molski, Cloud & Capital
