"""
Cloud Cost Guard MCP Server — expose Lumen's FinOps intelligence directly inside
Claude Code, Cursor, and any other MCP-compatible AI coding assistant.

This is the first multi-cloud + SaaS + AI spend + Kubernetes MCP server in the
FinOps space.

Tools exposed:
  get_cloud_summary   — total spend, trends, top services across all clouds
  get_findings        — prioritized cost optimization findings with evidence
  get_cost_by_cloud   — per-cloud breakdown (AWS / Azure / GCP)
  get_saas_spend      — SaaS tool spend, seat utilization, waste
  get_ai_spend        — AI / LLM model-level spend (OpenAI, Anthropic, Bedrock)
  get_k8s_spend       — Kubernetes namespace and node-pool cost visibility
  ask_lumen           — natural language FinOps query answered by Lumen

Usage (stdio):
  python backend/mcp_server.py

See README for Claude Code and Cursor configuration.
"""

import json
import math
import random
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp import types
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False

TZ = timezone.utc

# ── Synthetic data helpers ────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(TZ).isoformat()

def _seed() -> int:
    today = datetime.now(TZ)
    return int(today.strftime("%Y%m%d"))

def _synth_cloud_summary() -> Dict[str, Any]:
    rng = random.Random(_seed())
    clouds = {
        "aws":   {"baseline": 150_000, "services": ["EC2-Instance", "RDS", "EBS", "S3", "ELB", "CloudWatch"]},
        "azure": {"baseline":  85_000, "services": ["Virtual Machines", "Azure SQL", "Blob Storage", "AKS", "Azure Monitor"]},
        "gcp":   {"baseline":  62_000, "services": ["Compute Engine", "Cloud SQL", "Cloud Storage", "GKE", "BigQuery"]},
    }
    result = {}
    grand_total = 0.0
    for cloud, cfg in clouds.items():
        total = round(cfg["baseline"] * rng.uniform(0.92, 1.08), 2)
        grand_total += total
        prev = round(total * rng.uniform(0.90, 1.05), 2)
        pct = round(((total - prev) / prev) * 100, 1) if prev > 0 else 0.0
        service_shares = [rng.uniform(0.1, 0.5) for _ in cfg["services"]]
        total_share = sum(service_shares)
        top_services = [
            {
                "service_name": name,
                "total_cost": round(total * (share / total_share), 2),
                "percentage_of_total": round((share / total_share) * 100, 1),
            }
            for name, share in sorted(
                zip(cfg["services"], service_shares),
                key=lambda x: x[1], reverse=True
            )
        ]
        result[cloud] = {
            "total_cost": total,
            "previous_period_cost": prev,
            "change_percentage": pct,
            "top_services": top_services[:5],
        }
    return {
        "grand_total": round(grand_total, 2),
        "clouds": result,
        "generated_at": _now(),
        "window": "30d",
    }


