from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
import math
import random

app = FastAPI(title="Cloud Cost Guard API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TZ = timezone.utc

# ── Cloud service definitions ──────────────────────────────────────────────────

CLOUD_SERVICES: Dict[str, List] = {
    "aws": [
        ("EC2-Instance", 0.465),
        ("RDS",          0.242),
        ("EBS",          0.095),
        ("ELB",          0.058),
        ("S3",           0.046),
        ("CloudWatch",   0.039),
    ],
    "azure": [
        ("Virtual Machines", 0.440),
        ("Azure SQL",        0.210),
        ("Blob Storage",     0.135),
        ("AKS",              0.105),
        ("Azure Monitor",    0.065),
        ("Azure CDN",        0.045),
    ],
    "gcp": [
        ("Compute Engine",   0.420),
        ("Cloud SQL",        0.205),
        ("Cloud Storage",    0.145),
        ("GKE",              0.120),
        ("BigQuery",         0.075),
        ("Cloud Monitoring", 0.035),
    ],
}

# Monthly spend baselines per cloud (USD)
CLOUD_BASELINES: Dict[str, float] = {
    "aws":   150_000.0,
    "azure":  85_000.0,
    "gcp":    62_000.0,
}

# Seed offsets so each cloud gets independent-looking patterns
CLOUD_SEED_OFFSET: Dict[str, int] = {
    "aws":   0,
    "azure": 1_000,
    "gcp":   2_000,
}

VALID_CLOUD = {"aws", "azure", "gcp"}

PALETTE = ["#8B6F47", "#B5905C", "#D8C3A5", "#A8A7A7", "#E98074", "#C0B283", "#F4E1D2", "#E6B89C"]

# ── Helpers ────────────────────────────────────────────────────────────────────

def mmdd(d: datetime) -> str:
    return d.strftime("%m/%d")

def seed_for_month(dt: datetime) -> int:
    return int(dt.strftime("%Y%m"))

def window_days(label: str) -> int:
    return 7 if label == "7d" else (30 if label == "30d" else 90)

def now_iso() -> str:
    return datetime.now(TZ).isoformat()

def synthesize_series(days: int, month_seed: int, base_month_total: float) -> List[Dict[str, Any]]:
    rng = random.Random(month_seed + days)
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)

    target_total = base_month_total * (days / 30.0)
    avg = target_total / days

    raw_series = []
    drift = rng.uniform(-0.004, 0.006)
    for i in range(days):
        d = start + timedelta(days=i)
        dow = d.weekday()
        weekly = 1.0
        if dow >= 5:
            weekly *= 0.82
        elif dow in (2, 3):
            weekly *= 1.05
        wobble = 1.0 + 0.03 * math.sin(i / 2.7)
        noise = rng.uniform(-0.04, 0.04)
        spike = 1.0
        if rng.random() < (1.0 / 12.0):
            spike = rng.uniform(1.10, 1.22)
        factor = (1.0 + drift) ** i
        value = avg * weekly * wobble * factor * (1.0 + noise) * spike
        raw_series.append({"date": d, "cost": max(0, value)})

    s = sum(pt["cost"] for pt in raw_series) or 1.0
    norm = target_total / s
    series = []
    for pt in raw_series:
        v = round(pt["cost"] * norm, 2)
        series.append({
            "formatted_date": mmdd(pt["date"]),
            "date_iso": pt["date"].date().isoformat(),
            "cost": v,
        })
    return series


def split_by_service(total_amount: float, month_seed: int, cloud: str = "aws") -> List[Dict[str, Any]]:
    services = CLOUD_SERVICES.get(cloud, CLOUD_SERVICES["aws"])
    rng = random.Random(month_seed + 999)
    parts = []
    for name, share in services:
        jitter = rng.uniform(-0.03, 0.03)
        parts.append((name, max(0.01, share * (1.0 + jitter))))
    total_share = sum(s for _, s in parts)
    parts = [(n, s / total_share) for (n, s) in parts]

    used = 0.0
    out = []
    for i, (name, share) in enumerate(parts):
        amt = round(total_amount * share, 2)
        out.append({
            "name": name,
            "value": amt,
            "percentage": round(share * 100.0, 1),
            "fill": PALETTE[i % len(PALETTE)],
        })
        used += amt
    residue = round(total_amount - used, 2)
    if out:
        out[0]["value"] = round(out[0]["value"] + residue, 2)
    return out


