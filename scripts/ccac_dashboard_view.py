#!/usr/bin/env python3
"""Pure, fail-closed projection from a validated CCAC trusted report."""

from __future__ import annotations

import json
import unicodedata
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

VIEW_SCHEMA = "ccg-dashboard-view/1.0.0"
POLICY_PATH = Path(__file__).with_name("ccac_dashboard_view_policy_v1.json")
with POLICY_PATH.open(encoding="utf-8") as policy_file:
    PROJECTION_POLICY = json.load(policy_file)
SOURCE_REPORT_SHA256 = (
    "3e56662a5192644dd17d698184267c5e638f24018991f442dfbcf81b4dc8edaa"
)
EXPECTED_PRODUCERS = {
    "ai-cost-lens": "0.2.0",
    "finops-lite": "0.3.0",
    "finops-watchdog": "0.4.0",
    "recovery-economics": "0.2.1",
    "saas-cost-analyzer": "0.2.0",
}
ARTIFACT_NAMES = {name: f"{name}.json" for name in EXPECTED_PRODUCERS}
ALLOWED_BASES = {"observed", "calculated", "estimated", "unknown"}
ALLOWED_QUALITY = {"valid", "partial", "invalid", "unknown"}
ALLOWED_ADDITIVITY = {"additive", "non_additive", "ratio"}
ALLOWED_FINDING_TYPES = {"anomaly", "resilience_gap", "allocation", "data_quality"}
UNSUPPORTED = (
    (
        "combined_technology_spend",
        "incompatible_boundaries",
        "No canonical combined technology-spend metric exists.",
    ),
    (
        "cloud_ai_saas_total",
        "incompatible_boundaries",
        "Cloud, AI, and SaaS periods and accounting boundaries are not additive.",
    ),
    (
        "combined_scope_donut",
        "incompatible_boundaries",
        "No canonical cross-domain share denominator exists.",
    ),
    (
        "combined_daily_technology_spend",
        "missing_canonical_metric",
        "No canonical combined daily series exists.",
    ),
    (
        "next_month_forecast",
        "missing_canonical_metric",
        "No canonical forecast metric exists.",
    ),
    (
        "avoidable_run_rate",
        "browser_derived_value_forbidden",
        "The browser must not create financial values.",
    ),
    (
        "monthly_opportunity_scalar",
        "period_conversion_forbidden",
        "The canonical opportunity aggregate is annual and is not normalized.",
    ),
    (
        "tagging_coverage",
        "missing_canonical_metric",
        "No canonical tagging-coverage metric exists.",
    ),
    (
        "kubernetes_cost_or_utilization",
        "missing_canonical_metric",
        "No canonical Kubernetes metric exists.",
    ),
    (
        "verified_savings",
        "trust_classification_forbidden",
        "The canonical opportunity is estimated, not verified savings.",
    ),
    (
        "realized_savings",
        "trust_classification_forbidden",
        "No realized-savings evidence exists.",
    ),
    (
        "demonstrated_recoverability",
        "insufficient_passing_evidence",
        "Modeled and failed restore evidence do not demonstrate recoverability.",
    ),
    (
        "unknown_as_zero",
        "missing_value_substitution_forbidden",
        "Unknown and missing values must remain null or absent.",
    ),
)


class ProjectionError(ValueError):
    """Deterministic, public-safe projection failure."""


def _fail(message: str) -> None:
    raise ProjectionError(message)


def _text(value: Any, field: str, limit: int = 1000) -> str:
    if not isinstance(value, str) or not value or len(value) > limit:
        _fail(f"{field} must be a nonempty bounded string")
    for character in value:
        category = unicodedata.category(character)
        if category in {"Cc", "Cf"}:
            _fail(f"{field} contains an unsafe control character")
    if "<" in value or ">" in value:
        _fail(f"{field} contains disallowed markup characters")
    return value


def _enum(value: Any, allowed: set[str], field: str) -> str:
    value = _text(value, field, 80)
    if value not in allowed:
        _fail(f"{field} has an unsupported value")
    return value


def _decimal(value: Any, field: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (Decimal, int)):
        _fail(f"{field} must be parsed as an exact decimal or integer")
    decimal = value if isinstance(value, Decimal) else Decimal(value)
    if not decimal.is_finite():
        _fail(f"{field} must be finite")
    return format(decimal, "f")


def _integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(f"{field} must be an integer")
    return value


def _id_list(value: Any, field: str, *, nonempty: bool = False) -> list[str]:
    if not isinstance(value, list) or (nonempty and not value):
        _fail(f"{field} must be an array of canonical IDs")
    result = [_text(item, field, 256) for item in value]
    if len(result) != len(set(result)):
        _fail(f"{field} contains duplicate IDs")
    return result


def _period(value: Any, field: str) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != {"start", "end", "timezone"}:
        _fail(f"{field} is invalid")
    return {
        key: _text(value[key], f"{field}.{key}", 64)
        for key in ("start", "end", "timezone")
    }


def _unique_catalog(items: Any, field: str) -> dict[str, dict[str, Any]]:
    if not isinstance(items, list):
        _fail(f"{field} must be an array")
    result: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            _fail(f"{field} entries must be objects")
        item_id = _text(item.get("id"), f"{field}.id", 256)
        if item_id in result:
            _fail(f"{field} contains a duplicate stable ID")
        result[item_id] = item
    return result


def _sorted_ids(value: Any, field: str) -> list[str]:
    return sorted(_id_list(value, field))


