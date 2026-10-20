import { money } from './report';

// Presentation only. All amounts, shares, chart groups and changes were produced
// by Python and validated by CCAC and Command Center before this boundary.
export function presentBillingBundle(bundle) {
  const view = bundle.presentation;
  if (bundle.contract !== 'ccac/1.1.0' || bundle.validator !== 'cloudandcapital-ccac/0.2.0' || bundle.status !== 'partial' || view?.pipeline?.run_id !== bundle.run_id || view?.current?.metric_ids?.net !== 'metric.tech-spend.scope.cloud') {
    throw new Error('The analysis did not return a validated cloud billing report. Please try again.');
  }
  const findings = view.findings.map(finding => ({
    ...finding,
    text: finding.parts ? finding.parts.map(part => {
      if (typeof part === 'string') return part;
      if (!finding.metric_ids.includes(part.metric_id)) throw new Error('A finding has an invalid cost reference.');
      return part.value === null ? 'unavailable' : part.format === 'money' ? money(part.value, view.currency) : `${part.value}%`;
    }).join('') : finding.text,
  }));
  return { ...view, findings, pipeline: { ...view.pipeline, report_sha256: bundle.report_sha256, manifest_sha256: bundle.manifest_sha256, source_provenance: bundle.source_provenance, artifacts: bundle.files } };
}

async function verifyTransfer(bundle) {
  for (const [name, expected] of [['report.json', bundle.report_sha256], ['manifest.json', bundle.manifest_sha256]]) {
    const bytes = new TextEncoder().encode(bundle.files?.[name] || '');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== expected) throw new Error('The report did not pass its integrity check. Please try again.');
  }
}

export function runBillingPipeline(current, previous = [], options = {}, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/billing-pipeline/worker.js');
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate(); // Discard the interpreter, CSVs and in-memory artifacts.
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Analysis cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('This bill took too long to analyze on this device. Try fewer CSV parts or a shorter period. Your data stayed on your device.')), 120000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    worker.onerror = () => finish(new Error('The local analysis tools could not start. Please reload and try again.'));
    worker.onmessage = async ({ data }) => {
      if (settled) return;
      if (data.type === 'progress') onProgress?.(data.message);
      if (data.type === 'error') finish(new Error(data.message));
      if (data.type === 'result') {
        try { await verifyTransfer(data.bundle); finish(null, presentBillingBundle(data.bundle)); }
        catch (error) { finish(error); }
      }
    };
    // Original CSV text goes only to this same-origin local worker, not an API.
    const files = items => items.map(({ name, text }) => ({ name, text }));
    worker.postMessage({ current: files(current), previous: files(previous), options, mode: 'real' });
  });
}