def _synth_findings() -> List[Dict[str, Any]]:
    rng = random.Random(_seed() + 1)
    return [
        {
            "finding_id": "aws-ri-m5-4xlarge",
            "title": "Reserved Instance opportunity for m5.4xlarge workloads",
            "cloud": "aws", "type": "compute",
            "severity": "medium", "confidence": "high",
            "monthly_savings_usd_est": round(120 + rng.uniform(-20, 30), 2),
            "suggested_action": "Purchase 1-year RI for stable 24/7 workloads — saves ~40%.",
            "risk_level": "Low",
        },
        {
            "finding_id": "aws-ebs-unattached",
            "title": "12 unattached EBS volumes accumulating cost",
            "cloud": "aws", "type": "storage",
            "severity": "high", "confidence": "very_high",
            "monthly_savings_usd_est": round(280 + rng.uniform(-30, 50), 2),
            "suggested_action": "Snapshot and delete unattached EBS volumes.",
            "risk_level": "Low",
        },
        {
            "finding_id": "az-vm-rightsizing",
            "title": "8 over-provisioned Azure VMs eligible for rightsizing",
            "cloud": "azure", "type": "compute",
            "severity": "high", "confidence": "high",
            "monthly_savings_usd_est": round(410 + rng.uniform(-40, 60), 2),
            "suggested_action": "Downsize Standard_D8s_v3 → Standard_D4s_v3.",
            "risk_level": "Low",
        },
        {
            "finding_id": "gcp-sql-ha",
            "title": "Cloud SQL HA enabled on non-production instance",
            "cloud": "gcp", "type": "database",
            "severity": "high", "confidence": "very_high",
            "monthly_savings_usd_est": round(290 + rng.uniform(-30, 40), 2),
            "suggested_action": "Switch dev Cloud SQL to ZONAL availability type.",
            "risk_level": "Low",
        },
        {
            "finding_id": "k8s-overprovisioned",
            "title": "Kubernetes prod cluster running at 34% average utilization",
            "cloud": "kubernetes", "type": "compute",
            "severity": "medium", "confidence": "medium",
            "monthly_savings_usd_est": round(520 + rng.uniform(-50, 80), 2),
            "suggested_action": "Enable cluster autoscaler; reduce min node count from 12 to 6.",
            "risk_level": "Medium",
        },
        {
            "finding_id": "saas-unused-seats",
            "title": "47 unused SaaS licenses across Notion, Figma, and Slack",
            "cloud": "saas", "type": "licensing",
            "severity": "medium", "confidence": "high",
            "monthly_savings_usd_est": round(2350 + rng.uniform(-200, 300), 2),
            "suggested_action": "Downgrade unused seats to free tier or cancel before renewal.",
            "risk_level": "Low",
        },
    ]


def _synth_saas_spend() -> Dict[str, Any]:
    rng = random.Random(_seed() + 2)
    tools = [
        {"tool": "Salesforce",    "cost": 12800, "seats_licensed": 120, "seats_active": 94, "unused": 26},
        {"tool": "Notion",        "cost":  4200, "seats_licensed":  80, "seats_active": 52, "unused": 28},
        {"tool": "Figma",         "cost":  3100, "seats_licensed":  45, "seats_active": 32, "unused": 13},
        {"tool": "Slack",         "cost":  2800, "seats_licensed": 150, "seats_active": 142, "unused": 8},
        {"tool": "GitHub",        "cost":  2400, "seats_licensed":  60, "seats_active": 58, "unused": 2},
        {"tool": "Datadog",       "cost":  6900, "seats_licensed":  30, "seats_active": 29, "unused": 1},
        {"tool": "Jira",          "cost":  1900, "seats_licensed":  80, "seats_active": 78, "unused": 2},
        {"tool": "Zoom",          "cost":  1400, "seats_licensed": 100, "seats_active": 96, "unused": 4},
    ]
    for t in tools:
        t["cost"] = round(t["cost"] * rng.uniform(0.95, 1.05), 2)
    total = round(sum(t["cost"] for t in tools), 2)
    total_unused_licenses = sum(t["unused"] for t in tools)
    estimated_waste = round(sum(
        t["cost"] * (t["unused"] / max(t["seats_licensed"], 1)) for t in tools
    ), 2)
    prev_total = round(total * rng.uniform(0.94, 1.03), 2)
    change_pct = round(((total - prev_total) / prev_total) * 100, 1) if prev_total > 0 else 0.0
    return {
        "total_cost": total,
        "tool_count": len(tools),
        "total_unused_licenses": total_unused_licenses,
        "estimated_waste": estimated_waste,
        "trend": {"change_percentage": change_pct, "change_amount": round(total - prev_total, 2)},
        "tools": tools,
        "generated_at": _now(),
    }