def _validate_projection_policy(
    report: dict[str, Any],
    metrics: dict[str, dict[str, Any]],
    findings: dict[str, dict[str, Any]],
    opportunities: dict[str, dict[str, Any]],
    aggregates: dict[str, dict[str, Any]],
) -> None:
    """Enforce the fixed, human-reviewed ccg-dashboard-view/1.0.0 policy."""
    policy = PROJECTION_POLICY
    if (
        policy.get("policy_schema") != "ccg-dashboard-projection-policy/1.0.0"
        or policy.get("view_schema") != VIEW_SCHEMA
    ):
        _fail("projection policy identity is incompatible")

    source_policy = policy["source_report"]
    if source_policy.get("sha256") != SOURCE_REPORT_SHA256:
        _fail("source report policy digest is incompatible")
    for field in (
        "document_type",
        "contract",
        "mode",
        "status",
        "report_id",
        "run_id",
        "producer",
        "generated_at",
        "period",
    ):
        if report.get(field) != source_policy[field]:
            _fail("source report identity is incompatible with projection policy")

    expected_versions = {
        producer: record["version"] for producer, record in policy["producers"].items()
    }
    included = report.get("included_producers")
    if not isinstance(included, list):
        _fail("producer inventory is incompatible with projection policy")
    actual_versions: dict[str, Any] = {}
    for item in included:
        if not isinstance(item, dict) or item.get("name") in actual_versions:
            _fail("producer inventory is incompatible with projection policy")
        actual_versions[item.get("name")] = item.get("version")
    if actual_versions != expected_versions:
        _fail("producer inventory is incompatible with projection policy")

    expected_metrics_by_producer = {
        producer: set(ids) for producer, ids in policy["metric_ids_by_producer"].items()
    }
    expected_metric_ids = set().union(*expected_metrics_by_producer.values())
    if set(metrics) != expected_metric_ids:
        _fail("metric inventory is incompatible with projection policy")

    sections = report.get("display", {}).get("section_metric_ids")
    if not isinstance(sections, dict) or set(sections) != set(
        expected_metrics_by_producer
    ):
        _fail("metric producer inventory is incompatible with projection policy")
    for producer, expected_ids in expected_metrics_by_producer.items():
        if (
            set(_id_list(sections[producer], f"metric policy section {producer}"))
            != expected_ids
        ):
            _fail("metric producer association is incompatible with projection policy")

    actual_metric_evidence: dict[str, list[str]] = {}
    actual_metric_inputs: dict[str, list[str]] = {}
    metric_owner_by_id: dict[str, str] = {}
    for metric_id, metric in metrics.items():
        metric_owner_by_id[metric_id] = next(
            producer
            for producer, ids in expected_metrics_by_producer.items()
            if metric_id in ids
        )
        input_metric_ids = _sorted_ids(
            metric.get("input_metric_ids", []), f"{metric_id}.input_metric_ids"
        )
        if input_metric_ids:
            actual_metric_inputs[metric_id] = input_metric_ids
        for evidence_id in _sorted_ids(
            metric.get("evidence_ids"), f"{metric_id}.evidence_ids"
        ):
            actual_metric_evidence.setdefault(evidence_id, []).append(metric_id)
    actual_metric_evidence = {
        evidence_id: sorted(metric_ids)
        for evidence_id, metric_ids in actual_metric_evidence.items()
    }
    if (
        actual_metric_inputs != policy["metric_input_relationships"]
        or actual_metric_evidence != policy["metric_evidence_relationships"]
    ):
        _fail("metric relationship graph is incompatible with projection policy")

    expected_findings = policy["finding_relationships"]
    if set(findings) != set(expected_findings):
        _fail("finding inventory is incompatible with projection policy")
    actual_finding_relationships = {
        finding_id: {
            "producer": expected_findings[finding_id]["producer"],
            "metric_ids": _sorted_ids(
                finding.get("metric_ids"), f"{finding_id}.metric_ids"
            ),
            "evidence_ids": _sorted_ids(
                finding.get("evidence_ids"), f"{finding_id}.evidence_ids"
            ),
        }
        for finding_id, finding in findings.items()
    }
    if actual_finding_relationships != expected_findings:
        _fail(
            "finding evidence relationship graph is incompatible with projection policy"
        )

    expected_opportunities = policy["opportunity_relationships"]
    if set(opportunities) != set(expected_opportunities):
        _fail("opportunity inventory is incompatible with projection policy")
    actual_opportunity_relationships = {
        opportunity_id: {
            "producer": opportunity.get("producer", {}).get("name"),
            "evidence_ids": _sorted_ids(
                opportunity.get("evidence_ids"), f"{opportunity_id}.evidence_ids"
            ),
            "related_finding_ids": _sorted_ids(
                opportunity.get("related_finding_ids", []),
                f"{opportunity_id}.related_finding_ids",
            ),
            "related_opportunity_ids": _sorted_ids(
                opportunity.get("related_opportunity_ids", []),
                f"{opportunity_id}.related_opportunity_ids",
            ),
        }
        for opportunity_id, opportunity in opportunities.items()
    }
    if actual_opportunity_relationships != expected_opportunities:
        _fail(
            "opportunity evidence relationship graph is incompatible with projection policy"
        )

    expected_aggregates = policy["aggregate_relationships"]
    if set(aggregates) != set(expected_aggregates):
        _fail("aggregate inventory is incompatible with projection policy")
    actual_aggregates = {
        aggregate_id: {
            "opportunity_ids": _sorted_ids(
                aggregate.get("opportunity_ids"), f"{aggregate_id}.opportunity_ids"
            ),
            "excluded_opportunity_ids": _sorted_ids(
                aggregate.get("excluded_opportunity_ids", []),
                f"{aggregate_id}.excluded_opportunity_ids",
            ),
        }
        for aggregate_id, aggregate in aggregates.items()
    }
    if actual_aggregates != expected_aggregates:
        _fail("aggregate relationship graph is incompatible with projection policy")

    actual_evidence_by_producer = {
        producer: set() for producer in expected_metrics_by_producer
    }
    for evidence_id, metric_ids in actual_metric_evidence.items():
        producers = {metric_owner_by_id[metric_id] for metric_id in metric_ids}
        if len(producers) != 1:
            _fail("metric evidence producer association is incompatible")
        actual_evidence_by_producer[producers.pop()].add(evidence_id)
    for relationship in actual_finding_relationships.values():
        actual_evidence_by_producer[relationship["producer"]].update(
            relationship["evidence_ids"]
        )
    for relationship in actual_opportunity_relationships.values():
        actual_evidence_by_producer[relationship["producer"]].update(
            relationship["evidence_ids"]
        )
    if {
        producer: sorted(ids) for producer, ids in actual_evidence_by_producer.items()
    } != policy["evidence_ids_by_producer"]:
        _fail("evidence inventory is incompatible with projection policy")

    provenance = report.get("provenance")
    expected_hashes = {
        producer: record["artifact"]["sha256"]
        for producer, record in policy["producers"].items()
    }
    if not isinstance(provenance, dict) or provenance != {
        "manifest_sha256": policy["manifest"]["sha256"],
        "artifact_sha256s": expected_hashes,
    }:
        _fail("artifact provenance is incompatible with projection policy")

    display = report.get("display")
    if not isinstance(display, dict):
        _fail("display policy is invalid")
    expected_display = policy["display"]
    for field in ("headline_metric_ids", "finding_ids", "opportunity_aggregate_ids"):
        if (
            _sorted_ids(display.get(field), f"display.{field}")
            != expected_display[field]
        ):
            _fail("display identity is incompatible with projection policy")
    if display.get("disclosures") != expected_display["disclosures"]:
        _fail("required disclosures are incompatible with projection policy")

    quality_items = report.get("producer_quality")
    if not isinstance(quality_items, list):
        _fail("quality relationship inventory is incompatible with projection policy")
    actual_quality: dict[str, dict[str, Any]] = {}
    for item in quality_items:
        producer = (
            item.get("producer", {}).get("name") if isinstance(item, dict) else None
        )
        quality = item.get("quality") if isinstance(item, dict) else None
        if producer in actual_quality or not isinstance(quality, dict):
            _fail(
                "quality relationship inventory is incompatible with projection policy"
            )
        issues = quality.get("issues")
        if not isinstance(issues, list):
            _fail(
                "quality relationship inventory is incompatible with projection policy"
            )
        actual_quality[producer] = {
            "status": quality.get("status"),
            "issues": sorted(
                (
                    {
                        "code": issue.get("code"),
                        "source_id": issue.get("source_id"),
                        "field": issue.get("field"),
                    }
                    for issue in issues
                    if isinstance(issue, dict)
                ),
                key=lambda issue: issue["code"] or "",
            ),
        }
        if len(actual_quality[producer]["issues"]) != len(issues):
            _fail(
                "quality relationship inventory is incompatible with projection policy"
            )
    expected_quality = {
        producer: {
            "status": quality["status"],
            "issues": sorted(quality["issues"], key=lambda issue: issue["code"]),
        }
        for producer, quality in policy["quality_relationships"].items()
    }
    if actual_quality != expected_quality:
        _fail("quality relationship graph is incompatible with projection policy")

    reconciliation = report.get("reconciliation")
    if not isinstance(reconciliation, list):
        _fail(
            "reconciliation relationship inventory is incompatible with projection policy"
        )
    actual_reconciliation: dict[str, dict[str, Any]] = {}
    for item in reconciliation:
        if not isinstance(item, dict) or item.get("id") in actual_reconciliation:
            _fail(
                "reconciliation relationship inventory is incompatible with projection policy"
            )
        actual_reconciliation[item.get("id")] = {
            "input_metric_ids": _sorted_ids(
                item.get("input_metric_ids"), "reconciliation.input_metric_ids"
            ),
            "output_metric_id": item.get("output_metric_id"),
        }
    if actual_reconciliation != policy["reconciliation_relationships"]:
        _fail(
            "reconciliation relationship graph is incompatible with projection policy"
        )

    if [concept for concept, _, _ in UNSUPPORTED] != policy["unsupported_concepts"]:
        _fail("unsupported registry is incompatible with projection policy")


