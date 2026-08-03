"""
AWS Cost Explorer connector.

Credential options:
  Use the standard boto3 credential chain, preferably a short-lived role,
  AWS_PROFILE, or workload identity. Static access keys are supported by boto3
  but are not recommended.

Required configuration:
  AWS_DEFAULT_REGION      — e.g. us-east-1

Optional:
  AWS_ACCOUNT_ID          — restrict to a specific account (for Organizations)

Minimum IAM action used by this connector: ce:GetCostAndUsage.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any


def _sum_ungrouped_cost(response: Dict[str, Any]) -> float:
    """Sum Cost Explorer totals from an ungrouped GetCostAndUsage response."""
    return sum(
        float(result.get("Total", {}).get("BlendedCost", {}).get("Amount", 0) or 0)
        for result in response.get("ResultsByTime", [])
    )


class AWSConnector:
    def is_configured(self) -> bool:
        has_region = bool(os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION"))
        has_static_pair = bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
        has_role_or_profile = bool(os.getenv("AWS_PROFILE") or os.getenv("AWS_WEB_IDENTITY_TOKEN_FILE"))
        return has_region and (has_static_pair or has_role_or_profile)

    def get_cost_data(self, window_days: int = 30) -> Dict[str, Any]:
        """
        Fetch cost data from AWS Cost Explorer.

        Returns a dict with keys: cloud, total_cost, top_services, trend.
        top_services items: {service_name, total_cost, percentage_of_total}
        """
        if not self.is_configured():
            raise RuntimeError(
                "AWS credentials not configured. Use an AWS profile, workload identity, "
                "or credential pair and set AWS_DEFAULT_REGION."
            )

        try:
            import boto3
        except ImportError:
            raise RuntimeError("boto3 is not installed. Run: pip install boto3")

        client = boto3.client("ce")

        today = datetime.now(timezone.utc).date()
        end = today.isoformat()
        start = (today - timedelta(days=window_days)).isoformat()
        prev_start = (today - timedelta(days=window_days * 2)).isoformat()

        response = client.get_cost_and_usage(
            TimePeriod={"Start": start, "End": end},
            Granularity="MONTHLY",
            Metrics=["BlendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        total_cost = 0.0
        services = []
        for result in response.get("ResultsByTime", []):
            for group in result.get("Groups", []):
                svc = group["Keys"][0]
                amt = float(group["Metrics"]["BlendedCost"]["Amount"])
                total_cost += amt
                services.append({"service_name": svc, "total_cost": amt})

        for s in services:
            s["percentage_of_total"] = round(s["total_cost"] / total_cost * 100, 1) if total_cost else 0
        services.sort(key=lambda x: x["total_cost"], reverse=True)

        prev_response = client.get_cost_and_usage(
            TimePeriod={"Start": prev_start, "End": start},
            Granularity="MONTHLY",
            Metrics=["BlendedCost"],
        )
        prev_total = _sum_ungrouped_cost(prev_response)
        change_pct = ((total_cost - prev_total) / prev_total * 100) if prev_total > 0 else 0.0

        return {
            "cloud": "aws",
            "total_cost": round(total_cost, 2),
            "top_services": services[:10],
            "trend": {
                "direction": "up" if change_pct >= 0 else "down",
                "change_percentage": round(change_pct, 1),
                "change_amount": round(total_cost - prev_total, 2),
            },
        }