def _synth_ai_spend() -> Dict[str, Any]:
    rng = random.Random(_seed() + 3)
    models = [
        {"model": "claude-sonnet-4-6", "provider": "anthropic", "cost": 4820},
        {"model": "gpt-4o",            "provider": "openai",    "cost": 3960},
        {"model": "claude-opus-4-7",   "provider": "anthropic", "cost": 2140},
        {"model": "gpt-4o-mini",       "provider": "openai",    "cost": 1280},
        {"model": "amazon-nova-pro",   "provider": "bedrock",   "cost":  640},
        {"model": "amazon-nova-lite",  "provider": "bedrock",   "cost":  320},
    ]
    for m in models:
        m["cost"] = round(m["cost"] * rng.uniform(0.92, 1.08), 2)
    total = round(sum(m["cost"] for m in models), 2)
    daily_avg = round(total / 30, 2)
    prev_total = round(total * rng.uniform(0.88, 1.06), 2)
    change_pct = round(((total - prev_total) / prev_total) * 100, 1) if prev_total > 0 else 0.0
    return {
        "total_cost": total,
        "daily_average": daily_avg,
        "trend": {
            "change_percentage": change_pct,
            "change_amount": round(total - prev_total, 2),
        },
        "models": models,
        "providers": ["anthropic", "openai", "bedrock"],
        "generated_at": _now(),
    }


def _synth_k8s_spend() -> Dict[str, Any]:
    rng = random.Random(_seed() + 4)
    namespaces = [
        {"namespace": "production",   "cost": 18400, "cpu_request_pct": 72, "mem_request_pct": 68},
        {"namespace": "staging",      "cost":  5200, "cpu_request_pct": 38, "mem_request_pct": 42},
        {"namespace": "data-pipeline","cost":  8900, "cpu_request_pct": 61, "mem_request_pct": 74},
        {"namespace": "ml-training",  "cost":  6100, "cpu_request_pct": 83, "mem_request_pct": 79},
        {"namespace": "monitoring",   "cost":  2800, "cpu_request_pct": 24, "mem_request_pct": 31},
        {"namespace": "dev",          "cost":  1600, "cpu_request_pct": 12, "mem_request_pct": 18},
    ]
    for ns in namespaces:
        ns["cost"] = round(ns["cost"] * rng.uniform(0.93, 1.07), 2)
    node_pools = [
        {"pool": "general-purpose",  "nodes": 12, "node_type": "n2-standard-8",  "cost": 24800, "utilization_pct": 34},
        {"pool": "compute-optimized","nodes":  4, "node_type": "c2-standard-16", "cost": 12400, "utilization_pct": 71},
        {"pool": "memory-optimized", "nodes":  3, "node_type": "n2-highmem-16",  "cost":  8900, "utilization_pct": 58},
    ]
    for np in node_pools:
        np["cost"] = round(np["cost"] * rng.uniform(0.93, 1.07), 2)
    total_cost = round(sum(ns["cost"] for ns in namespaces), 2)
    total_node_cost = round(sum(np["cost"] for np in node_pools), 2)
    avg_util = round(sum(np["utilization_pct"] * np["cost"] for np in node_pools) / max(total_node_cost, 1), 1)
    overprov_waste = round(total_node_cost * (1 - avg_util / 100) * 0.6, 2)
    wasteful_workloads = [
        ns for ns in namespaces if ns["cpu_request_pct"] < 40 or ns["mem_request_pct"] < 40
    ]
    return {
        "total_cost": total_cost,
        "cluster_count": 2,
        "avg_node_utilization_pct": avg_util,
        "overprovisioning_waste_est": overprov_waste,
        "namespaces": namespaces,
        "node_pools": node_pools,
        "top_wasteful_workloads": wasteful_workloads,
        "generated_at": _now(),
    }