def _metric_owner(metric_id: str) -> str:
    prefixes = {
        "metric.cloud.": "finops-lite",
        "metric.anomaly.": "finops-watchdog",
        "metric.resilience.": "recovery-economics",
        "metric.ai.": "ai-cost-lens",
        "metric.saas.": "saas-cost-analyzer",
    }
    matches = [
        producer
        for prefix, producer in prefixes.items()
        if metric_id.startswith(prefix)
    ]
    if len(matches) != 1:
        _fail("metric ID has no supported producer association")
    return matches[0]


def _finding_owner(finding_id: str) -> str:
    prefixes = {
        "finding.anomaly.": "finops-watchdog",
        "finding.resilience-gap.": "recovery-economics",
        "finding.allocation.": "ai-cost-lens",
        "finding.saas.": "saas-cost-analyzer",
    }
    matches = [
        producer
        for prefix, producer in prefixes.items()
        if finding_id.startswith(prefix)
    ]
    if len(matches) != 1:
        _fail("finding ID has no supported producer association")
    return matches[0]


def _expected_evidence_prefix(producer: str) -> str:
    return {
        "finops-lite": "evidence.finops-lite.",
        "finops-watchdog": "evidence.finops-watchdog.",
        "recovery-economics": "evidence.recovery-economics.",
        "ai-cost-lens": "evidence.ai-cost-lens.",
        "saas-cost-analyzer": "evidence.saas-governance.",
    }[producer]


