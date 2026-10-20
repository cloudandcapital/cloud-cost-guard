// Jest has no Web Worker/WASM layout environment. Run the same vendored Python
// pipeline natively here; the runtime and browser suites verify the real worker.
import { execFileSync } from 'child_process';
import path from 'path';
import { presentBillingBundle } from './pipeline';

export function nativeBillingReport(current, previous = [], options = {}) {
  const files = items => items.map(({name,text})=>({name,text}));
  try {
    const output = execFileSync('python', [path.resolve(__dirname, '../../../../scripts/run_billing_pipeline.py')], {input:JSON.stringify({current:files(current),previous:files(previous),options}),maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
    return presentBillingBundle(JSON.parse(output.toString('utf8')));
  } catch (error) {
    if (error.stdout?.length) throw new Error(JSON.parse(error.stdout.toString('utf8')).error);
    if (error.stderr?.length) throw new Error(error.stderr.toString('utf8'));
    throw error;
  }
}