def calc_movers(now_services: List[Dict[str, Any]], prev_services: List[Dict[str, Any]]):
    prev_map = {s["name"]: s["value"] for s in prev_services}
    now_map = {s["name"]: s["value"] for s in now_services}
    names = set(prev_map) | set(now_map)
    movers = []
    for n in names:
        prev = float(prev_map.get(n, 0.0))
        curr = float(now_map.get(n, 0.0))
        delta = round(curr - prev, 2)
        pct = round(((delta / prev) * 100.0) if prev > 0 else (100.0 if curr > 0 else 0.0), 1)
        movers.append({
            "service": n,
            "previous_cost": round(prev, 2),
            "current_cost": round(curr, 2),
            "change_amount": delta,
            "change_percent": pct,
        })
    movers.sort(key=lambda m: abs(m["change_amount"]), reverse=True)
    return movers

# ── Per-cloud findings ─────────────────────────────────────────────────────────

def make_aws_findings(rng: random.Random) -> List[Dict[str, Any]]:
    return [
        {
            "finding_id": "aws-ri-m5-4xlarge",
            "title": "Reserved Instance opportunity for m5.4xlarge workloads",
            "type": "compute",
            "cloud": "aws",
            "severity": "medium",
            "confidence": "high",
            "monthly_savings_usd_est": round(120 + rng.uniform(-20, 30), 2),
            "risk_level": "Low",
            "implementation_time": "4-6 hours",
            "last_analyzed": now_iso(),
            "methodology": "30-day usage pattern vs 1-year RI pricing",
            "evidence": {
                "resource_id": "i-0x9y8z7a6b5c4dabc",
                "instance_type": "m5.4xlarge",
                "region": "us-east-1",
            },
            "commands": [
                "aws ec2 describe-reserved-instances-offerings --instance-type m5.4xlarge --region us-east-1",
                "aws ce get-reservation-purchase-recommendation --service EC2 --lookback-period-in-days SIXTY_DAYS",
            ],
            "suggested_action": "Purchase 1-year Reserved Instance for stable 24/7 workloads to reduce compute cost by up to 40%.",
        },
        {
            "finding_id": "aws-ebs-unattached",
            "title": "12 unattached EBS volumes accumulating cost",
            "type": "storage",
            "cloud": "aws",
            "severity": "high",
            "confidence": "very_high",
            "monthly_savings_usd_est": round(280 + rng.uniform(-30, 50), 2),
            "risk_level": "Low",
            "implementation_time": "2-3 hours",
            "last_analyzed": now_iso(),
            "methodology": "Volumes in 'available' state with no attachment for 30+ days",
            "evidence": {
                "resource_id": "vol-0abc123def456 (+11 more)",
                "region": "us-east-1, us-west-2",
            },
            "commands": [
                "aws ec2 describe-volumes --filters Name=status,Values=available --query 'Volumes[*].{ID:VolumeId,Size:Size,Type:VolumeType}' --output table",
            ],
            "suggested_action": "Snapshot and delete unattached EBS volumes; tag for manual review if origin is uncertain.",
        },
        {
            "finding_id": "aws-elb-idle",
            "title": "3 load balancers with zero active connections for 14+ days",
            "type": "networking",
            "cloud": "aws",
            "severity": "medium",
            "confidence": "high",
            "monthly_savings_usd_est": round(60 + rng.uniform(-10, 20), 2),
            "risk_level": "Medium",
            "implementation_time": "1-2 hours",
            "last_analyzed": now_iso(),
            "methodology": "CloudWatch RequestCount = 0 for 14 consecutive days",
            "evidence": {
                "resource_id": "arn:aws:elasticloadbalancing:us-east-1:...",
                "region": "us-east-1",
            },
            "commands": [
                "aws elbv2 describe-load-balancers --query 'LoadBalancers[*].{ARN:LoadBalancerArn,State:State.Code}'",
                "aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name RequestCount --period 86400 --statistics Sum",
            ],
            "suggested_action": "Verify no active traffic, then delete idle load balancers to eliminate their fixed monthly charge.",
        },
    ]