def _lumen_analysis(query: str) -> str:
    """Synthetic Lumen analysis — wire to live LLM in production."""
    q = query.lower()
    if any(w in q for w in ["kubernetes", "k8s", "cluster", "namespace", "pod"]):
        k8s = _synth_k8s_spend()
        return (
            f"Lumen analysis — Kubernetes spend: Your cluster is running at "
            f"{k8s['avg_node_utilization_pct']}% average node utilization. "
            f"Estimated over-provisioning waste: ${k8s['overprovisioning_waste_est']:,.0f}/month. "
            f"Top opportunity: enable cluster autoscaler on the general-purpose pool (34% util, "
            f"12 nodes) and reduce minimum nodes from 12 → 6. "
            f"Namespace 'staging' and 'dev' are running below 40% CPU request ratio — "
            f"consider namespace-level resource quotas and request right-sizing."
        )
    if any(w in q for w in ["saas", "license", "seat", "notion", "figma", "slack"]):
        saas = _synth_saas_spend()
        return (
            f"Lumen analysis — SaaS spend: ${saas['total_cost']:,.0f}/month across "
            f"{saas['tool_count']} tools. Estimated waste from unused licenses: "
            f"${saas['estimated_waste']:,.0f}/month ({saas['total_unused_licenses']} unused seats). "
            f"Top opportunity: Salesforce (26 unused), Notion (28 unused), Figma (13 unused). "
            f"Recommend audit before next renewal cycle."
        )
    if any(w in q for w in ["ai", "llm", "openai", "anthropic", "claude", "gpt", "model"]):
        ai = _synth_ai_spend()
        return (
            f"Lumen analysis — AI spend: ${ai['total_cost']:,.0f}/month across "
            f"{len(ai['models'])} models and {len(ai['providers'])} providers. "
            f"Daily average: ${ai['daily_average']:,.0f}. "
            f"Claude Sonnet 4.6 is your top spend at ${ai['models'][0]['cost']:,.0f}. "
            f"Trend: {ai['trend']['change_percentage']:+.1f}% vs prior period. "
            f"Recommend reviewing token efficiency and caching opportunities."
        )
    if any(w in q for w in ["finding", "saving", "optimization", "waste", "rightsiz"]):
        findings = _synth_findings()
        top = sorted(findings, key=lambda f: f["monthly_savings_usd_est"], reverse=True)[:3]
        total_savings = sum(f["monthly_savings_usd_est"] for f in findings)
        lines = "\n".join(f"  • {f['title']} — ${f['monthly_savings_usd_est']:,.0f}/mo" for f in top)
        return (
            f"Lumen analysis — Top savings opportunities: ${total_savings:,.0f}/month identified "
            f"across {len(findings)} findings.\n\nHighest impact:\n{lines}\n\n"
            f"Recommend starting with low-risk, high-confidence items: "
            f"unattached EBS volumes (immediate, no-risk) and SaaS license cleanup."
        )
    # Default: general cost summary
    summary = _synth_cloud_summary()
    return (
        f"Lumen analysis — Total cloud spend: ${summary['grand_total']:,.0f}/month "
        f"(AWS ${summary['clouds']['aws']['total_cost']:,.0f}, "
        f"Azure ${summary['clouds']['azure']['total_cost']:,.0f}, "
        f"GCP ${summary['clouds']['gcp']['total_cost']:,.0f}). "
        f"For deeper insights, ask about findings, Kubernetes, SaaS, or AI spend specifically."
    )


# ── MCP server definition ─────────────────────────────────────────────────────

