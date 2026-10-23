"""Integration and adversarial evidence for the actual supplied-bill pipeline."""
from copy import deepcopy
from decimal import Decimal
import hashlib
import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'pipeline/vendor'))
from ccac import validate_document, validate_run_directory
from finops_lite.billing import build_billing_result, CCACBuildError
from finops_lite.ccac_json import dumps_exact, loads_exact
from finops_watchdog.billing import build_billing_result as watchdog
from finops_watchdog.ccac import CCACWatchdogError
from tech_spend_command_center.billing import run_billing_pipeline, validate_billing_run
from tech_spend_command_center.trusted import TrustedReportError

IDENTITY = dict(run_id='7e5f2340-60aa-46e6-a7dd-66ed33854d03',generated_at='2026-10-20T00:00:00Z')
def fixture(name):
    return {'name':name+'.csv','text':(ROOT/'frontend/public/billing'/f'{name}-example.csv').read_text()}
def supplied(body, header='Date,Service,Cost,Currency,Provider,RecordId'):
    return [{'name':'invented.csv','text':header+'\n'+body}]

class BillingPipelineTests(unittest.TestCase):
    def test_public_focus_rows_keep_exact_provider_totals_and_expanded_source_hash(self):
        original=gzip.decompress((ROOT/'tests/fixtures/provider-inputs/focus-sample-1000.csv.gz').read_bytes())
        current=[{'name':'focus-sample-1000.csv.gz','text':original.decode('utf-8')}]
        with self.assertRaisesRegex(CCACBuildError,'Confirm UTC'):
            run_billing_pipeline(dict(**IDENTITY,current=current))
        result=run_billing_pipeline(dict(**IDENTITY,current=current,options={'current':{'timestampBasis':'UTC'}}))
        view=result['presentation']['current']
        self.assertEqual(view['net'],'20.52022672899')
        self.assertEqual(len(view['rows']),1000)
        self.assertEqual(view['identicalRows'],0)
        self.assertEqual({key:item['net'] for key,item in view['providerSummaries'].items()}, {'AWS':'18.0066386184','Microsoft':'1.97651418586','Oracle':'0.53707392473'})
        source=loads_exact(result['files']['finops-lite.json'])
        self.assertEqual(source['inputs'][0]['content_sha256'],hashlib.sha256(original).hexdigest())
        self.assertTrue(any('confirmed UTC' in item for item in source['inputs'][0]['mapping_notes']))
        self.assertEqual(result['status'],'partial')

    def test_large_eighteen_place_amount_survives_every_pipeline_stage(self):
        result=run_billing_pipeline(dict(**IDENTITY,current=supplied('2026-09-01,A,999999999999.123456789012345678,USD,AWS,a\n2026-09-01,B,0.000000000000000001,USD,AWS,b')))
        self.assertEqual(result['presentation']['current']['net'],'999999999999.123456789012345679')
        report=loads_exact(result['files']['report.json'])
        value=next(item['value'] for item in report['metric_catalog'] if item['id']=='metric.tech-spend.scope.cloud')
        self.assertEqual(value,Decimal('999999999999.123456789012345679'))

    @classmethod
    def setUpClass(cls):
        cls.bundle=run_billing_pipeline(dict(**IDENTITY,current=[fixture('current')],previous=[fixture('previous')]))

    def write_run(self, directory, bundle=None):
        for name,text in (bundle or self.bundle)['files'].items():
            (Path(directory)/name).write_text(text)

    def test_exact_reconciled_cloud_total_and_comparison_survive_all_stages(self):
        bundle=self.bundle
        self.assertEqual(bundle['presentation']['current']['net'],'1310.125')
        self.assertEqual(bundle['presentation']['previous']['net'],'996.6')
        self.assertEqual(bundle['presentation']['comparison']['delta'],'313.525')
        self.assertEqual(bundle['presentation']['comparison']['percent'],'31.5')
        source=loads_exact(bundle['files']['finops-lite.json'])
        report=loads_exact(bundle['files']['report.json'])
        metric=next(item for item in report['metric_catalog'] if item['id']=='metric.tech-spend.scope.cloud')
        self.assertEqual(metric['value'],Decimal('1310.125'))
        self.assertIn(metric,source['metrics'])
        self.assertEqual(report['reconciliation'][0]['difference'],0)
        self.assertFalse(metric['accounting_boundary']['total_eligible'])
        self.assertEqual(metric['accounting_boundary']['cost_basis'],'billed_cost')
        self.assertEqual([item['name'] for item in report['included_producers']],['finops-lite','finops-watchdog'])
        self.assertEqual({item['name'] for item in report['omitted_producers']},{'ai-cost-lens','saas-cost-analyzer','recovery-economics'})
        self.assertEqual(report['status'],'partial')
        self.assertFalse(any(item.get('metric_role')=='technology_spend_total' for item in report['metric_catalog']))
        for name,text in bundle['files'].items():
            self.assertEqual(validate_document(loads_exact(text)),[],name)
        with tempfile.TemporaryDirectory() as directory:
            self.write_run(directory)
            self.assertEqual(validate_run_directory(Path(directory)),[])
            self.assertEqual(validate_billing_run(directory)[0],report)

    def test_each_visible_amount_and_finding_keeps_its_canonical_reference(self):
        view=self.bundle['presentation']
        report=loads_exact(self.bundle['files']['report.json'])
        metrics={item['id']:item for item in report['metric_catalog']}
        for period in [view['current'],view['previous'],*view['current']['providerSummaries'].values()]:
            for kind,identifier in period['metric_ids'].items():
                self.assertEqual(Decimal(period[kind]),metrics[identifier]['value'])
            for row in period['services']:
                for kind,identifier in row['metric_ids'].items():
                    self.assertEqual(Decimal(row[kind]),metrics[identifier]['value'])
            for row in period['chargeChart']:
                self.assertEqual(Decimal(row['exact']),metrics[row['metric_id']]['value'])
        findings={item['id']:item for item in report['finding_catalog']}
        for finding in view['findings']:
            self.assertEqual(finding['text'],findings[finding['id']]['description'])
            for part in finding['parts'] or []:
                if isinstance(part,dict):
                    self.assertIn(part['metric_id'],finding['metric_ids'])
                    self.assertEqual(Decimal(part['value']),metrics[part['metric_id']]['value'])

    def test_raw_csv_hash_is_bound_to_source_evidence_and_watchdog(self):
        source=loads_exact(self.bundle['files']['finops-lite.json'])
        self.assertEqual(source['inputs'][0]['content_sha256'],hashlib.sha256(fixture('current')['text'].encode()).hexdigest())
        diagnostic=loads_exact(self.bundle['files']['finops-watchdog.json'])
        self.assertEqual(diagnostic['inputs'][0]['content_sha256'],hashlib.sha256(self.bundle['files']['finops-lite.json'].encode()).hexdigest())
        self.assertEqual(source['inputs'][0]['data_classification'],'customer_confidential')

    def test_tampered_hash_missing_file_and_substituted_omitted_domain_fail(self):
        for mutation in ['hash','missing','omitted']:
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as directory:
                self.write_run(directory)
                root=Path(directory)
                if mutation=='hash':(root/'finops-lite.json').write_text(self.bundle['files']['finops-lite.json']+' ')
                if mutation=='missing':(root/'finops-watchdog.json').unlink()
                if mutation=='omitted':(root/'ai-cost-lens.json').write_text(self.bundle['files']['finops-lite.json'])
                with self.assertRaises((TrustedReportError,OSError)):
                    validate_billing_run(directory)

    def test_changed_report_cannot_pass_by_rehashing_its_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_run(directory)
            root=Path(directory)
            report=loads_exact(self.bundle['files']['report.json'])
            # A non-headline chart metric is also producer-owned.
            target=next(item for item in report['metric_catalog'] if item['id'].endswith('.charges'))
            target['value']+=1
            raw=dumps_exact(report);(root/'report.json').write_text(raw)
            manifest=loads_exact(self.bundle['files']['manifest.json'])
            next(item for item in manifest['artifacts'] if item['relative_path']=='report.json')['content_sha256']=hashlib.sha256(raw.encode()).hexdigest()
            (root/'manifest.json').write_text(dumps_exact(manifest))
            with self.assertRaises(TrustedReportError):validate_billing_run(directory)

    def test_duplicate_json_keys_and_path_substitution_are_rejected(self):
        with self.assertRaises(ValueError):loads_exact('{"value":1,"value":2}')
        with tempfile.TemporaryDirectory() as directory:
            self.write_run(directory)
            manifest=loads_exact(self.bundle['files']['manifest.json'])
            manifest['artifacts'][0]['relative_path']='../finops-lite.json'
            (Path(directory)/'manifest.json').write_text(dumps_exact(manifest))
            with self.assertRaises(TrustedReportError):validate_billing_run(directory)

    def test_daily_spike_uses_existing_watchdog_and_single_period_can_have_history(self):
        rows='\n'.join(f'2026-09-{i:02d},Shop compute,{250 if i==21 else 100},USD,AWS,day{i}' for i in range(1,22))
        result=run_billing_pipeline(dict(**IDENTITY,current=supplied(rows)))
        view=result['presentation']
        self.assertEqual(view['current']['net'],'2250')
        self.assertIsNone(view['comparison'])
        self.assertEqual(view['pipeline']['watchdog']['anomalies_detected'],1)
        self.assertEqual(len([item for item in view['findings'] if item['producer']=='finops-watchdog']),1)

    def test_monthly_gaps_credits_and_short_history_do_not_invent_observations(self):
        cases=[('2026-09-01,Compute,300,USD,AWS,x,2026-10-01','Date,Service,Cost,Currency,Provider,RecordId,EndDate'),('2026-09-01,Compute,10,USD,AWS,a\n2026-09-03,Compute,12,USD,AWS,b','Date,Service,Cost,Currency,Provider,RecordId'),('2026-09-01,Compute,-2,USD,AWS,x','Date,Service,Cost,Currency,Provider,RecordId')]
        for body,header in cases:
            result=run_billing_pipeline(dict(**IDENTITY,current=supplied(body,header)))
            diagnostic=result['presentation']['pipeline']['watchdog']
            self.assertEqual(diagnostic['anomalies_detected'],0)
            self.assertEqual(diagnostic['series_evaluated'],0)
            self.assertEqual(len(diagnostic['excluded_daily_series']),1)
        source=build_billing_result(supplied('2026-09-01,Compute,1,USD,AWS,x'),**IDENTITY)
        self.assertEqual(len(watchdog(source)['extensions']['finops_watchdog']['insufficient_history_series']),1)

    def test_forged_daily_value_or_identity_fails_before_detection(self):
        original=build_billing_result(supplied('2026-09-01,Compute,1,USD,AWS,x'),**IDENTITY)
        for kind in ['value','privacy','boundary']:
            source=deepcopy(original)
            if kind=='value':next(item for item in source['metrics'] if 'date' in item['dimensions'])['value']=999
            if kind=='privacy':source['inputs'][0]['access']='illustrative_fixture'
            if kind=='boundary':next(item for item in source['metrics'] if item['id']=='metric.tech-spend.scope.cloud')['accounting_boundary']['total_eligible']=True
            with self.assertRaises(CCACWatchdogError):watchdog(source)

    def test_zero_previous_credit_only_mixed_currency_and_overlap(self):
        current=supplied('2026-09-01,Credit,-5,USD,AWS,x')
        zero=supplied('2026-08-01,Compute,0,USD,AWS,p')
        view=run_billing_pipeline(dict(**IDENTITY,current=current,previous=zero))['presentation']
        self.assertEqual(view['current']['net'],'-5')
        self.assertEqual(view['current']['chargeChart'],[])
        self.assertIsNone(view['comparison']['percent'])
        for previous in [current,supplied('2026-08-01,Compute,5,EUR,AWS,p')]:
            with self.assertRaises(CCACBuildError):run_billing_pipeline(dict(**IDENTITY,current=current,previous=previous))

    def test_source_snapshot_digests_match_reviewed_files(self):
        lock=json.loads((ROOT/'pipeline/sources.lock.json').read_text())
        for source in lock['sources']:
            self.assertFalse(source['uncommitted'], 'Pin a reviewable upstream commit before shipping the runtime')
            for item in source['files'].values():
                self.assertEqual(hashlib.sha256((ROOT/'pipeline/vendor'/item['path']).read_bytes()).hexdigest(),item['sha256'])

if __name__=='__main__':unittest.main()