def _trace(producer: str, source_id: str, record: dict[str, Any]) -> dict[str, Any]:
    evidence_ids = _id_list(
        record.get("evidence_ids"), f"{source_id}.evidence_ids", nonempty=True
    )
    if any(
        not evidence_id.startswith(_expected_evidence_prefix(producer))
        for evidence_id in evidence_ids
    ):
        _fail("record has a broken evidence reference")
    return {
        "canonical_id": source_id,
        "producer": {"name": producer, "version": EXPECTED_PRODUCERS[producer]},
        "source_artifact": ARTIFACT_NAMES[producer],
        "basis": (
            _enum(record.get("basis"), ALLOWED_BASES, f"{source_id}.basis")
            if "basis" in record
            else None
        ),
        "quality": (
            _enum(
                record.get("quality_status"),
                ALLOWED_QUALITY,
                f"{source_id}.quality_status",
            )
            if "quality_status" in record
            else None
        ),
        "currency": (
            _text(record["currency"], f"{source_id}.currency", 16)
            if record.get("currency") is not None
            else None
        ),
        "unit": (
            _text(record["unit"], f"{source_id}.unit", 80)
            if record.get("unit") is not None
            else None
        ),
        "period": (
            _period(record["period"], f"{source_id}.period")
            if "period" in record
            else None
        ),
        "additivity": (
            _enum(
                record.get("additivity"), ALLOWED_ADDITIVITY, f"{source_id}.additivity"
            )
            if "additivity" in record
            else None
        ),
        "formula": (
            _text(record["formula"], f"{source_id}.formula", 2000)
            if record.get("formula") is not None
            else None
        ),
        "input_metric_ids": _id_list(
            record.get("input_metric_ids", []), f"{source_id}.input_metric_ids"
        ),
        "evidence_ids": evidence_ids,
    }


def _expected_metric_policy(
    metric_id: str,
) -> tuple[str, str, str, str | None, str, str, str]:
    """Return basis, quality, additivity, currency, unit, start, and end."""
    if metric_id == "metric.cloud.total":
        return (
            "observed",
            "valid",
            "additive",
            "USD",
            "currency",
            "2026-07-01",
            "2026-07-22",
        )
    if metric_id == "metric.cloud.previous-total":
        return (
            "observed",
            "valid",
            "additive",
            "USD",
            "currency",
            "2026-07-01",
            "2026-07-22",
        )
    if metric_id == "metric.cloud.change-amount":
        return (
            "calculated",
            "valid",
            "non_additive",
            "USD",
            "currency",
            "2026-07-01",
            "2026-07-22",
        )
    if metric_id == "metric.cloud.change-percentage":
        return (
            "calculated",
            "valid",
            "ratio",
            None,
            "percent",
            "2026-07-01",
            "2026-07-22",
        )
    if metric_id.startswith("metric.cloud.service.") and ".day." not in metric_id:
        return (
            "observed",
            "valid",
            "additive",
            "USD",
            "currency",
            "2026-07-01",
            "2026-07-22",
        )
    if metric_id.startswith("metric.cloud.") and ".day." in metric_id:
        try:
            day = metric_id.split(".day.", 1)[1].rsplit(".cost", 1)[0]
            end = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
        except (ValueError, IndexError) as exc:
            raise ProjectionError("daily cloud metric ID is invalid") from exc
        return ("observed", "valid", "additive", "USD", "currency", day, end)
    if metric_id.startswith("metric.anomaly."):
        suffix = metric_id.rsplit(".", 1)[-1]
        policy = {
            "observed": ("observed", "additive", "USD", "currency"),
            "expected": ("calculated", "additive", "USD", "currency"),
            "impact": ("calculated", "additive", "USD", "currency"),
            "change-percent": ("calculated", "non_additive", None, "percent"),
            "robust-score": ("calculated", "non_additive", None, "score"),
        }.get(suffix)
        if policy is None:
            _fail("anomaly metric role is unsupported")
        return (
            policy[0],
            "valid",
            policy[1],
            policy[2],
            policy[3],
            "2026-07-21",
            "2026-07-22",
        )
    if metric_id.startswith("metric.resilience."):
        suffix = metric_id.split("metric.resilience.orders-db.", 1)[-1]
        observed = {"tested-restore-duration-hours", "tested-recovered-point-age-hours"}
        additive = {
            "monthly-design-cost",
            "monthly-storage-cost",
            "monthly-backup-request-cost",
            "expected-monthly-recovery-cost",
            "expected-monthly-outage-exposure",
            "expected-monthly-economic-exposure",
        }
        units = {
            "effective-stored-gb": (None, "GB"),
            "modeled-rto-hours": (None, "hours"),
            "modeled-rpo-hours": (None, "hours"),
            "tested-restore-duration-hours": (None, "hours"),
            "tested-recovered-point-age-hours": (None, "hours"),
        }
        currency, unit = units.get(suffix, ("USD", "currency"))
        return (
            "observed" if suffix in observed else "estimated",
            "valid",
            "additive" if suffix in additive else "non_additive",
            currency,
            unit,
            "2026-08-01",
            "2026-09-01",
        )
    if metric_id.startswith("metric.ai."):
        if metric_id == "metric.ai.total-cost":
            return (
                "calculated",
                "valid",
                "non_additive",
                "USD",
                "currency",
                "2026-07-01",
                "2026-07-03",
            )
        suffix = metric_id.rsplit(".", 1)[-1]
        if suffix == "cost":
            basis = "observed" if ".bedrock-" in metric_id else "calculated"
            return (
                basis,
                "valid",
                "additive",
                "USD",
                "currency",
                "2026-07-01",
                "2026-07-03",
            )
        if suffix in {
            "uncached-input-tokens",
            "cached-input-tokens",
            "output-tokens",
            "reasoning-tokens",
        }:
            return (
                "observed",
                "valid",
                "additive",
                None,
                "tokens",
                "2026-07-01",
                "2026-07-03",
            )
        if suffix == "requests":
            return (
                "observed",
                "valid",
                "additive",
                None,
                "requests",
                "2026-07-01",
                "2026-07-03",
            )
        if suffix == "cost-per-million-tokens":
            return (
                "calculated",
                "valid",
                "ratio",
                "USD",
                "currency_per_million_tokens",
                "2026-07-01",
                "2026-07-03",
            )
        if suffix == "cost-per-request":
            return (
                "calculated",
                "valid",
                "ratio",
                "USD",
                "currency_per_request",
                "2026-07-01",
                "2026-07-03",
            )
        _fail("AI metric role is unsupported")
    if metric_id.startswith("metric.saas."):
        suffix = metric_id.rsplit(".", 1)[-1]
        application = "crm" if ".crm-" in metric_id else "design"
        period = ("2026-07-31", "2026-08-01")
        if suffix == "invoice-cost":
            period = (
                ("2026-01-01", "2027-01-01")
                if application == "crm"
                else ("2026-07-01", "2026-10-01")
            )
            return ("observed", "valid", "additive", "USD", "currency", *period)
        if suffix in {"purchased-seats", "assigned-seats"}:
            return ("observed", "valid", "additive", None, "seats", *period)
        if suffix in {
            "active-seats",
            "inactive-seats",
            "unknown-activity-seats",
            "unassigned-seats",
        }:
            quality = (
                "partial"
                if application == "design" and suffix == "unassigned-seats"
                else "valid"
            )
            basis = "unknown" if quality == "partial" else "calculated"
            return (basis, quality, "additive", None, "seats", *period)
        if suffix == "utilization-percentage":
            quality = "partial" if application == "design" else "valid"
            basis = "unknown" if quality == "partial" else "calculated"
            return (basis, quality, "additive", None, "percent", *period)
        if suffix == "unit-price":
            return (
                "observed",
                "valid",
                "non_additive",
                "USD",
                "currency_per_seat_per_billing_cadence",
                *period,
            )
        if suffix == "commitment":
            return ("observed", "valid", "non_additive", "USD", "currency", *period)
        if suffix in {"monthly-commitment", "annualized-commitment"}:
            return ("calculated", "valid", "non_additive", "USD", "currency", *period)
        if suffix == "annual-reduction-capacity":
            quality = "partial" if application == "design" else "valid"
            basis = "unknown" if quality == "partial" else "estimated"
            return (basis, quality, "non_additive", "USD", "currency", *period)
        _fail("SaaS metric role is unsupported")
    _fail("metric policy is unsupported")


