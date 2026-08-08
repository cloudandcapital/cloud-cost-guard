from __future__ import annotations

import hashlib
import json
import shutil
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

from build_ccac11_dashboard_view import render_view  # noqa: E402
from build_ccac11_dashboard_view import validate_policy_artifacts
from ccac11_dashboard_view import SOURCE_REPORT_SHA256  # noqa: E402
from ccac11_dashboard_view import (
    APPROVED_RELEASE,
    PROJECTION_POLICY,
    VIEW_SCHEMA,
    ProjectionError,
    project_dashboard_view,
)

REPORT_PATH = (
    REPOSITORY_ROOT
    / "fixtures"
    / "ccac"
    / "illustrative-v0.3.0"
    / "run"
    / "report.json"
)
RUN_DIRECTORY = REPORT_PATH.parent
GENERATED_PATH = (
    REPOSITORY_ROOT
    / "frontend"
    / "src"
    / "data"
    / "ccac-dashboard-view-v1.1.generated.json"
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
        self.assertEqual(view["source_metadata"]["catalog_counts"]["metrics"], 160)
        self.assertEqual(len(view["producers"]), 5)
        self.assertEqual(len(view["findings"]), 10)
        self.assertEqual(len(view["anomalies"]), 2)
        self.assertIsNone(view["opportunity"]["annual_aggregate"])
        self.assertEqual(view["technology_spend"]["total"]["value"], "2939.0525")
        self.assertEqual(view["technology_spend"]["reconciliation"]["status"], "passed")
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

    def test_complete_approved_release_provenance_is_exact_and_exposed(self) -> None:
        expected = {
            "ccac": {
                "version": "v0.2.0",
                "wheel_sha256": "bc46f363b1a03c94cf0da75759bccd0271de2c53b1f77a1a7255f9c8e7f768f1",
            },
            "command_center_commit": "b114f776727a070e34c2f0d771165464f2055b93",
            "producer_commits": {
                "ai-cost-lens": "c4ab27a5c83ca7165de130a08c5d118fd18887b2",
                "finops-lite": "d72649ec07aa57c60a7ea3f8ff2890b8d95c4b93",
                "finops-watchdog": "9bc4e90725969f7775b3aef110b01e10dec4a7e0",
                "recovery-economics": "9a6c4e1ce34e58af10fc42d44d911338a724dabe",
                "saas-cost-analyzer": "a627aff595eb0c0fc44f23a07662cfd82cc98bbe",
            },
        }
        view = project_dashboard_view(self.report)
        self.assertEqual(APPROVED_RELEASE, expected)
        self.assertEqual(PROJECTION_POLICY["approved_release"], expected)
        self.assertEqual(
            view["source_metadata"]["approved_release_provenance"], expected
        )
        self.assertIsNot(
            view["source_metadata"]["approved_release_provenance"], APPROVED_RELEASE
        )

    def test_manifest_hash_lifecycle_is_explicit_and_exact(self) -> None:
        metadata = project_dashboard_view(self.report)["source_metadata"]
        self.assertEqual(
            metadata["final_manifest_sha256"],
            "1919025af73e9cc4a3b5d29d21f13ad9c391e40533874b0c5cfc0325867eb632",
        )
        self.assertEqual(
            metadata["report_provenance_manifest_sha256"],
            "a991ba3fbe53c11b9ac9cc347b4b62307fe5de083a90362ae46088c7bc08eeb5",
        )
        self.assertNotEqual(
            metadata["final_manifest_sha256"],
            metadata["report_provenance_manifest_sha256"],
        )
        self.assertNotIn("manifest_sha256", metadata)

    def test_distinct_periods_and_no_unsupported_values(self) -> None:
        view = project_dashboard_view(self.report)
        self.assertEqual(view["cloud"]["total"]["trace"]["period"]["end"], "2026-07-22")
        self.assertEqual(view["ai"]["total"]["trace"]["period"]["end"], "2026-07-22")
        invoice_periods = {
            item["id"]: item["trace"]["period"]
            for item in view["saas"]["invoice_metrics"]
        }
        self.assertEqual(
            invoice_periods["metric.saas.crm-9261ceef.invoice-cost"]["end"],
            "2026-12-01",
        )
        self.assertEqual(
            invoice_periods["metric.saas.design-a77de8a6.invoice-cost"]["end"],
            "2026-10-01",
        )
        self.assertIsNone(view["saas"]["combined_invoice_total"])
        self.assertNotIn("forecast", view)
        self.assertNotIn("monthly_opportunity", view)
        self.assertNotIn("tagging", view)
        self.assertNotIn("kubernetes", view)
        self.assertEqual(view["opportunity"]["source"]["estimate"]["period"], "annual")

    def test_saas_scope_total_is_canonical_and_invoice_periods_stay_separate(
        self,
    ) -> None:
        view = project_dashboard_view(self.report)
        saas_scope = view["saas"]["canonical_scope_total"]
        reconciliation_scope = next(
            item
            for item in view["technology_spend"]["scopes"]
            if item["id"] == "metric.tech-spend.scope.saas"
        )
        self.assertIs(saas_scope, reconciliation_scope)
        self.assertEqual(saas_scope["value"], "736.77")
        self.assertEqual(saas_scope["trace"]["currency"], "USD")
        self.assertEqual(
            saas_scope["trace"]["period"],
            {"start": "2026-07-01", "end": "2026-07-22", "timezone": "UTC"},
        )
        self.assertIsNone(view["saas"]["combined_invoice_total"])
        invoice_values = [
            Decimal(item["value"]) for item in view["saas"]["invoice_metrics"]
        ]
        self.assertEqual(invoice_values, [Decimal("8640.0"), Decimal("1050.0")])
        self.assertNotEqual(sum(invoice_values), Decimal(saas_scope["value"]))

    def test_opportunity_wording_distinguishes_source_from_missing_aggregate(
        self,
    ) -> None:
        view = project_dashboard_view(self.report)
        self.assertEqual(view["opportunity"]["source"]["estimate"]["period"], "annual")
        self.assertIsNone(view["opportunity"]["annual_aggregate"])
        unavailable = next(
            item
            for item in view["unsupported"]
            if item["concept"] == "monthly_opportunity_scalar"
        )
        self.assertIn("source opportunity is annual", unavailable["explanation"])
        self.assertIn(
            "no canonical opportunity aggregate was published",
            unavailable["explanation"],
        )

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
        self.assertEqual(len(first), 156_026)
        self.assertEqual(
            hashlib.sha256(first).hexdigest(),
            "5462769f8316a6009c47eeb8245c367a59418e2fb4bbb8904a15ee6507648d90",
        )

    def test_generator_check_mode_does_not_write(self) -> None:
        before = GENERATED_PATH.read_bytes()
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "build_ccac11_dashboard_view.py"),
                "--check",
            ],
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

    def test_decimal_reconciliation_is_exact_and_published_total_is_preserved(
        self,
    ) -> None:
        view = project_dashboard_view(self.report)
        scope_values = [
            Decimal(item["value"]) for item in view["technology_spend"]["scopes"]
        ]
        self.assertEqual(
            scope_values, [Decimal("2194.0"), Decimal("8.2825"), Decimal("736.77")]
        )
        self.assertEqual(sum(scope_values, Decimal("0")), Decimal("2939.0525"))
        self.assertEqual(view["technology_spend"]["total"]["value"], "2939.0525")
        self.assertEqual(
            view["technology_spend"]["reconciliation"]["difference"], "0.0"
        )

    def test_unsupported_registry_is_explicit_and_value_free(self) -> None:
        unsupported = project_dashboard_view(self.report)["unsupported"]
        self.assertEqual(len(unsupported), 10)
        self.assertEqual(
            {item["concept"] for item in unsupported},
            {
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

    def assert_projection_error(
        self, category: str, report: dict | None = None
    ) -> None:
        with self.assertRaisesRegex(ProjectionError, category):
            project_dashboard_view(self.report if report is None else report)

    def test_canonical_display_order_succeeds_and_is_emitted_exactly(self) -> None:
        view = project_dashboard_view(self.report)
        expected = PROJECTION_POLICY["display"]["finding_ids"]
        self.assertEqual(self.report["display"]["finding_ids"], expected)
        self.assertEqual([finding["id"] for finding in view["findings"]], expected)

    def test_contractual_display_reversal_swap_and_rotation_are_rejected(self) -> None:
        mutations = {
            "reversal": lambda ids: ids.reverse(),
            "swap": lambda ids: ids.__setitem__(slice(0, 2), [ids[1], ids[0]]),
            "rotation": lambda ids: ids.__setitem__(slice(None), ids[1:] + ids[:1]),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                changed = deepcopy(self.report)
                mutate(changed["display"]["finding_ids"])
                self.assert_projection_error("contractual order mismatch", changed)

    def test_display_finding_inventory_mutations_are_rejected(self) -> None:
        mutations = {
            "missing": lambda ids: ids.pop(),
            "additional": lambda ids: ids.append("finding.saas.unapproved"),
            "substitution": lambda ids: ids.__setitem__(
                0, "finding.anomaly.unapproved"
            ),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                changed = deepcopy(self.report)
                mutate(changed["display"]["finding_ids"])
                self.assert_projection_error("inventory mismatch", changed)

    def test_duplicate_display_finding_is_rejected_as_duplicate_identity(self) -> None:
        ids = self.report["display"]["finding_ids"]
        ids[-1] = ids[0]
        self.assert_projection_error("duplicate IDs")

    def test_finding_catalog_reordering_remains_order_independent(self) -> None:
        expected = project_dashboard_view(self.report)
        self.report["finding_catalog"].reverse()
        self.assertEqual(project_dashboard_view(self.report), expected)

    def test_order_failure_does_not_write_partial_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "view.json"
            output.write_text("sentinel", encoding="utf-8")
            self.report["display"]["finding_ids"].reverse()
            self.assert_projection_error("contractual order mismatch")
            self.assertEqual(output.read_text(encoding="utf-8"), "sentinel")

    def test_same_count_invented_metric_is_rejected_by_inventory(self) -> None:
        approved = "metric.cloud.service.amazonec2-23d867e0.cost"
        invented = "metric.cloud.service.unapproved-00000000.cost"
        find_metric(self.report, approved)["id"] = invented
        section = self.report["display"]["section_metric_ids"]["finops-lite"]
        section[section.index(approved)] = invented
        self.assert_projection_error("metric inventory")

    def test_missing_metric_replaced_by_invented_metric_is_rejected(self) -> None:
        approved = "metric.cloud.service.amazons3-c600b2aa.cost"
        invented = "metric.cloud.service.unapproved-00000000.cost"
        replacement = deepcopy(find_metric(self.report, approved))
        replacement["id"] = invented
        self.report["metric_catalog"] = [
            replacement if item["id"] == approved else item
            for item in self.report["metric_catalog"]
        ]
        section = self.report["display"]["section_metric_ids"]["finops-lite"]
        section[section.index(approved)] = invented
        self.assert_projection_error("metric inventory")

    def test_duplicate_metric_substituted_for_another_is_rejected(self) -> None:
        self.report["metric_catalog"][-1] = deepcopy(self.report["metric_catalog"][0])
        self.assert_projection_error("duplicate stable ID")

    def test_same_prefix_invented_evidence_is_rejected(self) -> None:
        find_metric(self.report, "metric.tech-spend.scope.cloud")["evidence_ids"] = [
            "evidence.finops-lite.unapproved"
        ]
        self.assert_projection_error("metric relationship graph")

    def test_wrong_real_same_producer_evidence_is_rejected(self) -> None:
        find_metric(
            self.report, "metric.resilience.orders-db.tested-restore-duration-hours"
        )["evidence_ids"] = ["evidence.recovery-economics.scenario-input"]
        self.assert_projection_error("metric relationship graph")

    def test_missing_and_duplicate_evidence_are_rejected(self) -> None:
        for evidence_ids, category in (
            ([], "metric relationship graph"),
            (
                [
                    "evidence.finops-lite.cost-summary",
                    "evidence.finops-lite.cost-summary",
                ],
                "duplicate IDs",
            ),
        ):
            with self.subTest(category=category):
                changed = deepcopy(self.report)
                find_metric(changed, "metric.tech-spend.scope.cloud")[
                    "evidence_ids"
                ] = evidence_ids
                self.assert_projection_error(category, changed)

    def test_artifact_hash_changed_to_zeroes_is_rejected(self) -> None:
        self.report["provenance"]["artifact_sha256s"]["finops-lite"] = "0" * 64
        self.assert_projection_error("artifact provenance")

    def test_artifact_hashes_swapped_between_producers_are_rejected(self) -> None:
        hashes = self.report["provenance"]["artifact_sha256s"]
        hashes["finops-lite"], hashes["finops-watchdog"] = (
            hashes["finops-watchdog"],
            hashes["finops-lite"],
        )
        self.assert_projection_error("artifact provenance")

    def test_missing_and_extra_report_provenance_are_rejected(self) -> None:
        for mutation in ("missing", "extra"):
            with self.subTest(mutation=mutation):
                changed = deepcopy(self.report)
                hashes = changed["provenance"]["artifact_sha256s"]
                if mutation == "missing":
                    hashes.pop("finops-lite")
                else:
                    hashes["unapproved-producer"] = "0" * 64
                self.assert_projection_error("artifact provenance", changed)

    def test_manifest_provenance_rejects_duplicate_filename_and_size_changes(
        self,
    ) -> None:
        mutations = ("duplicate", "filename", "size")
        for mutation in mutations:
            with self.subTest(
                mutation=mutation
            ), tempfile.TemporaryDirectory() as directory:
                run = Path(directory) / "run"
                shutil.copytree(RUN_DIRECTORY, run)
                manifest_path = run / "manifest.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                if mutation == "duplicate":
                    manifest["artifacts"].append(deepcopy(manifest["artifacts"][0]))
                elif mutation == "filename":
                    manifest["artifacts"][0]["relative_path"] = "finops-watchdog.json"
                else:
                    with (run / "finops-lite.json").open("ab") as artifact:
                        artifact.write(b"\n")
                manifest_path.write_text(
                    json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
                )
                with self.assertRaisesRegex(ProjectionError, "artifact provenance"):
                    validate_policy_artifacts(run)

    def test_manifest_hash_omission_or_confusion_fails_closed(self) -> None:
        for value in (
            None,
            "1919025af73e9cc4a3b5d29d21f13ad9c391e40533874b0c5cfc0325867eb632",
        ):
            with self.subTest(report_provenance=value):
                changed = deepcopy(self.report)
                if value is None:
                    changed["provenance"].pop("manifest_sha256")
                else:
                    changed["provenance"]["manifest_sha256"] = value
                self.assert_projection_error("artifact provenance", changed)

        original_final_hash = PROJECTION_POLICY["manifest"]["sha256"]
        try:
            for value in (
                None,
                "a991ba3fbe53c11b9ac9cc347b4b62307fe5de083a90362ae46088c7bc08eeb5",
            ):
                with self.subTest(final_manifest=value):
                    if value is None:
                        PROJECTION_POLICY["manifest"].pop("sha256")
                    else:
                        PROJECTION_POLICY["manifest"]["sha256"] = value
                    with self.assertRaisesRegex(ProjectionError, "manifest differs"):
                        validate_policy_artifacts(RUN_DIRECTORY)
                    PROJECTION_POLICY["manifest"]["sha256"] = original_final_hash
        finally:
            PROJECTION_POLICY["manifest"]["sha256"] = original_final_hash

        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory) / "run"
            shutil.copytree(RUN_DIRECTORY, run)
            manifest_path = run / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"][0][
                "content_sha256"
            ] = "a991ba3fbe53c11b9ac9cc347b4b62307fe5de083a90362ae46088c7bc08eeb5"
            manifest_path.write_text(
                json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ProjectionError, "manifest differs"):
                validate_policy_artifacts(run)

    def test_relationship_array_reordering_is_accepted(self) -> None:
        expected = project_dashboard_view(self.report)
        reordered = deepcopy(self.report)
        for metric in reordered["metric_catalog"]:
            metric["input_metric_ids"].reverse()
            metric["evidence_ids"].reverse()
        for finding in reordered["finding_catalog"]:
            finding["metric_ids"].reverse()
            finding["evidence_ids"].reverse()
        for opportunity in reordered["opportunity_catalog"]:
            opportunity["evidence_ids"].reverse()
            opportunity["related_finding_ids"].reverse()
            opportunity["related_opportunity_ids"].reverse()
        for aggregate in reordered["opportunity_aggregates"]:
            aggregate["opportunity_ids"].reverse()
            aggregate["excluded_opportunity_ids"].reverse()
        for ids in reordered["display"]["section_metric_ids"].values():
            ids.reverse()
        projected = project_dashboard_view(reordered)
        self.assertEqual(projected["identity"], expected["identity"])
        self.assertEqual(projected["source_metadata"], expected["source_metadata"])

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
        cloud_index = sections["finops-lite"].index("metric.tech-spend.scope.cloud")
        ai_index = sections["ai-cost-lens"].index("metric.ai.total-cost")
        sections["finops-lite"][cloud_index], sections["ai-cost-lens"][ai_index] = (
            sections["ai-cost-lens"][ai_index],
            sections["finops-lite"][cloud_index],
        )
        self.assert_projection_fails()

    def test_missing_or_changed_currency(self) -> None:
        metric = find_metric(self.report, "metric.tech-spend.scope.cloud")
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
                find_metric(changed, "metric.tech-spend.scope.cloud")[field] = value
                self.assert_projection_fails(changed)

    def test_negative_scope_and_published_total_fail_closed(self) -> None:
        for metric_id in (
            "metric.tech-spend.scope.cloud",
            "metric.tech-spend.total",
        ):
            with self.subTest(metric_id=metric_id):
                changed = deepcopy(self.report)
                find_metric(changed, metric_id)["value"] = Decimal("-0.01")
                self.assert_projection_error("cannot be negative", changed)

    def test_ineligible_or_partial_scope_fails_closed(self) -> None:
        mutations = {
            "ineligible": ("total_eligible", False),
            "partial": ("coverage", "partial"),
            "wrong_owner": ("canonical_owner", "finops-watchdog"),
        }
        for name, (field, value) in mutations.items():
            with self.subTest(name=name):
                changed = deepcopy(self.report)
                scope = find_metric(changed, "metric.tech-spend.scope.cloud")
                scope["accounting_boundary"][field] = value
                self.assert_projection_error("scope is ineligible", changed)

    def test_published_total_and_reconciliation_tampering_fail_closed(self) -> None:
        mutations = {
            "published_total": lambda report: find_metric(
                report, "metric.tech-spend.total"
            ).__setitem__("value", Decimal("2939.0526")),
            "difference": lambda report: report["reconciliation"][0].__setitem__(
                "difference", Decimal("0.01")
            ),
            "duplicate_input": lambda report: report["reconciliation"][0][
                "input_metric_ids"
            ].__setitem__(2, "metric.tech-spend.scope.cloud"),
            "diagnostic_input": lambda report: find_metric(
                report, "metric.tech-spend.total"
            )["input_metric_ids"].__setitem__(
                2, "metric.resilience.orders-db.monthly-design-cost"
            ),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                changed = deepcopy(self.report)
                mutate(changed)
                self.assert_projection_fails(changed)

    def test_broken_evidence_reference(self) -> None:
        find_metric(self.report, "metric.tech-spend.scope.cloud")["evidence_ids"] = [
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

    def test_invented_opportunity_aggregate(self) -> None:
        self.report["opportunity_aggregates"] = [{"id": "aggregate.invented"}]
        self.assert_projection_fails()

    def test_changed_opportunity_estimate_period(self) -> None:
        self.report["opportunity_catalog"][0]["estimate"]["period"] = "monthly"
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
                    str(SCRIPTS / "build_ccac11_dashboard_view.py"),
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
