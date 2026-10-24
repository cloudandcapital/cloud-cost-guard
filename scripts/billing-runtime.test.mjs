import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'frontend/public/billing-pipeline');
const { loadPyodide } = await import(pathToFileURL(path.join(base, 'runtime/pyodide.mjs')));
const python = await loadPyodide({indexURL: path.join(base, 'runtime')+path.sep});
await python.loadPackage('jsonschema');
for (const [name, content] of Object.entries(JSON.parse(fs.readFileSync(path.join(base, 'sources.json'), 'utf8')).files)) {
  const destination = '/guard_pipeline/'+name;
  python.FS.mkdirTree(path.posix.dirname(destination));
  python.FS.writeFile(destination, content, {encoding:'utf8'});
}
python.runPython("import sys; sys.path.insert(0, '/guard_pipeline')\nfrom finops_lite.ccac_json import dumps_exact, loads_exact\nfrom tech_spend_command_center.billing import run_billing_pipeline");
function run(payload) {
  python.globals.set('test_input',JSON.stringify(payload));
  return JSON.parse(python.runPython('dumps_exact(run_billing_pipeline(loads_exact(test_input)))'));
}
const fixture = name => ({ name: name+'.csv', text: fs.readFileSync(path.join(root,'frontend/public/billing',name+'-example.csv'),'utf8') });
const identity = {run_id:'7e5f2340-60aa-46e6-a7dd-66ed33854d03',generated_at:'2026-10-20T00:00:00Z'};

test('browser Python runs the actual pipeline and exactly matches native artifacts', () => {
  const payload = {...identity, current:[fixture('current')], previous:[fixture('previous')]};
  const browser = run(payload);
  const native = JSON.parse(execFileSync('python', [path.join(root,'scripts/run_billing_pipeline.py')], {input:JSON.stringify(payload),maxBuffer:32*1024*1024}));
  assert.deepEqual(browser,native);
  assert.equal(browser.presentation.current.net,'1310.125');
  assert.equal(browser.presentation.comparison.delta,'313.525');
  assert.equal(browser.presentation.comparison.percent,'31.5');
  assert.equal(browser.status,'partial');
  assert.deepEqual(browser.presentation.pipeline.included_producers.map(item=>item.name),['finops-lite','finops-watchdog']);
  assert.equal(browser.presentation.pipeline.omitted_producers.length,3);
  for (const name of ['report','manifest']) assert.equal(createHash('sha256').update(browser.files[name+'.json']).digest('hex'),browser[name+'_sha256']);
  const report = JSON.parse(browser.files['report.json']);
  assert.equal(report.metric_catalog.some(item=>item.metric_role==='technology_spend_total'),false);
  assert.equal(report.metric_catalog.find(item=>item.id==='metric.tech-spend.scope.cloud').value,1310.125);
  assert.equal(browser.presentation.pipeline.watchdog.anomalies_detected,0);
  assert.ok(browser.presentation.pipeline.watchdog.excluded_daily_series.length>0);
});

test('Watchdog uses its existing detector on supplied consecutive daily observations', () => {
  const csv = 'Date,Service,Cost,Currency,Provider,RecordId\n'+Array.from({length:21},(_,i)=>`2026-09-${String(i+1).padStart(2,'0')},Shop compute,${i===20?250:100},USD,AWS,day${i}`).join('\n');
  const result = run({...identity,current:[{name:'daily.csv',text:csv}]});
  assert.equal(result.presentation.current.net,'2250');
  assert.equal(result.presentation.pipeline.watchdog.anomalies_detected,1);
  assert.equal(result.presentation.findings.filter(item=>item.producer==='finops-watchdog').length,1);
  assert.equal(result.presentation.pipeline.watchdog.insufficient_history_series.length,0);
  assert.equal(result.presentation.previous,null);
  assert.equal(result.presentation.comparison,null);
});

