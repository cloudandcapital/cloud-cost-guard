"""Native parity/test entry point for the exact source used by the local worker."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline/vendor'))
from finops_lite.ccac_json import dumps_exact, loads_exact
from tech_spend_command_center.billing import run_billing_pipeline

try:
    print(dumps_exact(run_billing_pipeline(loads_exact(sys.stdin.read()))))
except (ValueError, KeyError, TypeError) as error:
    print(dumps_exact({'error': str(error)}))
    sys.exit(2)
