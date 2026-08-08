#!/usr/bin/env python3
"""Generate or check the deterministic CCAC dashboard presentation projection."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Any

from ccac11_dashboard_view import (
    PROJECTION_POLICY,
    ProjectionError,
    project_dashboard_view,
)
from validate_ccac11_fixture import (
    DEFAULT_RUN_DIRECTORY,
    FixtureValidationError,
    validate_fixture,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    REPOSITORY_ROOT
    / "frontend"
    / "src"
    / "data"
    / "ccac-dashboard-view-v1.1.generated.json"
)


def _reject_constant(value: str) -> None:
    raise ProjectionError("canonical report contains a non-finite number")


def _without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ProjectionError("canonical report contains a duplicate object key")
        result[key] = value
    return result


def validate_policy_artifacts(run_directory: Path) -> None:
    """Validate exact approved filenames, sizes, producers, versions, and hashes."""
    manifest_path = run_directory / PROJECTION_POLICY["manifest"]["filename"]
    try:
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(
            manifest_bytes.decode("utf-8"),
            object_pairs_hook=_without_duplicates,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectionError("artifact provenance manifest cannot be read") from exc
    manifest_policy = PROJECTION_POLICY["manifest"]
    if (
        len(manifest_bytes) != manifest_policy["size_bytes"]
        or hashlib.sha256(manifest_bytes).hexdigest() != manifest_policy["sha256"]
    ):
        raise ProjectionError("artifact provenance manifest differs from policy")
    artifacts = manifest.get("artifacts") if isinstance(manifest, dict) else None
    if not isinstance(artifacts, list):
        raise ProjectionError("artifact provenance inventory is invalid")

    actual: dict[str, dict[str, Any]] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not isinstance(
            artifact.get("producer"), dict
        ):
            raise ProjectionError("artifact provenance entry is invalid")
        producer = artifact["producer"].get("name")
        if producer == "tech-spend-command-center":
            if (
                artifact.get("document_type") != "trusted_report"
                or artifact.get("relative_path") != "report.json"
                or artifact.get("content_sha256")
                != PROJECTION_POLICY["source_report"]["sha256"]
            ):
                raise ProjectionError(
                    "trusted-report manifest entry differs from policy"
                )
            continue
        if not isinstance(producer, str) or producer in actual:
            raise ProjectionError("artifact provenance contains a duplicate producer")
        relative_path = artifact.get("relative_path")
        expected = PROJECTION_POLICY["producers"].get(producer)
        if (
            expected is None
            or artifact["producer"].get("version") != expected["version"]
            or relative_path != expected["artifact"]["filename"]
        ):
            raise ProjectionError("artifact provenance identity differs from policy")
        artifact_path = run_directory / relative_path
        try:
            artifact_bytes = artifact_path.read_bytes()
        except OSError as exc:
            raise ProjectionError("approved artifact file is unavailable") from exc
        actual[producer] = {
            "version": artifact["producer"].get("version"),
            "artifact": {
                "filename": relative_path,
                "size_bytes": len(artifact_bytes),
                "sha256": hashlib.sha256(artifact_bytes).hexdigest(),
            },
        }
        if artifact.get("content_sha256") != actual[producer]["artifact"]["sha256"]:
            raise ProjectionError(
                "artifact provenance declared hash differs from artifact content"
            )
    if actual != PROJECTION_POLICY["producers"]:
        raise ProjectionError("artifact provenance differs from projection policy")


def _load_validated_report(run_directory: Path) -> dict[str, Any]:
    validate_policy_artifacts(run_directory)
    validate_fixture(run_directory)
    report_policy = PROJECTION_POLICY["source_report"]
    report_path = run_directory / report_policy["filename"]
    try:
        report_bytes = report_path.read_bytes()
        if (
            len(report_bytes) != report_policy["size_bytes"]
            or hashlib.sha256(report_bytes).hexdigest() != report_policy["sha256"]
        ):
            raise ProjectionError("source report differs from projection policy")
        report = json.loads(
            report_bytes.decode("utf-8"),
            parse_float=Decimal,
            parse_int=int,
            parse_constant=_reject_constant,
            object_pairs_hook=_without_duplicates,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectionError("validated canonical report cannot be read") from exc
    if not isinstance(report, dict):
        raise ProjectionError("validated canonical report must be an object")
    return report


def render_view(run_directory: Path) -> bytes:
    """Validate the complete fixture, then render one deterministic projection."""
    projected = project_dashboard_view(_load_validated_report(run_directory))
    return (
        json.dumps(projected, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    ).encode("utf-8")


def _write_atomic(output: Path, data: bytes) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=output.parent, prefix=f".{output.name}.", delete=False
    ) as temporary:
        temporary.write(data)
        temporary_path = Path(temporary.name)
    temporary_path.replace(output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-directory", type=Path, default=DEFAULT_RUN_DIRECTORY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--check", action="store_true", help="fail unless the tracked output is current"
    )
    arguments = parser.parse_args(argv)
    try:
        rendered = render_view(arguments.run_directory)
        if arguments.check:
            try:
                current = arguments.output.read_bytes()
            except OSError as exc:
                raise ProjectionError("tracked dashboard view is unavailable") from exc
            if current != rendered:
                raise ProjectionError("tracked dashboard view is stale")
            print("CCAC dashboard view is current.")
            return 0
        _write_atomic(arguments.output, rendered)
    except (FixtureValidationError, ProjectionError) as exc:
        print(f"CCAC dashboard projection failed: {exc}", file=sys.stderr)
        return 1
    print(f"Generated deterministic CCAC dashboard view: {arguments.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
