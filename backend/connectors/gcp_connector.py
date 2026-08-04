"""
GCP Cloud Billing connector.

Required env vars:
  GCP_PROJECT_ID              — GCP project ID (e.g. my-project-123)
  GCP_BILLING_TABLE           — Fully qualified BigQuery export table

Authentication uses Application Default Credentials. Prefer workload identity;
GOOGLE_APPLICATION_CREDENTIALS is supported for local development.

To activate:
  1. Enable BigQuery billing export in the GCP Console:
       Billing → Billing export → BigQuery export → Enable
     This creates a dataset like `my_project.gcp_billing_export_v1_XXXXXX`.
  2. Create a service account with Billing Account Viewer + BigQuery Data Viewer:
       gcloud iam service-accounts create cloud-cost-guard \
         --display-name="Cloud Cost Guard"
       gcloud billing accounts add-iam-policy-binding <BILLING_ACCOUNT_ID> \
         --member=serviceAccount:cloud-cost-guard@<PROJECT_ID>.iam.gserviceaccount.com \
         --role=roles/billing.viewer
       gcloud projects add-iam-policy-binding <PROJECT_ID> \
         --member=serviceAccount:cloud-cost-guard@<PROJECT_ID>.iam.gserviceaccount.com \
         --role=roles/bigquery.dataViewer
       gcloud iam service-accounts keys create key.json \
         --iam-account=cloud-cost-guard@<PROJECT_ID>.iam.gserviceaccount.com
  3. Export credentials:
       export GCP_PROJECT_ID=my-project-123
       export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
       export GCP_BILLING_TABLE=my-project.billing.gcp_billing_export_v1_XXXXXX
  4. Install the SDK:
       pip install google-cloud-bigquery google-cloud-billing
  5. Explicitly wire the adapter into a private backend after completing the
     required authentication, normalization, pagination, and security review.

Note: GCP billing data is most granular via BigQuery export. The Cloud Billing
API provides account-level summaries only. This connector uses BigQuery.
"""

import os
import re
from typing import Dict, Any


def _validate_table_name(table_name: str) -> str:
    """Allow only a fully qualified project.dataset.table identifier."""
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", table_name or ""):
        raise ValueError("GCP_BILLING_TABLE must be a fully qualified project.dataset.table identifier")
    return table_name


class GCPConnector:
    REQUIRED_ENV = [
        "GCP_PROJECT_ID",
        "GCP_BILLING_TABLE",
    ]

    def is_configured(self) -> bool:
        return all(os.getenv(k) for k in self.REQUIRED_ENV)

    def get_cost_data(self, window_days: int = 30) -> Dict[str, Any]:
        """
        Fetch cost data from GCP via BigQuery billing export.

        Requires env var GCP_BILLING_TABLE pointing to the BigQuery export table
        (e.g. my_project.gcp_billing_export_v1_ABCDEF_123456_789ABC).

        Returns a dict with keys: cloud, total_cost, top_services, trend.
        top_services items: {service_name, total_cost, percentage_of_total}
        """
        if not self.is_configured():
            raise RuntimeError(
                "GCP credentials not configured. "
                "Set GCP_PROJECT_ID and GCP_BILLING_TABLE, then configure "
                "Application Default Credentials."
            )

        billing_table = os.getenv("GCP_BILLING_TABLE")
        if not billing_table:
            raise RuntimeError(
                "GCP_BILLING_TABLE not set. "
                "Enable BigQuery billing export and set this to your export table, "
                "e.g. my-project.billing.gcp_billing_export_v1_ABCDEF_123456_789ABC"
            )
        billing_table = _validate_table_name(billing_table)

        try:
            from google.cloud import bigquery
        except ImportError:
            raise RuntimeError(
                "GCP SDK not installed. Run: "
                "pip install google-cloud-bigquery google-cloud-billing"
            )

        project_id = os.environ["GCP_PROJECT_ID"]
        client = bigquery.Client(project=project_id)

        query = f"""
            SELECT
              service.description AS service_name,
              SUM(cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)) AS total_cost
            FROM `{billing_table}`
            WHERE
              usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window_days} DAY)
            GROUP BY service_name
            ORDER BY total_cost DESC
        """

        prev_query = f"""
            SELECT SUM(cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)) AS total_cost
            FROM `{billing_table}`
            WHERE
              usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window_days * 2} DAY)
              AND usage_start_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {window_days} DAY)
        """

        results = client.query(query).result()
        prev_results = client.query(prev_query).result()

        services = []
        total_cost = 0.0
        for row in results:
            cost = float(row.total_cost or 0)
            total_cost += cost
            services.append({"service_name": row.service_name, "total_cost": cost})

        for s in services:
            s["percentage_of_total"] = round(s["total_cost"] / total_cost * 100, 1) if total_cost else 0

        prev_total = 0.0
        for row in prev_results:
            prev_total = float(row.total_cost or 0)

        change_pct = ((total_cost - prev_total) / prev_total * 100) if prev_total > 0 else 0.0

        return {
            "cloud": "gcp",
            "total_cost": round(total_cost, 2),
            "top_services": services[:10],
            "trend": {
                "direction": "up" if change_pct >= 0 else "down",
                "change_percentage": round(change_pct, 1),
                "change_amount": round(total_cost - prev_total, 2),
            },
        }
