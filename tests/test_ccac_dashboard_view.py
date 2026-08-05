from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from decimal import Decimal
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = REPOSITORY_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from build_ccac_dashboard_view import render_view  # noqa: E402
from ccac_dashboard_view import SOURCE_REPORT_SHA256  # noqa: E402
from ccac_dashboard_view import VIEW_SCHEMA, ProjectionError, project_dashboard_view

REPORT_PATH = (
    REPOSITORY_ROOT
    / "fixtures"
    / "ccac"
    / "illustrative-v0.2.1"
    / "run"
    / "report.json"
)
RUN_DIRECTORY = REPORT_PATH.parent
GENERATED_PATH = (
    REPOSITORY_ROOT / "frontend" / "src" / "data" / "ccac-dashboard-view.generated.json"
)


def load_report() -> dict:
    return json.loads(REPORT_PATH.read_text(encoding="utf-8"), parse_float=Decimal)


def find_metric(report: dict, metric_id: str) -> dict:
    return next(item for item in report["metric_catalog"] if item["id"] == metric_id)


class CanonicalProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.report = load_report()

    def test_canonical_projection_contract_and_counts(self) -> None:
        view = project_dashboard_view(self.report)
        self.assertEqual(view["schema"], VIEW_SCHEMA)
        self.assertEqual(view["identity"]["source_report_sha256"], SOURCE_REPORT_SHA256)
        self.assertEqual(view["identity"]["mode"], "illustrative")
        self.assertEqual(view["source_metadata"]["catalog_counts"]["metrics"], 155)
        self.assertEqual(len(view["producers"]), 5)
        self.assertEqual(len(view["findings"]), 10)
        self.assertEqual(len(view["anomalies"]), 2)
        self.assertEqual(
            len(view["opportunity"]["annual_aggregate"]["opportunity_ids"]), 1
        )
        self.assertEqual(
            next(
                item
                for item in view["producers"]
                if item["name"] == "saas-cost-analyzer"
            )["quality"]["status"],
            "partial",
        )
        self.assertTrue(
            all(
                item["quality"] == "partial"
                for item in view["findings"]
                if item["producer"]["name"] == "saas-cost-analyzer"
            )
        )

    def test_distinct_periods_and_no_unsupported_values(self) -> None:
        view = project_dashboard_view(self.report)
        self.assertEqual(view["cloud"]["total"]["trace"]["period"]["end"], "2026-07-22")
        self.assertEqual(view["ai"]["total"]["trace"]["period"]["end"], "2026-07-03")
        invoice_periods = {
            item["id"]: item["trace"]["period"]
            for item in view["saas"]["invoice_metrics"]
        }
        self.assertEqual(
            invoice_periods["metric.saas.crm-9261ceef.invoice-cost"]["end"],
            "2027-01-01",
        )
        self.assertEqual(
            invoice_periods["metric.saas.design-a77de8a6.invoice-cost"]["end"],
            "2026-10-01",
        )
        self.assertIsNone(view["saas"]["combined_total"])
        self.assertNotIn("forecast", view)
        self.assertNotIn("monthly_opportunity", view)
        self.assertNotIn("tagging", view)
        self.assertNotIn("kubernetes", view)
        self.assertEqual(view["opportunity"]["annual_aggregate"]["period"], "annual")

    def test_projected_numeric_and_status_records_are_traceable(self) -> None:
        view = project_dashboard_view(self.report)
        metric_records = (
            [view["cloud"]["total"]]
            + view["cloud"]["comparison"]
            + view["cloud"]["services"]
            + view["cloud"]["daily"]
            + view["ai"]["metrics"]
            + view["saas"]["invoice_metrics"]
            + view["resilience"]["modeled_metrics"]
            + view["resilience"]["observed_restore_metrics"]
        )
        for record in metric_records:
            trace = record["trace"]
            self.assertTrue(trace["canonical_id"])
            self.assertTrue(trace["producer"]["version"])
            self.assertTrue(trace["source_artifact"])
            self.assertIn(
                trace["basis"], {"observed", "calculated", "estimated", "unknown"}
            )
            self.assertIn(trace["quality"], {"valid", "partial"})
            self.assertTrue(trace["period"])
            self.assertTrue(trace["evidence_ids"])
        for finding in view["findings"]:
            self.assertEqual(finding["id"], finding["trace"]["canonical_id"])
            self.assertTrue(finding["trace"]["metric_ids"])

    def test_missing_values_remain_null_and_zero_remains_explicit(self) -> None:
        view = project_dashboard_view(self.report)
        design_metric = find_metric(
            self.report, "metric.saas.design-a77de8a6.unassigned-seats"
        )
        self.assertIsNone(design_metric["value"])
        zero_metric = next(
            item
            for item in view["ai"]["metrics"]
            if item["id"].endswith(".reasoning-tokens") and item["value"] == "0"
        )
        self.assertEqual(zero_metric["value"], "0")

    def test_output_is_deterministic_and_tracked_file_is_current(self) -> None:
        first = render_view(RUN_DIRECTORY)
        second = render_view(RUN_DIRECTORY)
        self.assertEqual(first, second)
        self.assertEqual(first, GENERATED_PATH.read_bytes())
        self.assertTrue(first.endswith(b"\n"))

    def test_generator_check_mode_does_not_write(self) -> None:
        before = GENERATED_PATH.read_bytes()
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "build_ccac_dashboard_view.py"), "--check"],
            cwd=REPOSITORY_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, GENERATED_PATH.read_bytes())

    def test_reordered_catalogs_do_not_change_output(self) -> None:
        expected = project_dashboard_view(self.report)
        reordered = deepcopy(self.report)
        for field in (
            "included_producers",
            "producer_quality",
            "metric_catalog",
            "finding_catalog",
            "opportunity_catalog",
            "opportunity_aggregates",
        ):
            reordered[field].reverse()
        self.assertEqual(expected, project_dashboard_view(reordered))

    def test_extreme_decimal_precision_is_preserved(self) -> None:
        metric = find_metric(self.report, "metric.cloud.total")
        metric["value"] = Decimal("2194.123456789012345678901234567890")
        view = project_dashboard_view(self.report)
        self.assertEqual(
            view["cloud"]["total"]["value"], "2194.123456789012345678901234567890"
        )

    def test_unsupported_registry_is_explicit_and_value_free(self) -> None:
        unsupported = project_dashboard_view(self.report)["unsupported"]
        self.assertEqual(len(unsupported), 13)
        self.assertEqual(
            {item["concept"] for item in unsupported},
            {
                "combined_technology_spend",
                "cloud_ai_saas_total",
                "combined_scope_donut",
                "combined_daily_technology_spend",
                "next_month_forecast",
                "avoidable_run_rate",
                "monthly_opportunity_scalar",
                "tagging_coverage",
                "kubernetes_cost_or_utilization",
                "verified_savings",
                "realized_savings",
                "demonstrated_recoverability",
                "unknown_as_zero",
            },
        )
        self.assertTrue(
            all(
                set(item) == {"concept", "reason_code", "explanation"}
                for item in unsupported
            )
        )


class SemanticAdversarialProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.report = load_report()

    def assert_projection_fails(self, report: dict | None = None) -> None:
        with self.assertRaises(ProjectionError):
            project_dashboard_view(self.report if report is None else report)

    def test_missing_required_stable_id(self) -> None:
        self.report["metric_catalog"].pop()
        self.assert_projection_fails()

    def test_duplicate_stable_id(self) -> None:
        self.report["metric_catalog"].append(deepcopy(self.report["metric_catalog"][0]))
        self.assert_projection_fails()

    def test_wrong_producer_version(self) -> None:
        self.report["included_producers"][0]["version"] = "9.9.9"
        self.assert_projection_fails()

    def test_wrong_producer_association(self) -> None:
        sections = self.report["display"]["section_metric_ids"]
        cloud_index = sections["finops-lite"].index("metric.cloud.total")
        ai_index = sections["ai-cost-lens"].index("metric.ai.total-cost")
        sections["finops-lite"][cloud_index], sections["ai-cost-lens"][ai_index] = (
            sections["ai-cost-lens"][ai_index],
            sections["finops-lite"][cloud_index],
        )
        self.assert_projection_fails()

    def test_missing_or_changed_currency(self) -> None:
        metric = find_metric(self.report, "metric.cloud.total")
        for value in (None, "EUR"):
            with self.subTest(value=value):
                changed = deepcopy(self.report)
                find_metric(changed, metric["id"])["currency"] = value
                self.assert_projection_fails(changed)

    def test_changed_metric_period_basis_quality_or_additivity(self) -> None:
        for field, value in (
            ("period", {"start": "2026-07-01", "end": "2026-07-23", "timezone": "UTC"}),
            ("basis", "estimated"),
            ("quality_status", "partial"),
            ("additivity", "ratio"),
        ):
            with self.subTest(field=field):
                changed = deepcopy(self.report)
                find_metric(changed, "metric.cloud.total")[field] = value
                self.assert_projection_fails(changed)

    def test_broken_evidence_reference(self) -> None:
        find_metric(self.report, "metric.cloud.total")["evidence_ids"] = [
            "evidence.ai-cost-lens.usage"
        ]
        self.assert_projection_fails()

    def test_broken_input_metric_reference(self) -> None:
        find_metric(self.report, "metric.ai.total-cost")["input_metric_ids"].append(
            "metric.ai.missing.cost"
        )
        self.assert_projection_fails()

    def test_missing_finding_referenced_by_display_order(self) -> None:
        self.report["display"]["finding_ids"][0] = "finding.anomaly.missing"
        self.assert_projection_fails()

    def test_unexpected_finding_type(self) -> None:
        self.report["finding_catalog"][0]["finding_type"] = "forecast"
        self.assert_projection_fails()

    def test_missing_producer_quality_record(self) -> None:
        self.report["producer_quality"].pop()
        self.assert_projection_fails()

    def test_saas_partial_quality_cannot_be_erased(self) -> None:
        next(
            item
            for item in self.report["producer_quality"]
            if item["producer"]["name"] == "saas-cost-analyzer"
        )["quality"]["status"] = "valid"
        self.assert_projection_fails()

    def test_missing_opportunity_aggregate(self) -> None:
        self.report["opportunity_aggregates"] = []
        self.assert_projection_fails()

    def test_changed_opportunity_period(self) -> None:
        self.report["opportunity_aggregates"][0]["period"] = "monthly"
        self.assert_projection_fails()

    def test_estimate_cannot_be_mislabeled(self) -> None:
        for label in ("realized", "verified"):
            with self.subTest(label=label):
                changed = deepcopy(self.report)
                changed["opportunity_catalog"][0]["estimate"]["basis"] = label
                self.assert_projection_fails(changed)

    def test_overlap_violation(self) -> None:
        self.report["opportunity_catalog"][0]["overlap"]["disposition"] = "exclusive"
        self.assert_projection_fails()

    def test_missing_cannot_be_substituted_with_zero(self) -> None:
        metric = find_metric(
            self.report, "metric.saas.design-a77de8a6.unassigned-seats"
        )
        metric["value"] = 0
        metric["unknown_reason"] = None
        self.assert_projection_fails()

    def test_hostile_markup_control_directional_and_oversized_text_fail(self) -> None:
        values = (
            "<script>alert(1)</script>",
            "unsafe\u0000text",
            "safe\u202etext",
            "x" * 301,
        )
        for value in values:
            with self.subTest(value_length=len(value)):
                changed = deepcopy(self.report)
                changed["finding_catalog"][0]["title"] = value
                self.assert_projection_fails(changed)

    def test_unknown_enum_value(self) -> None:
        self.report["finding_catalog"][0]["severity"] = "catastrophic"
        self.assert_projection_fails()

    def test_unexpected_unsupported_concept(self) -> None:
        self.report["display"]["unsupported_concepts"] = ["forecast"]
        self.assert_projection_fails()

    def test_failure_does_not_write_partial_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "view.json"
            output.write_text("sentinel", encoding="utf-8")
            tampered_run = Path(directory) / "run"
            subprocess.run(
                ["cp", "-R", str(RUN_DIRECTORY), str(tampered_run)], check=True
            )
            (tampered_run / "report.json").write_text("{}", encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "build_ccac_dashboard_view.py"),
                    "--run-directory",
                    str(tampered_run),
                    "--output",
                    str(output),
                ],
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_text(encoding="utf-8"), "sentinel")


if __name__ == "__main__":
    unittest.main()
