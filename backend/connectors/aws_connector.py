"""
AWS Cost Explorer connector.

Required env vars:
  AWS_ACCESS_KEY_ID       — IAM access key
  AWS_SECRET_ACCESS_KEY   — IAM secret key
  AWS_DEFAULT_REGION      — e.g. us-east-1

Optional:
  AWS_ACCOUNT_ID          — restrict to a specific account (for Organizations)

To activate:
  1. Create an IAM user or role with the ReadOnlyAccess + CostExplorerFullAccess policies.
  2. Export the credentials:
       export AWS_ACCESS_KEY_ID=AKIA...
       export AWS_SECRET_ACCESS_KEY=...
       export AWS_DEFAULT_REGION=us-east-1
  3. Install the SDK:  pip install boto3
  4. The app will use live data automatically; no code changes needed.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any


class AWSConnector:
    REQUIRED_ENV = [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_DEFAULT_REGION",
    ]

    def is_configured(self) -> bool:
        return all(os.getenv(k) for k in self.REQUIRED_ENV)

    def get_cost_data(self, window_days: int = 30) -> Dict[str, Any]:
        """
        Fetch cost data from AWS Cost Explorer.

        Returns a dict with keys: cloud, total_cost, top_services, trend.
        top_services items: {service_name, total_cost, percentage_of_total}
        """
        if not self.is_configured():
            raise RuntimeError(
                "AWS credentials not configured. "
                "Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION."
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
        prev_total = sum(
            float(group["Metrics"]["BlendedCost"]["Amount"])
            for result in prev_response.get("ResultsByTime", [])
            for group in result.get("Groups", [])
        )
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