def make_azure_findings(rng: random.Random) -> List[Dict[str, Any]]:
    return [
        {
            "finding_id": "az-vm-rightsizing",
            "title": "8 over-provisioned VMs eligible for rightsizing",
            "type": "compute",
            "cloud": "azure",
            "severity": "high",
            "confidence": "high",
            "monthly_savings_usd_est": round(410 + rng.uniform(-40, 60), 2),
            "risk_level": "Low",
            "implementation_time": "4-6 hours",
            "last_analyzed": now_iso(),
            "methodology": "Azure Advisor CPU utilization — avg < 15% over 30 days",
            "evidence": {
                "resource_id": "/subscriptions/.../virtualMachines/vm-prod-01 (+7 more)",
                "instance_type": "Standard_D8s_v3",
                "region": "eastus",
            },
            "commands": [
                "az vm list --output table --query '[].{Name:name,Size:hardwareProfile.vmSize,Location:location}'",
                "az monitor metrics list --resource <vm-resource-id> --metric 'Percentage CPU' --interval PT1H",
            ],
            "suggested_action": "Downsize over-provisioned VMs from Standard_D8s_v3 to Standard_D4s_v3 to halve compute spend.",
        },
        {
            "finding_id": "az-sql-dtu",
            "title": "Azure SQL database running at <20% DTU utilization",
            "type": "database",
            "cloud": "azure",
            "severity": "medium",
            "confidence": "high",
            "monthly_savings_usd_est": round(215 + rng.uniform(-20, 35), 2),
            "risk_level": "Low",
            "implementation_time": "2-4 hours",
            "last_analyzed": now_iso(),
            "methodology": "Azure Monitor DTU consumption: avg 18.4% over 30-day window",
            "evidence": {
                "resource_id": "/subscriptions/.../servers/sql-prod/databases/appdb",
                "instance_type": "S4 (200 DTU)",
                "region": "eastus",
            },
            "commands": [
                "az sql db show-usage --resource-group <rg> --server <server-name> --name <db-name>",
                "az sql db update --resource-group <rg> --server <server-name> --name <db-name> --service-objective S2",
            ],
            "suggested_action": "Downgrade Azure SQL from S4 to S2 based on observed DTU utilization below 20%.",
        },
        {
            "finding_id": "az-blob-lifecycle",
            "title": "Blob Storage missing lifecycle tiering — data staying in Hot tier",
            "type": "storage",
            "cloud": "azure",
            "severity": "low",
            "confidence": "medium",
            "monthly_savings_usd_est": round(95 + rng.uniform(-10, 20), 2),
            "risk_level": "Low",
            "implementation_time": "1-2 hours",
            "last_analyzed": now_iso(),
            "methodology": "No lifecycle management policy found; 60%+ of blobs unaccessed for 30+ days",
            "evidence": {
                "resource_id": "/subscriptions/.../storageAccounts/prodstorageacc",
                "region": "eastus",
            },
            "commands": [
                "az storage account management-policy show --account-name <account> --resource-group <rg>",
                "az storage account management-policy create --account-name <account> --resource-group <rg> --policy @lifecycle-policy.json",
            ],
            "suggested_action": "Add lifecycle policy: Cool tier after 30 days, Archive after 90 days of no access.",
        },
    ]


