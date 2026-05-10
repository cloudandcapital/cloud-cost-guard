"""
Azure Cost Management connector.

Required env vars:
  AZURE_SUBSCRIPTION_ID   — Azure subscription ID (uuid)
  AZURE_TENANT_ID         — Azure Active Directory tenant ID
  AZURE_CLIENT_ID         — Service principal application (client) ID
  AZURE_CLIENT_SECRET     — Service principal client secret

To activate:
  1. Create a service principal with Cost Management Reader role:
       az ad sp create-for-rbac --name cloud-cost-guard \
         --role "Cost Management Reader" \
         --scopes /subscriptions/<SUBSCRIPTION_ID>
     The output gives appId (CLIENT_ID), password (CLIENT_SECRET), tenant (TENANT_ID).
  2. Export the credentials:
       export AZURE_SUBSCRIPTION_ID=<subscription-id>
       export AZURE_TENANT_ID=<tenant-id>
       export AZURE_CLIENT_ID=<app-id>
       export AZURE_CLIENT_SECRET=<password>
  3. Install the SDK:
       pip install azure-identity azure-mgmt-costmanagement
  4. The app will use live data automatically; no code changes needed.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any


class AzureConnector:
    REQUIRED_ENV = [
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_TENANT_ID",
        "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET",
    ]

    def is_configured(self) -> bool:
        return all(os.getenv(k) for k in self.REQUIRED_ENV)

    def get_cost_data(self, window_days: int = 30) -> Dict[str, Any]:
        """
        Fetch cost data from Azure Cost Management API.

        Returns a dict with keys: cloud, total_cost, top_services, trend.
        top_services items: {service_name, total_cost, percentage_of_total}
        """
        if not self.is_configured():
            raise RuntimeError(
                "Azure credentials not configured. "
                "Set AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID, "
                "AZURE_CLIENT_ID, AZURE_CLIENT_SECRET."
            )

        try:
            from azure.identity import ClientSecretCredential
            from azure.mgmt.costmanagement import CostManagementClient
        except ImportError:
            raise RuntimeError(
                "Azure SDK not installed. Run: "
                "pip install azure-identity azure-mgmt-costmanagement"
            )

        subscription_id = os.environ["AZURE_SUBSCRIPTION_ID"]
        credential = ClientSecretCredential(
            tenant_id=os.environ["AZURE_TENANT_ID"],
            client_id=os.environ["AZURE_CLIENT_ID"],
            client_secret=os.environ["AZURE_CLIENT_SECRET"],
        )
        client = CostManagementClient(credential)
        scope = f"/subscriptions/{subscription_id}"

        today = datetime.now(timezone.utc).date()
        end = today.isoformat()
        start = (today - timedelta(days=window_days)).isoformat()
        prev_start = (today - timedelta(days=window_days * 2)).isoformat()

        def _query(from_date: str, to_date: str) -> list:
            body = {
                "type": "ActualCost",
                "dataSet": {
                    "granularity": "None",
                    "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
                    "grouping": [{"type": "Dimension", "name": "ServiceName"}],
                },
                "timeframe": "Custom",
                "timePeriod": {
                    "from": f"{from_date}T00:00:00Z",
                    "to": f"{to_date}T00:00:00Z",
                },
            }
            result = client.query.usage(scope=scope, parameters=body)
            return result.rows or []

        rows = _query(start, end)
        total_cost = 0.0
        services = []
        for row in rows:
            cost = float(row[0])
            svc = str(row[1]) if len(row) > 1 else "Unknown"
            total_cost += cost
            services.append({"service_name": svc, "total_cost": cost})

        for s in services:
            s["percentage_of_total"] = round(s["total_cost"] / total_cost * 100, 1) if total_cost else 0
        services.sort(key=lambda x: x["total_cost"], reverse=True)

        prev_rows = _query(prev_start, start)
        prev_total = sum(float(row[0]) for row in prev_rows)
        change_pct = ((total_cost - prev_total) / prev_total * 100) if prev_total > 0 else 0.0

        return {
            "cloud": "azure",
            "total_cost": round(total_cost, 2),
            "top_services": services[:10],
            "trend": {
                "direction": "up" if change_pct >= 0 else "down",
                "change_percentage": round(change_pct, 1),
                "change_amount": round(total_cost - prev_total, 2),
            },
        }
