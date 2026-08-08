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

try:
    from ccac import validate_run_directory
except ImportError:  # pragma: no cover - exercised by dependency-missing environments
    validate_run_directory = None


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUN_DIRECTORY = (
    REPOSITORY_ROOT / "fixtures" / "ccac" / "illustrative-v0.3.0" / "run"
)

EXPECTED_ARTIFACTS = {
    "ai-cost-lens.json": (
        45_994,
        "c4715c88b5d31e5a7b8e9867bd89ede4edeac5491e2b2dc8c20f79b68eb95af4",
    ),
    "finops-lite.json": (
        54_778,
        "0dc4e0d5e3053f03daa773da7bb5c84d3cb8ad8e7f1a52d0e4b4937da722d570",
    ),
    "finops-watchdog.json": (
        13_717,
        "4ff11ff8dd0562a128c2aa22ef2fb85f78574a042b08f70b0b000312fd5e4aeb",
    ),
    "manifest.json": (
        2_685,
        "1919025af73e9cc4a3b5d29d21f13ad9c391e40533874b0c5cfc0325867eb632",
    ),
    "recovery-economics.json": (
        21_494,
        "eaeae3b11501d1cc4e77ab02ad5c594e8122e49abb5e1335a9130b909694be02",
    ),
    "report.json": (
        166_276,
        "5479da098b31fdf630fe3a0edc3ac67d30848185cecc61b640d998461b2f6b41",
    ),
    "saas-cost-analyzer.json": (
        40_146,
        "1f8af7f1e03cb4b5fdcb0c4692974640844d3d216bb3f2502640d6c2939d5b43",
    ),
}

EXPECTED_PRODUCERS = {
    "ai-cost-lens": "0.3.0",
    "finops-lite": "0.4.0",
    "finops-watchdog": "0.5.0",
    "recovery-economics": "0.3.0",
    "saas-cost-analyzer": "0.3.0",
}


class FixtureValidationError(ValueError):
    """A deterministic, public-safe fixture validation failure."""


def _reject_constant(value: str) -> None:
    raise FixtureValidationError("artifact JSON contains a non-finite number")


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise FixtureValidationError(
                "artifact JSON contains a duplicate object key"
            )
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
    if report.get("contract") != "ccac/1.1.0":
        raise FixtureValidationError("canonical report contract is incompatible")
    if report.get("mode") != "illustrative":
        raise FixtureValidationError("canonical report is not illustrative")
    if report.get("status") != "complete":
        raise FixtureValidationError("canonical report is not complete")
    if report.get("producer") != {
        "name": "tech-spend-command-center",
        "version": "0.3.0",
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
        raise FixtureValidationError(
            "canonical report producer versions are incompatible"
        )

    expected_counts = {
        "metric_catalog": 160,
        "finding_catalog": 10,
        "opportunity_catalog": 1,
        "opportunity_aggregates": 0,
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
    if "metric.tech-spend.total" not in metric_ids:
        raise FixtureValidationError("canonical report lacks Technology Spend")

    display = report.get("display")
    disclosures = display.get("disclosures") if isinstance(display, dict) else None
    if not isinstance(disclosures, list) or not any(
        "Technology Spend contains Cloud, direct AI, and SaaS" in item
        for item in disclosures
    ):
        raise FixtureValidationError("canonical report lacks the scope disclosure")


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
        raise FixtureValidationError(
            "fixture entries do not match the canonical artifact set"
        )

    parsed: dict[str, Any] = {}
    entries_by_name = {entry.name: entry for entry in entries}
    for filename in sorted(EXPECTED_ARTIFACTS):
        entry = entries_by_name[filename]
        if entry.is_symlink():
            raise FixtureValidationError("fixture artifacts must not be symlinks")
        try:
            entry_stat = entry.stat(follow_symlinks=False)
        except OSError as exc:
            raise FixtureValidationError(
                "fixture artifact metadata is unavailable"
            ) from exc
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
    if validate_run_directory is None:
        raise FixtureValidationError("released CCAC validator is unavailable")
    issues = validate_run_directory(run_directory)
    if issues:
        raise FixtureValidationError("released CCAC validation failed")


def main(argv: list[str]) -> int:
    run_directory = Path(argv[1]) if len(argv) == 2 else DEFAULT_RUN_DIRECTORY
    if len(argv) > 2:
        print(
            "CCAC fixture validation failed: expected at most one run directory",
            file=sys.stderr,
        )
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
