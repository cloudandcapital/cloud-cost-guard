import os
import unittest
from unittest.mock import patch

from backend.connectors.k8s_connector import K8sConnector, _parse_cpu, _parse_memory_gb
from backend.connectors.aws_connector import _sum_ungrouped_cost
from backend.connectors.gcp_connector import _validate_table_name


class KubernetesConnectorParsingTests(unittest.TestCase):
    def test_parse_cpu_millicores(self):
        self.assertEqual(_parse_cpu("750m"), 0.75)

    def test_parse_cpu_cores(self):
        self.assertEqual(_parse_cpu("2"), 2.0)

    def test_parse_memory_binary_units(self):
        self.assertEqual(_parse_memory_gb("2Gi"), 2.0)
        self.assertAlmostEqual(_parse_memory_gb("512Mi"), 0.5)

    def test_invalid_quantities_return_zero(self):
        self.assertEqual(_parse_cpu("unknown"), 0.0)
        self.assertEqual(_parse_memory_gb("unknown"), 0.0)

    def test_cost_overrides_fall_back_safely(self):
        connector = K8sConnector()
        with patch.dict(os.environ, {"K8S_COST_PER_CPU_HOUR": "invalid"}, clear=False):
            self.assertEqual(connector._cost_per_cpu_hour(), connector.COST_PER_CPU_HOUR)


class AWSCostExplorerParsingTests(unittest.TestCase):
    def test_ungrouped_previous_period_total(self):
        response = {
            "ResultsByTime": [
                {"Total": {"BlendedCost": {"Amount": "120.25", "Unit": "USD"}}},
                {"Total": {"BlendedCost": {"Amount": "79.75", "Unit": "USD"}}},
            ]
        }
        self.assertEqual(_sum_ungrouped_cost(response), 200.0)

    def test_missing_total_is_zero(self):
        self.assertEqual(_sum_ungrouped_cost({"ResultsByTime": [{}]}), 0.0)


class GCPBillingTableValidationTests(unittest.TestCase):
    def test_accepts_fully_qualified_table(self):
        table = "my-project.billing.gcp_billing_export_v1_ABC123"
        self.assertEqual(_validate_table_name(table), table)

    def test_rejects_sql_fragments(self):
        with self.assertRaises(ValueError):
            _validate_table_name("project.dataset.table` WHERE TRUE --")


if __name__ == "__main__":
    unittest.main()
