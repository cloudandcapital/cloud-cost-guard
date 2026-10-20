/* global loadPyodide */
// This worker runs the existing Python producers. Uploaded values enter Python
// through a JSON string, never as code. All fetched assets are same-origin code.
self.onmessage = async ({ data }) => {
  const progress = (message) => self.postMessage({ type: 'progress', message });
  try {
    progress('Preparing the analysis tools on your device…');
    importScripts('./runtime/pyodide.js');
    const python = await loadPyodide({ indexURL: new URL('./runtime/', self.location.href).href });
    await python.loadPackage('jsonschema');
    const [sources, provenance] = await Promise.all(['sources.json', 'provenance.json'].map(async name => {
      const response = await fetch(new URL(name, self.location.href));
      if (!response.ok) throw new Error('The analysis tools could not be loaded. Please try again.');
      return response.json();
    }));
    for (const [name, content] of Object.entries(sources.files)) {
      const destination = '/guard_pipeline/'+name;
      python.FS.mkdirTree(destination.slice(0, destination.lastIndexOf('/')));
      python.FS.writeFile(destination, content, { encoding: 'utf8' });
    }
    progress('Reviewing your bill with FinOps Lite and Watchdog…');
    python.globals.set('guard_payload', JSON.stringify(data));
    const result = python.runPython(`
import sys
sys.path.insert(0, '/guard_pipeline')
from finops_lite.ccac_json import loads_exact, dumps_exact
from tech_spend_command_center.billing import run_billing_pipeline
try:
    guard_result = dumps_exact(run_billing_pipeline(loads_exact(guard_payload)))
except (ValueError, KeyError, TypeError) as error:
    guard_result = dumps_exact({'error': str(error)})
finally:
    del guard_payload
guard_result
`);
    const bundle = JSON.parse(result);
    if (bundle.error) { self.postMessage({type: 'error', message: bundle.error}); return; }
    bundle.source_provenance = provenance;
    self.postMessage({type: 'result', bundle});
  } catch (error) {
    // Runtime diagnostics can include source data. Keep unexpected errors local
    // and return only this plain retry instruction to the page.
    self.postMessage({type: 'error', message: 'The local analysis could not finish. Please try again, or use a smaller export. Your bill was not sent anywhere.'});
  }
};
