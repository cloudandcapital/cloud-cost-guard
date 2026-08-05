#!/usr/bin/env python3
"""Verify the immutable illustrative CCAC fixture without changing it."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUN_DIRECTORY = (
    REPOSITORY_ROOT / "fixtures" / "ccac" / "illustrative-v0.2.1" / "run"
)

EXPECTED_ARTIFACTS = {
    "ai-cost-lens.json": (
        38_593,
        "b51cf23ea86cdaaea52bdfbba6188f995824f3591fed03ac97e262f23d1333be",
    ),
    "finops-lite.json": (
        52_821,
        "f8529ff5db134a6e81554fd5b2c87e687dc2258009522246d4642ca81501b3a0",
    ),
    "finops-watchdog.json": (
        13_308,
        "ec9269ce4e27ecb412108ca46dc4bd1229ad61682f234fee6cf71ca9833fb717",
    ),
    "manifest.json": (
        2_312,
        "16c4ce49800f0909cfa281739fb983e0d3c8c39d661f6eec7e3b4f08f2f378a6",
    ),
    "recovery-economics.json": (
        20_879,
        "db44438fea1d33f1b76591aa4ce6a3d6560ba8528c575dcb782a6da4ad8f71e4",
    ),
    "report.json": (
        154_193,
        "3e56662a5192644dd17d698184267c5e638f24018991f442dfbcf81b4dc8edaa",
    ),
    "saas-cost-analyzer.json": (
        33_057,
        "58f31ae72c17f80c1608d8f292756e741763ca4ef868d3ac0badf7a6df940bc8",
    ),
}

EXPECTED_PRODUCERS = {
    "ai-cost-lens": "0.2.0",
    "finops-lite": "0.3.0",
    "finops-watchdog": "0.4.0",
    "recovery-economics": "0.2.1",
    "saas-cost-analyzer": "0.2.0",
}

NO_COMBINED_TOTAL_DISCLOSURE = (
    "Metrics with different periods or accounting boundaries are not added into a "
    "single technology-spend total."
)


class FixtureValidationError(ValueError):
    """A deterministic, public-safe fixture validation failure."""


def _reject_constant(value: str) -> None:
    raise FixtureValidationError("artifact JSON contains a non-finite number")


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise FixtureValidationError("artifact JSON contains a duplicate object key")
        result[key] = value
    return result


def parse_json_artifact(data: bytes) -> Any:
    """Parse one already hash-verified artifact using strict JSON rules."""
    try:
        text = data.decode("utf-8")
        return json.loads(
            text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_constant,
        )
    except FixtureValidationError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise FixtureValidationError("artifact is not valid UTF-8 JSON") from exc


def _validate_report_identity(report: Any) -> None:
    if not isinstance(report, dict):
        raise FixtureValidationError("canonical report must be a JSON object")
    if report.get("document_type") != "trusted_report":
        raise FixtureValidationError("canonical report document type is invalid")
    if report.get("contract") != "ccac/1.0.0":
        raise FixtureValidationError("canonical report contract is incompatible")
    if report.get("mode") != "illustrative":
        raise FixtureValidationError("canonical report is not illustrative")
    if report.get("status") != "complete":
        raise FixtureValidationError("canonical report is not complete")
    if report.get("producer") != {
        "name": "tech-spend-command-center",
        "version": "0.2.1",
    }:
        raise FixtureValidationError("canonical report producer is incompatible")

    included = report.get("included_producers")
    if not isinstance(included, list):
        raise FixtureValidationError("canonical report producer catalog is invalid")
    producers = {
        item.get("name"): item.get("version")
        for item in included
        if isinstance(item, dict)
    }
    if len(included) != 5 or producers != EXPECTED_PRODUCERS:
        raise FixtureValidationError("canonical report producer versions are incompatible")

    expected_counts = {
        "metric_catalog": 155,
        "finding_catalog": 10,
        "opportunity_catalog": 1,
        "opportunity_aggregates": 1,
    }
    for field, expected_count in expected_counts.items():
        value = report.get(field)
        if not isinstance(value, list) or len(value) != expected_count:
            raise FixtureValidationError("canonical report identity counts are invalid")

    metric_ids = {
        metric.get("id")
        for metric in report["metric_catalog"]
        if isinstance(metric, dict)
    }
    if "metric.tech.total" in metric_ids:
        raise FixtureValidationError("canonical report contains a combined technology total")

    display = report.get("display")
    disclosures = display.get("disclosures") if isinstance(display, dict) else None
    if not isinstance(disclosures, list) or NO_COMBINED_TOTAL_DISCLOSURE not in disclosures:
        raise FixtureValidationError("canonical report lacks the non-additivity disclosure")


def validate_fixture(run_directory: Path) -> None:
    """Validate exact bytes, strict JSON, and stable report identity fields."""
    try:
        directory_stat = run_directory.lstat()
    except OSError as exc:
        raise FixtureValidationError("fixture run directory is unavailable") from exc
    if stat.S_ISLNK(directory_stat.st_mode) or not stat.S_ISDIR(directory_stat.st_mode):
        raise FixtureValidationError("fixture run path must be a regular directory")

    try:
        entries = list(os.scandir(run_directory))
    except OSError as exc:
        raise FixtureValidationError("fixture run directory cannot be read") from exc
    if {entry.name for entry in entries} != set(EXPECTED_ARTIFACTS):
        raise FixtureValidationError("fixture entries do not match the canonical artifact set")

    parsed: dict[str, Any] = {}
    entries_by_name = {entry.name: entry for entry in entries}
    for filename in sorted(EXPECTED_ARTIFACTS):
        entry = entries_by_name[filename]
        if entry.is_symlink():
            raise FixtureValidationError("fixture artifacts must not be symlinks")
        try:
            entry_stat = entry.stat(follow_symlinks=False)
        except OSError as exc:
            raise FixtureValidationError("fixture artifact metadata is unavailable") from exc
        if not stat.S_ISREG(entry_stat.st_mode):
            raise FixtureValidationError("fixture artifacts must be regular files")
        try:
            data = Path(entry.path).read_bytes()
        except OSError as exc:
            raise FixtureValidationError("fixture artifact cannot be read") from exc

        expected_size, expected_sha256 = EXPECTED_ARTIFACTS[filename]
        if len(data) != expected_size:
            raise FixtureValidationError("fixture artifact byte size is invalid")
        if hashlib.sha256(data).hexdigest() != expected_sha256:
            raise FixtureValidationError("fixture artifact checksum is invalid")
        parsed[filename] = parse_json_artifact(data)

    _validate_report_identity(parsed["report.json"])


def main(argv: list[str]) -> int:
    run_directory = Path(argv[1]) if len(argv) == 2 else DEFAULT_RUN_DIRECTORY
    if len(argv) > 2:
        print("CCAC fixture validation failed: expected at most one run directory", file=sys.stderr)
        return 2
    try:
        validate_fixture(run_directory)
    except FixtureValidationError as exc:
        print(f"CCAC fixture validation failed: {exc}", file=sys.stderr)
        return 1
    print("CCAC illustrative fixture integrity passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