def make_gcp_findings(rng: random.Random) -> List[Dict[str, Any]]:
    return [
        {
            "finding_id": "gcp-cud-compute",
            "title": "Committed Use Discount available for n2-standard-8 instances",
            "type": "compute",
            "cloud": "gcp",
            "severity": "medium",
            "confidence": "high",
            "monthly_savings_usd_est": round(185 + rng.uniform(-20, 30), 2),
            "risk_level": "Low",
            "implementation_time": "1-2 hours",
            "last_analyzed": now_iso(),
            "methodology": "Steady-state Compute Engine usage vs on-demand price vs 1-year CUD",
            "evidence": {
                "resource_id": "projects/my-project/zones/us-central1-a/instances/api-server-01",
                "instance_type": "n2-standard-8",
                "region": "us-central1",
            },
            "commands": [
                "gcloud compute instances list --filter='status:RUNNING' --format='table(name,machineType.basename(),zone)'",
                "gcloud compute commitments list --format='table(name,plan,status,endTimestamp)'",
            ],
            "suggested_action": "Purchase 1-year Committed Use Discount for stable n2-standard-8 instances — saves ~37%.",
        },
        {
            "finding_id": "gcp-sql-ha",
            "title": "Cloud SQL HA enabled on non-production instance",
            "type": "database",
            "cloud": "gcp",
            "severity": "high",
            "confidence": "very_high",
            "monthly_savings_usd_est": round(290 + rng.uniform(-30, 40), 2),
            "risk_level": "Low",
            "implementation_time": "2-3 hours",
            "last_analyzed": now_iso(),
            "methodology": "Cloud SQL inspection: HA enabled on instance tagged env=development",
            "evidence": {
                "resource_id": "projects/my-project/instances/dev-postgres-01",
                "instance_type": "db-n1-standard-4",
                "region": "us-central1",
            },
            "commands": [
                "gcloud sql instances list --format='table(name,settings.availabilityType,settings.tier,region)'",
                "gcloud sql instances patch dev-postgres-01 --availability-type=ZONAL --project=my-project",
            ],
            "suggested_action": "Disable HA on non-production Cloud SQL instances — switch to ZONAL availability type.",
        },
        {
            "finding_id": "gcp-gke-nodepool",
            "title": "GKE node pool at 34% average utilization",
            "type": "compute",
            "cloud": "gcp",
            "severity": "medium",
            "confidence": "medium",
            "monthly_savings_usd_est": round(145 + rng.uniform(-15, 25), 2),
            "risk_level": "Medium",
            "implementation_time": "4-8 hours",
            "last_analyzed": now_iso(),
            "methodology": "CPU/memory request vs allocatable capacity over 30 days via Cloud Monitoring",
            "evidence": {
                "resource_id": "projects/my-project/locations/us-central1/clusters/prod-cluster",
                "instance_type": "e2-standard-4 (6 nodes)",
                "region": "us-central1",
            },
            "commands": [
                "gcloud container clusters list --format='table(name,location,currentNodeCount,status)'",
                "gcloud container node-pools list --cluster=prod-cluster --zone=us-central1-a",
            ],
            "suggested_action": "Enable cluster autoscaler and reduce minimum node count from 6 to 3 for this node pool.",
        },
    ]


def make_findings(cloud: str, rng: random.Random) -> List[Dict[str, Any]]:
    if cloud == "azure":
        return make_azure_findings(rng)
    if cloud == "gcp":
        return make_gcp_findings(rng)
    return make_aws_findings(rng)

# ── Core data model ────────────────────────────────────────────────────────────

