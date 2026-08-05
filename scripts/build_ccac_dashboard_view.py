#!/usr/bin/env python3
"""Generate or check the deterministic CCAC dashboard presentation projection."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Any

from ccac_dashboard_view import ProjectionError, project_dashboard_view
from validate_ccac_fixture import (
    DEFAULT_RUN_DIRECTORY,
    FixtureValidationError,
    validate_fixture,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    REPOSITORY_ROOT / "frontend" / "src" / "data" / "ccac-dashboard-view.generated.json"
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


def _load_validated_report(run_directory: Path) -> dict[str, Any]:
    validate_fixture(run_directory)
    report_path = run_directory / "report.json"
    try:
        report = json.loads(
            report_path.read_text(encoding="utf-8"),
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