test('invalid bills fail before a report; no sample or zero-value substitution', () => {
  python.globals.set('test_input',JSON.stringify({...identity,current:[{name:'invalid.csv',text:'Date,Service,Cost,Currency\n2026-09-01,Compute,42,ABC'}]}));
  assert.throws(()=>python.runPython('run_billing_pipeline(loads_exact(test_input))'),/Currency/);
});

test('precise provider input keeps exact native/WASM artifacts and UTC evidence', () => {
  const text = gunzipSync(fs.readFileSync(path.join(root, 'tests/fixtures/provider-inputs/focus-sample-1000.csv.gz'))).toString('utf8');
  const payload = {...identity, current:[{name:'focus-sample-1000.csv.gz',text}], options:{current:{timestampBasis:'UTC'}}};
  const browser = run(payload);
  const native = JSON.parse(execFileSync('python', [path.join(root,'scripts/run_billing_pipeline.py')], {input:JSON.stringify(payload),maxBuffer:32*1024*1024}));
  assert.deepEqual(browser, native);
  assert.equal(browser.presentation.current.net, '20.52022672899');
  assert.equal(browser.presentation.current.rows.length, 1000);
  assert.deepEqual(Object.fromEntries(Object.entries(browser.presentation.current.providerSummaries).map(([provider, period]) => [provider, period.net])), {AWS:'18.0066386184',Microsoft:'1.97651418586',Oracle:'0.53707392473'});
  assert.ok(browser.presentation.current.warnings.some(value => /confirmed.*UTC/.test(value)));
  assert.equal(JSON.parse(browser.files['finops-lite.json']).inputs[0].content_sha256, createHash('sha256').update(text).digest('hex'));
});

test('large amounts preserve all eighteen places through browser Python validation', () => {
  const text = 'Date,Service,Cost,Currency,RecordId\n2026-09-01,A,999999999999.123456789012345678,USD,a\n2026-09-01,B,0.000000000000000001,USD,b';
  const result = run({...identity, current:[{name:'precise.csv',text}]});
  assert.equal(result.presentation.current.net, '999999999999.123456789012345679');
});

test('Google invoice month and exact signed rows match native canonical artifacts', () => {
  const text = fs.readFileSync(path.join(root, 'tests/fixtures/provider-inputs/google-cost-table-document.csv'), 'utf8');
  const payload = {...identity, current:[{name:'google.csv',text}], options:{current:{googleCostTable:{month:'2026-09',currency:'USD',confirmed:true}}}};
  const browser = run(payload);
  const native = JSON.parse(execFileSync('python', [path.join(root,'scripts/run_billing_pipeline.py')], {input:JSON.stringify(payload),maxBuffer:32*1024*1024}));
  assert.deepEqual(browser, native);
  assert.equal(browser.presentation.current.net, '108.830007');
  assert.equal(browser.presentation.current.rows.length, 6);
  assert.equal(browser.presentation.current.sourceRowCount, 7);
  assert.equal(browser.presentation.pipeline.watchdog.series_evaluated, 0);
  assert.ok(JSON.parse(browser.files['finops-lite.json']).inputs[0].mapping_notes.some(note => note.includes('4 invoice/statement header rows')));
});

test('published Microsoft minute-precision export matches exact native artifacts', () => {
  const text = gunzipSync(fs.readFileSync(path.join(root, 'tests/fixtures/provider-inputs/microsoft-ea-focus-1000.csv.gz'))).toString('utf8');
  const payload = {...identity, current:[{name:'azure.csv.gz',text}]};
  const browser = run(payload);
  const native = JSON.parse(execFileSync('python', [path.join(root,'scripts/run_billing_pipeline.py')], {input:JSON.stringify(payload),maxBuffer:32*1024*1024}));
  assert.deepEqual(browser, native);
  assert.equal(browser.presentation.current.net, '83.346183636400141');
  assert.equal(browser.presentation.current.rows.length, 1000);
  assert.equal(browser.presentation.current.identicalRows, 0);
  assert.equal(JSON.parse(browser.files['finops-lite.json']).inputs[0].content_sha256, '5766878f44ac4a143a6c45c401ab2bd736876ca2ff70a290a82d25dd2344d6ed');
});
