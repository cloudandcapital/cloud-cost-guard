from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from .errors import ErrorCode, ValidationIssue


SCHEMA_BY_DOCUMENT_TYPE = {
    "tool_result": "tool-result.schema.json",
    "pipeline_manifest": "pipeline-manifest.schema.json",
    "trusted_report": "trusted-report.schema.json",
    "verified_outcome": "verified-outcome.schema.json",
}
SUPPORTED_CONTRACTS = {"ccac/1.0.0", "ccac/1.1.0"}


@lru_cache(maxsize=2)
def _schemas(contract: str) -> dict[str, dict[str, Any]]:
    packaged_root = files("ccac.schemas")
    development_root = Path(__file__).resolve().parents[2] / "schemas"
    base_root = development_root if development_root.is_dir() else packaged_root
    schema_root = base_root if contract == "ccac/1.0.0" else base_root.joinpath("1.1.0")
    names = ["common.schema.json", *SCHEMA_BY_DOCUMENT_TYPE.values()]
    loaded = {name: json.loads(schema_root.joinpath(name).read_text(encoding="utf-8")) for name in names}
    return loaded


@lru_cache(maxsize=None)
def _validator(contract: str, document_type: str) -> Draft202012Validator:
    schemas = _schemas(contract)
    schema = schemas[SCHEMA_BY_DOCUMENT_TYPE[document_type]]
    registry = Registry().with_resources(
        (candidate["$id"], Resource.from_contents(candidate)) for candidate in schemas.values()
    )
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


def validate_structure(document: dict[str, Any]) -> list[ValidationIssue]:
    contract = document.get("contract")
    if contract is None:
        contract = "ccac/1.0.0"
    if contract not in SUPPORTED_CONTRACTS:
        return [ValidationIssue(ErrorCode.UNSUPPORTED_CONTRACT, f"Unsupported contract: {contract!r}", "$.contract")]
    document_type = document.get("document_type")
    if document_type not in SCHEMA_BY_DOCUMENT_TYPE:
        return [ValidationIssue(ErrorCode.UNKNOWN_DOCUMENT_TYPE, f"Unsupported document_type: {document_type!r}", "$.document_type")]
    issues = []
    for error in sorted(_validator(contract, document_type).iter_errors(document), key=lambda item: list(item.absolute_path)):
        path = "$" + "".join(f"[{part}]" if isinstance(part, int) else f".{part}" for part in error.absolute_path)
        code = ErrorCode.SCHEMA_INVALID
        absolute_path = list(error.absolute_path)
        if contract == "ccac/1.1.0" and len(absolute_path) >= 2 and absolute_path[0] == "metric_catalog" and isinstance(absolute_path[1], int):
            metric = document.get("metric_catalog", [])[absolute_path[1]]
            if metric.get("metric_role") == "technology_spend_total":
                code = ErrorCode.TECHNOLOGY_SPEND_RECONCILIATION_INVALID
        if contract == "ccac/1.1.0" and error.validator == "required" and "accounting_boundary" in path:
            missing = set(error.validator_value) - set(error.instance)
            if missing & {"inclusion_rules", "exclusion_rules", "component_treatments"}:
                code = ErrorCode.ACCOUNTING_BOUNDARY_DECLARATION_MISSING
        if contract == "ccac/1.1.0" and error.validator == "minItems" and path.endswith(".evidence_ids"):
            parent: Any = document
            for part in absolute_path[:-1]:
                parent = parent[part]
            if isinstance(parent, dict) and isinstance(parent.get("accounting_boundary"), dict):
                code = ErrorCode.ACCOUNTING_BOUNDARY_EVIDENCE_MISSING
        issues.append(ValidationIssue(code, error.message, path))
    return issues