def _metric_record(
    metric: dict[str, Any], producer: str, metric_ids: set[str]
) -> dict[str, Any]:
    metric_id = _text(metric.get("id"), "metric.id", 256)
    if _metric_owner(metric_id) != producer:
        _fail("metric is associated with the wrong producer")
    trace = _trace(producer, metric_id, metric)
    expected_policy = _expected_metric_policy(metric_id)
    actual_policy = (
        trace["basis"],
        trace["quality"],
        trace["additivity"],
        trace["currency"],
        trace["unit"],
        trace["period"]["start"],
        trace["period"]["end"],
    )
    if actual_policy != expected_policy:
        _fail(
            "metric basis, quality, additivity, currency, unit, or period is incompatible"
        )
    if any(item not in metric_ids for item in trace["input_metric_ids"]):
        _fail("metric has a broken input-metric reference")
    dimensions = metric.get("dimensions")
    if not isinstance(dimensions, dict):
        _fail("metric dimensions must be an object")
    safe_dimensions = {
        _text(key, f"{metric_id}.dimension-key", 80): _text(
            value, f"{metric_id}.dimension", 300
        )
        for key, value in sorted(dimensions.items())
    }
    value = _decimal(metric.get("value"), f"{metric_id}.value")
    unknown_reason = metric.get("unknown_reason")
    if value is None and unknown_reason is None:
        _fail("missing metric value requires an unknown reason")
    if value is not None and unknown_reason is not None:
        _fail("known metric value must not carry an unknown reason")
    if trace["basis"] == "unknown" and value is not None:
        _fail("unknown metric value must remain missing")
    if trace["basis"] != "unknown" and value is None:
        _fail("known metric basis must not become missing")
    return {
        "id": metric_id,
        "name": _text(metric.get("name"), f"{metric_id}.name", 300),
        "value": value,
        "unknown_reason": (
            _text(unknown_reason, f"{metric_id}.unknown_reason", 500)
            if unknown_reason is not None
            else None
        ),
        "dimensions": safe_dimensions,
        "trace": trace,
    }


def _finding_record(
    finding: dict[str, Any], producer: str, metric_ids: set[str], quality: str
) -> dict[str, Any]:
    finding_id = _text(finding.get("id"), "finding.id", 256)
    if _finding_owner(finding_id) != producer:
        _fail("finding is associated with the wrong producer")
    finding_type = _enum(
        finding.get("finding_type"), ALLOWED_FINDING_TYPES, f"{finding_id}.finding_type"
    )
    expected_type = {
        "finops-watchdog": "anomaly",
        "recovery-economics": "resilience_gap",
        "ai-cost-lens": "allocation",
        "saas-cost-analyzer": "data_quality",
    }[producer]
    if finding_type != expected_type:
        _fail("finding type does not match its stable ID")
    linked_metrics = _id_list(
        finding.get("metric_ids"), f"{finding_id}.metric_ids", nonempty=True
    )
    if any(metric_id not in metric_ids for metric_id in linked_metrics):
        _fail("finding has a broken metric reference")
    evidence_ids = _id_list(
        finding.get("evidence_ids"), f"{finding_id}.evidence_ids", nonempty=True
    )
    if any(
        not item.startswith(_expected_evidence_prefix(producer))
        for item in evidence_ids
    ):
        _fail("finding has a broken evidence reference")
    return {
        "id": finding_id,
        "producer": {"name": producer, "version": EXPECTED_PRODUCERS[producer]},
        "type": finding_type,
        "title": _text(finding.get("title"), f"{finding_id}.title", 300),
        "status": _enum(
            finding.get("status"), {"open", "closed"}, f"{finding_id}.status"
        ),
        "severity": _enum(
            finding.get("severity"),
            {"low", "medium", "high", "critical"},
            f"{finding_id}.severity",
        ),
        "context": _text(finding.get("description"), f"{finding_id}.description", 2000),
        "first_observed_at": _text(
            finding.get("first_observed_at"), f"{finding_id}.first_observed_at", 64
        ),
        "last_observed_at": _text(
            finding.get("last_observed_at"), f"{finding_id}.last_observed_at", 64
        ),
        "metric_ids": linked_metrics,
        "evidence_ids": evidence_ids,
        "quality": quality,
        "trace": {
            "canonical_id": finding_id,
            "producer": {"name": producer, "version": EXPECTED_PRODUCERS[producer]},
            "source_artifact": ARTIFACT_NAMES[producer],
            "metric_ids": linked_metrics,
            "evidence_ids": evidence_ids,
        },
    }