def model_for_window(window_label: str, cloud: str = "aws") -> Dict[str, Any]:
    days = window_days(window_label)
    today = datetime.now(TZ)
    month_seed = seed_for_month(today) + CLOUD_SEED_OFFSET.get(cloud, 0)

    rng = random.Random(month_seed)
    base = CLOUD_BASELINES.get(cloud, 150_000.0)
    month_baseline = base * rng.uniform(0.9, 1.1)

    series = synthesize_series(days, month_seed, month_baseline)
    window_total = round(sum(pt["cost"] for pt in series), 2)

    current_services = split_by_service(window_total, month_seed, cloud)
    prev_services = split_by_service(window_total * rng.uniform(0.92, 1.08), month_seed - 1, cloud)
    movers = calc_movers(current_services, prev_services)

    prev_total = round(sum(s["value"] for s in prev_services), 2)
    wow = ((window_total - prev_total) / prev_total) * 100.0 if prev_total > 0 else 0.0

    savings_ready = round(window_total * rng.uniform(0.08, 0.14), 2)
    underutilized = int(20 + rng.random() * 40)
    orphans = int(8 + rng.random() * 18)

    highest_pt = max(series, key=lambda p: p["cost"]) if series else {"date_iso": None, "cost": 0}
    highest_date_str = "-"
    if highest_pt.get("date_iso"):
        d = datetime.fromisoformat(highest_pt["date_iso"])
        highest_date_str = d.strftime("%b %d, %Y")

    monthly_budget = base * 1.2
    last_7 = series[-7:] if len(series) >= 7 else series
    last_7_avg = (sum(pt["cost"] for pt in last_7) / max(1, len(last_7))) if last_7 else 0.0
    projected_month_end = round(last_7_avg * 30.0, 2)

    total_curr = max(1.0, sum(s["value"] for s in current_services))
    prev_lookup = {s["name"]: s["value"] for s in prev_services}
    top_products = []
    for s in current_services:
        name = s["name"]
        curr_val = s["value"]
        prev_val = prev_lookup.get(name, 0.0)
        wow_delta = round(curr_val - prev_val, 2)
        pct_total = round((curr_val / total_curr) * 100.0, 1)
        top_products.append({
            "product": name,
            "amount_usd": curr_val,
            "wow_delta": wow_delta,
            "percent_of_total": pct_total,
        })
    top_products.sort(key=lambda x: x["amount_usd"], reverse=True)

    findings = make_findings(cloud, rng)

    return {
        "cloud": cloud,
        "window": window_label,
        "series": series,
        "services_now": current_services,
        "services_prev": prev_services,
        "movers": movers,
        "findings": findings,
        "kpis": {
            "total_30d_cost": round(window_total, 2),
            "wow_percent": round(wow, 1),
            "mom_percent": round(wow * 0.6, 1),
            "savings_ready_usd": savings_ready,
            "underutilized_count": underutilized,
            "orphans_count": orphans,
            "data_freshness_hours": 0,
            "last_updated": now_iso(),
        },
        "top_products": top_products,
        "key_insights": {
            "highest_single_day": {
                "date": highest_date_str,
                "amount": round(highest_pt["cost"], 2),
            },
            "projected_month_end": projected_month_end,
            "mtd_actual": round(sum(pt["cost"] for pt in series[-min(len(series), datetime.now(TZ).day):]), 2),
            "monthly_budget": monthly_budget,
            "budget_variance": round(projected_month_end - monthly_budget, 2),
        },
        "generated_at": now_iso(),
    }

# ── API Routes ─────────────────────────────────────────────────────────────────

@app.get("/api/summary")
def get_summary(
    window: str = Query("30d", pattern="^(7d|30d|90d)$"),
    cloud: str = Query("aws"),
):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    return {
        "kpis": m["kpis"],
        "top_products": m["top_products"],
        "recent_findings": m["findings"][:3],
        "window": window,
        "cloud": c,
        "generated_at": m["generated_at"],
    }


@app.get("/api/cost-trend")
def get_cost_trend(
    days: int = Query(30, ge=7, le=90),
    cloud: str = Query("aws"),
):
    window = "7d" if days == 7 else ("30d" if days == 30 else "90d")
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    return m["series"]


@app.get("/api/service-breakdown")
def get_service_breakdown(
    window: str = Query("30d", pattern="^(7d|30d|90d)$"),
    cloud: str = Query("aws"),
):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    total = round(sum(s["value"] for s in m["services_now"]), 2)
    return {"data": m["services_now"], "total": total, "cloud": c}


@app.get("/api/top-movers")
def get_top_movers(
    days: int = Query(7, ge=7, le=90),
    cloud: str = Query("aws"),
):
    window = "7d" if days == 7 else ("30d" if days == 30 else "90d")
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    return m["movers"][:10]


@app.get("/api/movers")
def get_movers(
    window: str = Query("7d", pattern="^(7d|30d|90d)$"),
    cloud: str = Query("aws"),
):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    return m["movers"][:10]


@app.get("/api/findings")
def get_findings(
    sort: str = "savings",
    limit: int = 50,
    cloud: Optional[str] = Query(None),
):
    if cloud and cloud in VALID_CLOUD:
        m = model_for_window("30d", cloud)
        items = m["findings"]
    else:
        items = []
        for c in ("aws", "azure", "gcp"):
            m = model_for_window("30d", c)
            items.extend(m["findings"])

    if sort == "savings":
        items = sorted(items, key=lambda x: x["monthly_savings_usd_est"], reverse=True)
    return items[:limit]


@app.get("/api/key-insights")
def get_key_insights(
    window: str = Query("30d", pattern="^(7d|30d|90d)$"),
    cloud: str = Query("aws"),
):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    return m["key_insights"]


