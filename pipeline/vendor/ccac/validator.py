from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .errors import ErrorCode, ValidationIssue
from .schema import validate_structure
from .semantic import validate_semantics


CANONICAL_SCOPE_FIELDS = (
    "id", "value", "unit", "currency", "basis", "additivity", "period", "formula",
    "input_metric_ids", "evidence_ids", "quality_status", "accounting_boundary",
)
ANALYTICAL_PRODUCERS = frozenset({
    "finops-lite", "finops-watchdog", "recovery-economics", "ai-cost-lens", "saas-cost-analyzer",
})


def load_json(path: Path) -> tuple[dict[str, Any] | None, list[ValidationIssue]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return None, [ValidationIssue(ErrorCode.INVALID_JSON, str(exc), str(path))]
    if not isinstance(value, dict):
        return None, [ValidationIssue(ErrorCode.INVALID_JSON, "Top-level JSON value must be an object", str(path))]
    return value, []


def validate_document(document: dict[str, Any]) -> list[ValidationIssue]:
    structural = validate_structure(document)
    if structural:
        return structural
    return validate_semantics(document)


def validate_file(path: Path) -> list[ValidationIssue]:
    document, issues = load_json(path)
    return issues if issues else validate_document(document or {})


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_run_directory(run_directory: Path) -> list[ValidationIssue]:
    manifest_path = run_directory / "manifest.json"
    if not manifest_path.is_file():
        return [ValidationIssue(ErrorCode.MANIFEST_MISSING, "Run directory does not contain manifest.json", str(manifest_path))]
    manifest, issues = load_json(manifest_path)
    if issues:
        return issues
    assert manifest is not None
    issues.extend(validate_document(manifest))
    if issues:
        return issues

    run_id = manifest["run_id"]
    mode = manifest["mode"]
    contract = manifest["contract"]
    produced_records: list[dict[str, Any]] = []
    for index, artifact in enumerate(manifest.get("artifacts", [])):
        if artifact.get("status") != "produced":
            continue
        relative_path = artifact["relative_path"]
        artifact_path = run_directory / relative_path
        path = f"$.artifacts[{index}]"
        if not artifact_path.is_file():
            issues.append(ValidationIssue(ErrorCode.ARTIFACT_MISSING, f"Artifact is missing: {relative_path}", path))
            if artifact.get("contract_valid"):
                issues.append(ValidationIssue(ErrorCode.MANIFEST_ARTIFACT_METADATA_MISMATCH, "Missing artifact cannot be marked contract-valid", path))
            continue
        actual_hash = _sha256(artifact_path)
        if actual_hash != artifact["content_sha256"]:
            issues.append(ValidationIssue(ErrorCode.ARTIFACT_HASH_MISMATCH, f"Artifact hash mismatch for {relative_path}", path, {"expected": artifact["content_sha256"], "actual": actual_hash}))
            issues.append(ValidationIssue(ErrorCode.MANIFEST_ARTIFACT_METADATA_MISMATCH, "Manifest content hash does not match the produced artifact", path))
            continue
        document, load_issues = load_json(artifact_path)
        issues.extend(load_issues)
        if document is None:
            if artifact.get("contract_valid"):
                issues.append(ValidationIssue(ErrorCode.MANIFEST_ARTIFACT_METADATA_MISMATCH, "Unreadable artifact cannot be marked contract-valid", path))
            continue
        document_issues = validate_document(document)
        issues.extend(document_issues)
        metadata_mismatches = []
        artifact_producer = artifact.get("producer", {})
        document_producer = document.get("producer", {})
        if artifact_producer.get("name") != document_producer.get("name"):
            metadata_mismatches.append("producer name")
        if artifact_producer.get("version") != document_producer.get("version"):
            metadata_mismatches.append("producer version")
        if artifact.get("document_type") != document.get("document_type"):
            metadata_mismatches.append("document type")
        if document.get("contract") != contract:
            issues.append(ValidationIssue(ErrorCode.CONTRACT_MISMATCH, f"Artifact contract differs from manifest: {relative_path}", f"{path}.contract"))
            metadata_mismatches.append("contract")
        if document.get("run_id") != run_id:
            issues.append(ValidationIssue(ErrorCode.RUN_ID_MISMATCH, f"Artifact run_id differs from manifest: {relative_path}", f"{path}.run_id"))
            metadata_mismatches.append("run ID")
        if document.get("mode") != mode:
            issues.append(ValidationIssue(ErrorCode.MODE_MISMATCH, f"Artifact mode differs from manifest: {relative_path}", f"{path}.mode"))
            metadata_mismatches.append("mode")
        document_valid = not document_issues
        if artifact.get("contract_valid") is not document_valid:
            metadata_mismatches.append("contract_valid")
        if metadata_mismatches:
            issues.append(ValidationIssue(ErrorCode.MANIFEST_ARTIFACT_METADATA_MISMATCH, f"Manifest artifact metadata differs on: {', '.join(metadata_mismatches)}", path))
        produced_records.append({
            "artifact": artifact,
            "document": document,
            "document_valid": document_valid,
            "run_valid": document_valid and not metadata_mismatches,
        })
    if contract == "ccac/1.1.0":
        reports = [record["document"] for record in produced_records if record["document"].get("document_type") == "trusted_report"]
        tool_results = [record["document"] for record in produced_records if record["run_valid"] and record["document"].get("document_type") == "tool_result"]
        for report in reports:
            actual_inventory = [
                (result.get("producer", {}).get("name"), result.get("producer", {}).get("version"))
                for result in tool_results
                if result.get("producer", {}).get("name") in ANALYTICAL_PRODUCERS
            ]
            included_inventory = [(item.get("name"), item.get("version")) for item in report.get("included_producers", [])]
            quality_inventory = [
                (item.get("producer", {}).get("name"), item.get("producer", {}).get("version"))
                for item in report.get("producer_quality", [])
            ]
            omitted_names = [item.get("name") for item in report.get("omitted_producers", [])]
            expected_omissions = ANALYTICAL_PRODUCERS - {name for name, _ in included_inventory}
            inventory_valid = (
                len(actual_inventory) == len(set(actual_inventory))
                and len(included_inventory) == len(set(included_inventory))
                and len(quality_inventory) == len(set(quality_inventory))
                and set(included_inventory) == set(actual_inventory)
                and set(quality_inventory) == set(included_inventory)
                and len(omitted_names) == len(set(omitted_names))
                and set(omitted_names) == expected_omissions
                and not ({name for name, _ in included_inventory} & set(omitted_names))
            )
            if not inventory_valid:
                issues.append(ValidationIssue(ErrorCode.REPORT_RUN_INVENTORY_MISMATCH, "Report producer inventories do not match valid produced analytical artifacts", "$.included_producers"))
            for index, metric in enumerate(report.get("metric_catalog", [])):
                boundary = metric.get("accounting_boundary")
                if not isinstance(boundary, dict) or boundary.get("relationship") != "canonical_scope_spend":
                    continue
                owner = boundary.get("canonical_owner")
                matches = [
                    source_metric
                    for result in tool_results
                    if result.get("producer", {}).get("name") == owner
                    for source_metric in result.get("metrics", [])
                    if source_metric.get("id") == metric.get("id")
                ]
                path = f"$.metric_catalog[{index}]"
                if not matches:
                    issues.append(ValidationIssue(ErrorCode.CANONICAL_SCOPE_SOURCE_MISSING, f"Canonical scope metric must have exactly one source in owner {owner!r}", path))
                    continue
                if len(matches) > 1:
                    issues.append(ValidationIssue(ErrorCode.CANONICAL_SCOPE_SOURCE_MISMATCH, f"Canonical scope metric has multiple sources in owner {owner!r}", path))
                    continue
                if any(matches[0].get(field) != metric.get(field) for field in CANONICAL_SCOPE_FIELDS):
                    issues.append(ValidationIssue(ErrorCode.CANONICAL_SCOPE_SOURCE_MISMATCH, "Trusted-report canonical scope differs from its producer-owned source", path))
        valid_by_producer = {
            record["document"].get("producer", {}).get("name")
            for record in produced_records
            if record["run_valid"]
        }
        required = ANALYTICAL_PRODUCERS | {"tech-spend-command-center"}
        manifest_complete = manifest.get("status") == "complete"
        complete_reports = [report for report in reports if report.get("status") == "complete"]
        if manifest_complete and (valid_by_producer != required or len(complete_reports) != 1):
            issues.append(ValidationIssue(ErrorCode.RUN_STATUS_MISMATCH, "Complete manifest requires exactly one valid artifact from every required producer and one complete report", "$.status"))
        if not manifest_complete and complete_reports:
            issues.append(ValidationIssue(ErrorCode.RUN_STATUS_MISMATCH, "Partial or failed manifest cannot contain a complete trusted report", "$.status"))
        for report in complete_reports:
            artifact_statuses = {
                item.get("producer", {}).get("name"): item.get("status")
                for item in manifest.get("artifacts", [])
                if item.get("producer", {}).get("name") in required
            }
            if any(artifact_statuses.get(name) != "produced" for name in required):
                issues.append(ValidationIssue(ErrorCode.RUN_STATUS_MISMATCH, "Complete report requires every required producer artifact to be produced", "$.artifacts"))
    return issues