def project_dashboard_view(report: Any) -> dict[str, Any]:
    """Project one already parsed and fully validated trusted report."""
    if not isinstance(report, dict):
        _fail("trusted report must be an object")
    expected_identity = {
        "document_type": "trusted_report",
        "contract": "ccac/1.0.0",
        "mode": "illustrative",
        "status": "complete",
        "report_id": "report.tech-spend.trusted",
    }
    for field, expected in expected_identity.items():
        if report.get(field) != expected:
            _fail(f"trusted report {field} is incompatible")
    if report.get("producer") != {
        "name": "tech-spend-command-center",
        "version": "0.2.1",
    }:
        _fail("trusted report producer is incompatible")

    included = report.get("included_producers")
    if not isinstance(included, list) or len(included) != 5:
        _fail("producer inventory is invalid")
    included_map: dict[str, str] = {}
    for item in included:
        if not isinstance(item, dict):
            _fail("producer inventory entry is invalid")
        name = _text(item.get("name"), "producer.name", 80)
        version = _text(item.get("version"), "producer.version", 40)
        if name in included_map:
            _fail("producer inventory contains a duplicate")
        included_map[name] = version
    if included_map != EXPECTED_PRODUCERS:
        _fail("producer inventory versions are incompatible")

    metrics = _unique_catalog(report.get("metric_catalog"), "metric_catalog")
    findings = _unique_catalog(report.get("finding_catalog"), "finding_catalog")
    opportunities = _unique_catalog(
        report.get("opportunity_catalog"), "opportunity_catalog"
    )
    aggregates = _unique_catalog(
        report.get("opportunity_aggregates"), "opportunity_aggregates"
    )
    _validate_projection_policy(report, metrics, findings, opportunities, aggregates)
    if (
        len(metrics) != 155
        or len(findings) != 10
        or len(opportunities) != 1
        or len(aggregates) != 1
    ):
        _fail("canonical catalog counts are incompatible")

    display = report.get("display")
    if not isinstance(display, dict):
        _fail("display registry is invalid")
    if set(display) != {
        "headline_metric_ids",
        "section_metric_ids",
        "finding_ids",
        "opportunity_aggregate_ids",
        "disclosures",
    }:
        _fail("display registry contains an unsupported concept")
    if _id_list(display.get("headline_metric_ids"), "display.headline_metric_ids") != [
        "metric.cloud.total",
        "metric.ai.total-cost",
        "metric.saas.crm-9261ceef.invoice-cost",
        "metric.saas.design-a77de8a6.invoice-cost",
    ]:
        _fail("headline metric registry is incompatible")
    if _id_list(
        display.get("opportunity_aggregate_ids"), "display.opportunity_aggregate_ids"
    ) != ["aggregate.opportunities.annual.usd"]:
        _fail("opportunity aggregate display registry is incompatible")
    sections = display.get("section_metric_ids")
    if not isinstance(sections, dict) or set(sections) != set(EXPECTED_PRODUCERS):
        _fail("metric display sections are invalid")
    displayed_metric_ids: list[str] = []
    for producer, ids in sections.items():
        section_ids = _id_list(ids, f"display.section_metric_ids.{producer}")
        for metric_id in section_ids:
            if metric_id not in metrics or _metric_owner(metric_id) != producer:
                _fail("display metric has a wrong producer association")
        displayed_metric_ids.extend(section_ids)
    if len(displayed_metric_ids) != len(set(displayed_metric_ids)) or set(
        displayed_metric_ids
    ) != set(metrics):
        _fail("display metric registry does not account for the canonical catalog")

    provenance = report.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("artifact_sha256s") is None:
        _fail("report provenance is invalid")
    artifact_hashes = provenance["artifact_sha256s"]
    if not isinstance(artifact_hashes, dict) or set(artifact_hashes) != set(
        EXPECTED_PRODUCERS
    ):
        _fail("artifact provenance is incomplete")

    quality_items = report.get("producer_quality")
    if not isinstance(quality_items, list) or len(quality_items) != 5:
        _fail("producer quality inventory is invalid")
    quality_by_producer: dict[str, dict[str, Any]] = {}
    for item in quality_items:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("producer"), dict)
            or not isinstance(item.get("quality"), dict)
        ):
            _fail("producer quality entry is invalid")
        producer = item["producer"].get("name")
        if producer in quality_by_producer or item["producer"].get(
            "version"
        ) != EXPECTED_PRODUCERS.get(producer):
            _fail("producer quality association is invalid")
        quality_by_producer[producer] = item["quality"]
    if set(quality_by_producer) != set(EXPECTED_PRODUCERS):
        _fail("producer quality record is missing")

    producer_records = []
    for producer in sorted(EXPECTED_PRODUCERS):
        quality = quality_by_producer[producer]
        status = _enum(
            quality.get("status"), ALLOWED_QUALITY, f"{producer}.quality.status"
        )
        issues = quality.get("issues")
        if not isinstance(issues, list):
            _fail("producer quality issues must be an array")
        safe_issues = []
        for issue in sorted(
            issues,
            key=lambda value: value.get("code", "") if isinstance(value, dict) else "",
        ):
            if not isinstance(issue, dict):
                _fail("producer quality issue is invalid")
            safe_issues.append(
                {
                    "code": _text(issue.get("code"), "quality issue code", 256),
                    "severity": _enum(
                        issue.get("severity"),
                        {"info", "warning", "error"},
                        "quality issue severity",
                    ),
                    "message": _text(
                        issue.get("message"), "quality issue message", 1000
                    ),
                    "source_id": _text(
                        issue.get("source_id"), "quality issue source", 256
                    ),
                    "field": _text(issue.get("field"), "quality issue field", 300),
                    "row_count": (
                        _integer(issue["row_count"], "quality issue row_count")
                        if issue.get("row_count") is not None
                        else None
                    ),
                }
            )
        producer_records.append(
            {
                "name": producer,
                "version": EXPECTED_PRODUCERS[producer],
                "quality": {"status": status, "issues": safe_issues},
                "source": {
                    "artifact": ARTIFACT_NAMES[producer],
                    "artifact_sha256": _text(
                        artifact_hashes[producer], f"{producer}.artifact_sha256", 64
                    ),
                },
            }
        )
    if quality_by_producer["saas-cost-analyzer"].get("status") != "partial":
        _fail("SaaS partial quality must remain visible")

    metric_ids = set(metrics)
    metric_records = {
        metric_id: _metric_record(metric, _metric_owner(metric_id), metric_ids)
        for metric_id, metric in metrics.items()
    }
    finding_ids = _id_list(
        display.get("finding_ids"), "display.finding_ids", nonempty=True
    )
    if len(finding_ids) != 10 or set(finding_ids) != set(findings):
        _fail("display finding registry is incomplete")
    finding_records = [
        _finding_record(
            findings[item],
            _finding_owner(item),
            metric_ids,
            _enum(
                quality_by_producer[_finding_owner(item)].get("status"),
                ALLOWED_QUALITY,
                "finding producer quality",
            ),
        )
        for item in finding_ids
    ]

    cloud_ids = sections["finops-lite"]
    cloud_total_id = "metric.cloud.total"
    required_cloud = {
        cloud_total_id,
        "metric.cloud.previous-total",
        "metric.cloud.change-amount",
        "metric.cloud.change-percentage",
    }
    if not required_cloud.issubset(cloud_ids):
        _fail("required cloud metric is missing")
    cloud_services = sorted(
        item
        for item in cloud_ids
        if item.startswith("metric.cloud.service.") and ".day." not in item
    )
    cloud_daily = sorted(
        (item for item in cloud_ids if item.startswith("metric.cloud.day.")),
        key=lambda item: (metric_records[item]["trace"]["period"]["start"], item),
    )

    ai_ids = sections["ai-cost-lens"]
    if "metric.ai.total-cost" not in ai_ids:
        _fail("required AI total metric is missing")
    ai_records = [metric_records[item] for item in sorted(ai_ids)]

    saas_invoice_ids = sorted(
        item
        for item in sections["saas-cost-analyzer"]
        if item.endswith(".invoice-cost")
    )
    if len(saas_invoice_ids) != 2:
        _fail("canonical SaaS invoice set is incompatible")

    anomaly_findings = [item for item in finding_records if item["type"] == "anomaly"]
    anomalies = []
    for finding in anomaly_findings:
        role_ids = {item.rsplit(".", 1)[-1]: item for item in finding["metric_ids"]}
        if set(role_ids) != {
            "observed",
            "expected",
            "impact",
            "change-percent",
            "robust-score",
        }:
            _fail("anomaly metric roles are incomplete")
        anomalies.append(
            {
                "finding": finding,
                "observed": metric_records[role_ids["observed"]],
                "expected": metric_records[role_ids["expected"]],
                "impact": metric_records[role_ids["impact"]],
                "percentage_change": metric_records[role_ids["change-percent"]],
                "score": metric_records[role_ids["robust-score"]],
                "impact_classification": "anomaly_impact_not_savings",
            }
        )

    opportunity_id = "opportunity.saas.crm-9261ceef.renewal-seat-review"
    aggregate_id = "aggregate.opportunities.annual.usd"
    if set(opportunities) != {opportunity_id} or set(aggregates) != {aggregate_id}:
        _fail("canonical opportunity IDs are incompatible")
    opportunity = opportunities[opportunity_id]
    aggregate = aggregates[aggregate_id]
    if opportunity.get("producer") != {
        "name": "saas-cost-analyzer",
        "version": "0.2.0",
    }:
        _fail("opportunity producer is incompatible")
    estimate = opportunity.get("estimate")
    review = opportunity.get("review")
    overlap = opportunity.get("overlap")
    if (
        not isinstance(estimate, dict)
        or not isinstance(review, dict)
        or not isinstance(overlap, dict)
    ):
        _fail("opportunity trust metadata is invalid")
    if (
        estimate.get("basis") != "estimated"
        or estimate.get("period") != "annual"
        or opportunity.get("confidence") != "low"
    ):
        _fail("opportunity classification is incompatible")
    if aggregate.get("period") != "annual" or aggregate.get("currency") != estimate.get(
        "currency"
    ):
        _fail("opportunity aggregate period or currency is incompatible")
    if (
        aggregate.get("opportunity_ids") != [opportunity_id]
        or overlap.get("disposition") != "none_known"
    ):
        _fail("opportunity overlap/additivity policy is incompatible")
    required_review = (
        "required",
        "approval_required",
        "rollback_plan_required",
        "verification_required",
    )
    if any(review.get(field) is not True for field in required_review):
        _fail("opportunity review safeguards are incomplete")
    review_steps = review.get("non_mutating_review_steps")
    if not isinstance(review_steps, list) or not review_steps:
        _fail("opportunity review steps are invalid")
    for step in review_steps:
        _text(step, "opportunity review step", 500)
    evidence_ids = _id_list(
        opportunity.get("evidence_ids"), "opportunity.evidence_ids", nonempty=True
    )
    if any(
        not item.startswith(_expected_evidence_prefix("saas-cost-analyzer"))
        for item in evidence_ids
    ):
        _fail("opportunity evidence reference is invalid")

    source_opportunity = {
        "id": opportunity_id,
        "producer": opportunity["producer"],
        "type": _text(opportunity.get("opportunity_type"), "opportunity.type", 80),
        "title": _text(opportunity.get("title"), "opportunity.title", 300),
        "status": _enum(
            opportunity.get("status"),
            {"identified", "under_review", "approved"},
            "opportunity.status",
        ),
        "confidence": "low",
        "estimate": {
            "basis": "estimated",
            "period": "annual",
            "low": _decimal(estimate.get("low"), "opportunity.low"),
            "expected": _decimal(estimate.get("expected"), "opportunity.expected"),
            "high": _decimal(estimate.get("high"), "opportunity.high"),
            "currency": _text(estimate.get("currency"), "opportunity.currency", 16),
            "formula": _text(estimate.get("formula"), "opportunity.formula", 2000),
        },
        "overlap": {
            "disposition": "none_known",
            "group_id": _text(
                overlap.get("group_id"), "opportunity.overlap.group_id", 256
            ),
            "reason": _text(overlap.get("reason"), "opportunity.overlap.reason", 1000),
        },
        "review": {**{field: True for field in required_review}},
        "evidence_ids": evidence_ids,
        "trace": {
            "canonical_id": opportunity_id,
            "producer": opportunity["producer"],
            "source_artifact": ARTIFACT_NAMES["saas-cost-analyzer"],
            "evidence_ids": evidence_ids,
        },
    }
    opportunity_aggregate = {
        "id": aggregate_id,
        "label": _text(aggregate.get("label"), "aggregate.label", 300),
        "period": "annual",
        "low": _decimal(aggregate.get("low"), "aggregate.low"),
        "expected": _decimal(aggregate.get("expected"), "aggregate.expected"),
        "high": _decimal(aggregate.get("high"), "aggregate.high"),
        "currency": _text(aggregate.get("currency"), "aggregate.currency", 16),
        "basis": "estimated",
        "confidence": "low",
        "status": source_opportunity["status"],
        "opportunity_ids": [opportunity_id],
        "inclusion_rule": _text(
            aggregate.get("inclusion_rule"), "aggregate.inclusion_rule", 2500
        ),
        "review": source_opportunity["review"],
        "trace": {
            "canonical_id": aggregate_id,
            "producer": {"name": "tech-spend-command-center", "version": "0.2.1"},
            "source_artifact": "report.json",
            "source_opportunity_ids": [opportunity_id],
            "evidence_ids": evidence_ids,
        },
    }

    disclosures = display.get("disclosures")
    if not isinstance(disclosures, list) or len(disclosures) < 5:
        _fail("required disclosures are missing")
    safe_disclosures = [_text(item, "display disclosure", 1000) for item in disclosures]
    return {
        "schema": VIEW_SCHEMA,
        "identity": {
            "mode": "illustrative",
            "status": "complete",
            "contract": "ccac/1.0.0",
            "run_id": _text(report.get("run_id"), "run_id", 80),
            "report_id": "report.tech-spend.trusted",
            "command_center_version": "0.2.1",
            "generated_at": _text(report.get("generated_at"), "generated_at", 64),
            "report_period": _period(report.get("period"), "report.period"),
            "source_report_sha256": SOURCE_REPORT_SHA256,
            "disclosures": safe_disclosures,
        },
        "source_metadata": {
            "catalog_counts": {
                "metrics": 155,
                "findings": 10,
                "opportunities": 1,
                "opportunity_aggregates": 1,
            },
            "manifest_sha256": _text(
                provenance.get("manifest_sha256"), "manifest_sha256", 64
            ),
            "artifact_sha256s": {
                key: _text(value, f"artifact_sha256s.{key}", 64)
                for key, value in sorted(artifact_hashes.items())
            },
        },
        "producers": producer_records,
        "cloud": {
            "total": metric_records[cloud_total_id],
            "comparison": [
                metric_records[item]
                for item in (
                    "metric.cloud.previous-total",
                    "metric.cloud.change-amount",
                    "metric.cloud.change-percentage",
                )
            ],
            "services": [metric_records[item] for item in cloud_services],
            "daily": [metric_records[item] for item in cloud_daily],
        },
        "ai": {
            "total": metric_records["metric.ai.total-cost"],
            "metrics": ai_records,
            "unattributed_findings": [
                item for item in finding_records if item["type"] == "allocation"
            ],
            "cross_domain_additivity": "non_additive",
        },
        "saas": {
            "invoice_metrics": [metric_records[item] for item in saas_invoice_ids],
            "combined_total": None,
        },
        "findings": finding_records,
        "anomalies": anomalies,
        "resilience": {
            "findings": [
                item for item in finding_records if item["type"] == "resilience_gap"
            ],
            "modeled_metrics": [
                metric_records[item]
                for item in sorted(sections["recovery-economics"])
                if metric_records[item]["trace"]["basis"] == "estimated"
            ],
            "observed_restore_metrics": [
                metric_records[item]
                for item in sorted(sections["recovery-economics"])
                if metric_records[item]["trace"]["basis"] == "observed"
            ],
            "recoverability_classification": "not_demonstrated",
        },
        "opportunity": {
            "source": source_opportunity,
            "annual_aggregate": opportunity_aggregate,
        },
        "unsupported": [
            {"concept": concept, "reason_code": code, "explanation": explanation}
            for concept, code, explanation in UNSUPPORTED
        ],
    }