@app.get("/api/clouds")
def get_clouds_summary(window: str = Query("30d", pattern="^(7d|30d|90d)$")):
    """Per-cloud summary for all three providers."""
    result = {}
    for c in ("aws", "azure", "gcp"):
        m = model_for_window(window, c)
        result[c] = {
            "cloud": c,
            "window": window,
            "kpis": m["kpis"],
            "top_services": [
                {
                    "service_name": s["name"],
                    "total_cost": s["value"],
                    "percentage_of_total": s["percentage"],
                }
                for s in m["services_now"]
            ],
            "findings": m["findings"],
            "generated_at": m["generated_at"],
        }
    return result


@app.get("/api/clouds/{cloud}/service-breakdown")
def get_cloud_service_breakdown(
    cloud: str,
    window: str = Query("30d", pattern="^(7d|30d|90d)$"),
):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window(window, c)
    total = round(sum(s["value"] for s in m["services_now"]), 2)
    return {"cloud": c, "data": m["services_now"], "total": total}


@app.get("/api/clouds/{cloud}/findings")
def get_cloud_findings(cloud: str, limit: int = 10):
    c = cloud if cloud in VALID_CLOUD else "aws"
    m = model_for_window("30d", c)
    return m["findings"][:limit]


# ── Kubernetes synthetic data ──────────────────────────────────────────────────

K8S_NAMESPACES = [
    ("production",    18_400, 72, 68),
    ("data-pipeline",  8_900, 61, 74),
    ("ml-training",    6_100, 83, 79),
    ("staging",        5_200, 38, 42),
    ("monitoring",     2_800, 24, 31),
    ("dev",            1_600, 12, 18),
]

K8S_NODE_POOLS = [
    ("general-purpose",   12, "n2-standard-8",  24_800, 34),
    ("compute-optimized",  4, "c2-standard-16", 12_400, 71),
    ("memory-optimized",   3, "n2-highmem-16",   8_900, 58),
]


def k8s_model() -> Dict[str, Any]:
    rng = random.Random(seed_for_month(datetime.now(TZ)) + 4_000)

    namespaces = []
    for name, base_cost, cpu_pct, mem_pct in K8S_NAMESPACES:
        cost = round(base_cost * rng.uniform(0.93, 1.07), 2)
        namespaces.append({
            "namespace": name,
            "cost": cost,
            "cpu_request_pct": cpu_pct + round(rng.uniform(-3, 3), 1),
            "mem_request_pct": mem_pct + round(rng.uniform(-3, 3), 1),
        })

    node_pools = []
    for pool, nodes, node_type, base_cost, util_pct in K8S_NODE_POOLS:
        cost = round(base_cost * rng.uniform(0.93, 1.07), 2)
        node_pools.append({
            "pool": pool,
            "nodes": nodes,
            "node_type": node_type,
            "cost": cost,
            "utilization_pct": util_pct + round(rng.uniform(-4, 4), 1),
        })

    total_cost = round(sum(n["cost"] for n in namespaces), 2)
    total_node_cost = sum(p["cost"] for p in node_pools) or 1.0
    avg_util = round(
        sum(p["utilization_pct"] * p["cost"] for p in node_pools) / total_node_cost,
        1,
    )
    overprov_waste = round(total_node_cost * (1 - avg_util / 100) * 0.6, 2)
    wasteful = sorted(
        [n for n in namespaces if n["cpu_request_pct"] < 45 or n["mem_request_pct"] < 45],
        key=lambda n: n["cost"],
        reverse=True,
    )
    prev_total = round(total_cost * rng.uniform(0.90, 1.06), 2)
    change_pct = round(((total_cost - prev_total) / prev_total) * 100, 1) if prev_total else 0.0

    return {
        "total_cost": total_cost,
        "cluster_count": 2,
        "avg_node_utilization_pct": avg_util,
        "overprovisioning_waste_est": overprov_waste,
        "namespaces": namespaces,
        "node_pools": node_pools,
        "top_wasteful_workloads": wasteful,
        "trend": {
            "change_percentage": change_pct,
            "change_amount": round(total_cost - prev_total, 2),
        },
        "generated_at": now_iso(),
    }


@app.get("/api/k8s")
def get_k8s(window: str = Query("30d", pattern="^(7d|30d|90d)$")):
    """Kubernetes cost visibility: namespaces, node pools, utilization, waste."""
    return k8s_model()


@app.get("/")
def health():
    return {"status": "ok", "time": now_iso(), "clouds": sorted(VALID_CLOUD)}