def build_server() -> "Server":
    server = Server("cloud-cost-guard")

    @server.list_tools()
    async def list_tools() -> List[types.Tool]:
        return [
            types.Tool(
                name="get_cloud_summary",
                description=(
                    "Return total cloud infrastructure spend and trends across AWS, Azure, and GCP. "
                    "Includes grand total, per-cloud totals, top services, and period change %."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "window": {
                            "type": "string",
                            "enum": ["7d", "30d", "90d"],
                            "description": "Time window for the summary. Defaults to 30d.",
                        }
                    },
                    "required": [],
                },
            ),
            types.Tool(
                name="get_findings",
                description=(
                    "Return prioritized cost optimization findings with evidence and savings estimates. "
                    "Covers cloud infrastructure, SaaS, AI spend, and Kubernetes waste."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "cloud": {
                            "type": "string",
                            "enum": ["aws", "azure", "gcp", "kubernetes", "saas", "all"],
                            "description": "Filter findings by scope. Defaults to all.",
                        },
                        "min_savings": {
                            "type": "number",
                            "description": "Only return findings with monthly savings >= this amount (USD).",
                        },
                    },
                    "required": [],
                },
            ),
            types.Tool(
                name="get_cost_by_cloud",
                description=(
                    "Return per-cloud cost breakdown: total spend, top services, "
                    "and period-over-period change for a specific cloud provider."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "cloud": {
                            "type": "string",
                            "enum": ["aws", "azure", "gcp"],
                            "description": "Cloud provider to fetch data for.",
                        },
                        "window": {
                            "type": "string",
                            "enum": ["7d", "30d", "90d"],
                            "description": "Time window. Defaults to 30d.",
                        },
                    },
                    "required": ["cloud"],
                },
            ),
            types.Tool(
                name="get_saas_spend",
                description=(
                    "Return SaaS tool spend, seat utilization, unused licenses, "
                    "and estimated waste across all tracked SaaS products."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            types.Tool(
                name="get_ai_spend",
                description=(
                    "Return AI and LLM model-level spend across OpenAI, Anthropic, "
                    "and AWS Bedrock — with per-model costs and period trends."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            types.Tool(
                name="get_k8s_spend",
                description=(
                    "Return Kubernetes cost visibility: total cluster spend, namespace "
                    "breakdowns, node pool efficiency, and over-provisioning waste estimate."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            ),
            types.Tool(
                name="ask_lumen",
                description=(
                    "Ask Lumen — Cloud & Capital's FinOps AI — a natural language question "
                    "about your cloud, SaaS, AI, or Kubernetes costs. Returns analysis with "
                    "specific findings and actionable recommendations."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Your FinOps question in plain English.",
                        }
                    },
                    "required": ["query"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: Dict[str, Any]) -> List[types.TextContent]:
        if name == "get_cloud_summary":
            data = _synth_cloud_summary()
            return [types.TextContent(type="text", text=json.dumps(data, indent=2))]

        if name == "get_findings":
            findings = _synth_findings()
            cloud_filter = arguments.get("cloud", "all")
            min_savings = arguments.get("min_savings", 0)
            if cloud_filter and cloud_filter != "all":
                findings = [f for f in findings if f.get("cloud") == cloud_filter]
            if min_savings:
                findings = [f for f in findings if f["monthly_savings_usd_est"] >= min_savings]
            findings.sort(key=lambda f: f["monthly_savings_usd_est"], reverse=True)
            return [types.TextContent(type="text", text=json.dumps(findings, indent=2))]

        if name == "get_cost_by_cloud":
            cloud = arguments.get("cloud", "aws")
            summary = _synth_cloud_summary()
            cloud_data = summary["clouds"].get(cloud, {})
            cloud_data["cloud"] = cloud
            cloud_data["window"] = arguments.get("window", "30d")
            cloud_data["generated_at"] = summary["generated_at"]
            return [types.TextContent(type="text", text=json.dumps(cloud_data, indent=2))]

        if name == "get_saas_spend":
            return [types.TextContent(type="text", text=json.dumps(_synth_saas_spend(), indent=2))]

        if name == "get_ai_spend":
            return [types.TextContent(type="text", text=json.dumps(_synth_ai_spend(), indent=2))]

        if name == "get_k8s_spend":
            return [types.TextContent(type="text", text=json.dumps(_synth_k8s_spend(), indent=2))]

        if name == "ask_lumen":
            query = arguments.get("query", "")
            if not query:
                return [types.TextContent(type="text", text="Please provide a query.")]
            return [types.TextContent(type="text", text=_lumen_analysis(query))]

        return [types.TextContent(type="text", text=f"Unknown tool: {name}")]

    return server


async def _run():
    server = build_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    if not MCP_AVAILABLE:
        print("ERROR: mcp package not installed. Run: pip install mcp")
        raise SystemExit(1)
    import asyncio
    asyncio.run(_run())
