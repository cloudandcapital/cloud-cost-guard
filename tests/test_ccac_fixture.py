from __future__ import annotations

import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CHECKER_PATH = REPOSITORY_ROOT / "scripts" / "validate_ccac_fixture.py"
FIXTURE_PATH = (
    REPOSITORY_ROOT / "fixtures" / "ccac" / "illustrative-v0.2.1" / "run"
)

SPEC = importlib.util.spec_from_file_location("validate_ccac_fixture", CHECKER_PATH)
assert SPEC and SPEC.loader
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class FixtureIntegrityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.run_directory = Path(self.temp_directory.name) / "run"
        shutil.copytree(FIXTURE_PATH, self.run_directory)

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def assert_checker_fails(self) -> None:
        result = subprocess.run(
            [sys.executable, str(CHECKER_PATH), str(self.run_directory)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertTrue(result.stderr.startswith("CCAC fixture validation failed:"))

    def test_canonical_fixture_passes(self) -> None:
        CHECKER.validate_fixture(self.run_directory)

    def test_missing_artifact_fails(self) -> None:
        (self.run_directory / "finops-lite.json").unlink()
        self.assert_checker_fails()

    def test_unexpected_artifact_fails(self) -> None:
        (self.run_directory / "unexpected.json").write_text("{}", encoding="utf-8")
        self.assert_checker_fails()

    def test_modified_producer_fails(self) -> None:
        path = self.run_directory / "ai-cost-lens.json"
        data = path.read_bytes().replace(b"illustrative", b"illustrativf", 1)
        self.assertEqual(len(data), path.stat().st_size)
        path.write_bytes(data)
        self.assert_checker_fails()

    def test_modified_manifest_fails(self) -> None:
        path = self.run_directory / "manifest.json"
        data = path.read_bytes().replace(b"a", b"b", 1)
        self.assertEqual(len(data), path.stat().st_size)
        path.write_bytes(data)
        self.assert_checker_fails()

    def test_modified_report_fails(self) -> None:
        path = self.run_directory / "report.json"
        data = path.read_bytes().replace(b"illustrative", b"illustrativf", 1)
        self.assertEqual(len(data), path.stat().st_size)
        path.write_bytes(data)
        self.assert_checker_fails()

    def test_incorrect_byte_size_fails(self) -> None:
        path = self.run_directory / "recovery-economics.json"
        path.write_bytes(path.read_bytes() + b"\n")
        self.assert_checker_fails()

    def test_incorrect_checksum_fails(self) -> None:
        path = self.run_directory / "saas-cost-analyzer.json"
        data = bytearray(path.read_bytes())
        data[-2] = data[-2] ^ 1
        path.write_bytes(data)
        self.assert_checker_fails()

    def test_symlinked_artifact_fails(self) -> None:
        path = self.run_directory / "finops-watchdog.json"
        target = Path(self.temp_directory.name) / "outside.json"
        shutil.copy2(path, target)
        path.unlink()
        path.symlink_to(target)
        self.assert_checker_fails()

    def test_malformed_json_fails(self) -> None:
        path = self.run_directory / "report.json"
        path.write_text("{", encoding="utf-8")
        self.assert_checker_fails()
        with self.assertRaises(CHECKER.FixtureValidationError):
            CHECKER.parse_json_artifact(b"{")


if __name__ == "__main__":
    unittest.main()
