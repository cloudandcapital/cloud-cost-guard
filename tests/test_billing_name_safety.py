"""Regression coverage through every released validator, using public names only."""

import csv
import gzip
import io
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline/vendor'))
from tech_spend_command_center.billing import run_billing_pipeline


def daily(service, provider='AWS', baseline=100, observed=250):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ChargePeriodStart', 'ChargePeriodEnd', 'ServiceName', 'BilledCost', 'BillingCurrency', 'ProviderName', 'BillingPeriodStart', 'BillingPeriodEnd'])
    for d in range(1, 31):
        writer.writerow([date(2026, 9, d), date(2026, 9, d) + timedelta(days=1), service, observed if d == 21 else baseline, 'USD', provider, '2026-09-01', '2026-10-01'])
    return {'current': [{'name': 'daily.csv', 'text': output.getvalue()}]}


class BillingNameSafetyTests(unittest.TestCase):
    def test_every_public_fixture_service_and_reported_names_can_spike(self):
        # Names from the unchanged public 1,000-row prefix. Costs/dates below
        # are invented, not a new claim about current customer provider files.
        original = gzip.decompress((ROOT / 'tests/fixtures/provider-inputs/focus-sample-1000.csv.gz').read_bytes()).decode()
        pairs = {(r['ProviderName'], r['ServiceName']) for r in csv.DictReader(io.StringIO(original))}
        pairs.update({('AWS', 'Amazon EC2'), ('AWS', 'Lambda')})
        self.assertGreater(len(pairs), 30)
        identifiers = set()
        for provider, service in sorted(pairs):
            with self.subTest(provider=provider, service=service):
                result = run_billing_pipeline(daily(service, provider))
                self.assertEqual(result['presentation']['current']['net'], '3150')
                finding = next(f for f in result['presentation']['findings'] if f['producer'] == 'finops-watchdog')
                self.assertEqual(finding['title'], f'{service} spending spike on Sep 21, 2026')
                self.assertIn('cost $250.00', finding['text'])
                self.assertNotIn(finding['id'], identifiers)
                identifiers.add(finding['id'])
                self.assertEqual(result['validator'], 'cloudandcapital-ccac/0.2.0')

    def test_new_spending_passes_the_complete_pipeline_as_new_spending(self):
        result = run_billing_pipeline(daily('S3', baseline=0, observed=50))
        self.assertEqual(result['presentation']['current']['net'], '50')
        findings = [f for f in result['presentation']['findings'] if f['producer'] == 'finops-watchdog']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['title'], 'New S3 spending on Sep 21, 2026')
        self.assertIn('median was $0.00', findings[0]['text'])
        self.assertNotIn('drop', findings[0]['text'])


if __name__ == '__main__':
    unittest.main()
