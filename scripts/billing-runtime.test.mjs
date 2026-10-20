import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
