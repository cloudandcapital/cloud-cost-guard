import React, { useEffect, useRef, useState } from 'react';
import { CloudUpload, FileCheck2, LockKeyhole, ArrowRight, X } from 'lucide-react';
import { readBillingFiles } from '../../lib/billing/csv';
import { buildBillingReport } from '../../lib/billing/report';

export function BillingInstructions() {
  return <details className="billing-instructions">
    <summary>What can I upload? Export instructions &amp; CSV format</summary>
    <div className="billing-instruction-body">
      <h3>Start with a FOCUS export or the simple template</h3>
      <p>A FOCUS export standardizes billing columns across providers. We read its <strong>BilledCost</strong> column, not EffectiveCost or ListCost. This is a billed-cost review, without amortization or currency conversion.</p>
      <div className="billing-format-grid"><div><strong>Simple CSV · 4 required columns</strong><code>Date,Service,Cost,Currency</code><p>Dates use YYYY-MM-DD. Costs use a decimal point; credits are negative. Add Provider and a unique RecordId when you have them.</p><a href="/billing/template.csv" download>Download the blank template</a></div><div><strong>FOCUS CSV · 5 required columns</strong><code>ChargePeriodStart, ChargePeriodEnd,<br/>ServiceName, BilledCost, BillingCurrency</code><p>Use UTC timestamps or YYYY-MM-DD. ChargePeriodEnd is exclusive. ProviderName and a stable RecordId are optional.</p><a href="/billing/focus-example.csv" download>Download a FOCUS example</a></div></div>
      <h3>Get your billing records</h3>
      <ul>
        <li><strong>AWS:</strong> in Billing and Cost Management, open Data Exports and create a FOCUS export. Choose CSV delivery to S3. Download and decompress the CSV parts for one export run. <a href="https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html" target="_blank" rel="noreferrer">AWS instructions ↗</a></li>
        <li><strong>Azure:</strong> in Cost Management → Exports, choose Cost and usage details (FOCUS), use CSV, then download the exported file from Azure storage. <a href="https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-improved-exports" target="_blank" rel="noreferrer">Azure instructions ↗</a></li>
        <li><strong>Other exports:</strong> copy the date, service, signed billed cost, and currency into the simple template. Check that credits and taxes match the source bill. Cost Explorer summary tables, native CUR, generic Azure/GCP exports, PDFs, Excel, ZIP, Gzip, and Parquet need conversion first; they are not read automatically.</li>
      </ul>
      <p>Select <strong>all CSV parts from one export run</strong> for the current period, then an earlier run for a comparison. A partial export produces a partial total. Use the same accounts, cost basis, currency, and comparable dates for both.</p>
      <p>Each period supports up to 20 files, 10 MB combined, 50,000 rows, and 366 days. Repeated stable IDs count once; conflicting IDs stop the upload. Identical rows without IDs need your choice. Extra columns are not analyzed, but are checked when detecting duplicates.</p>
      <p>FOCUS rows with no service name need a label (for example “Account credit” or “Tax”) before uploading. Optional simple EndDate is exclusive; otherwise each Date covers that one day. BillingAccountId helps scope stable IDs. This reader checks the supported billing fields, not full FOCUS conformance.</p>
      <div className="billing-inline-links"><a href="/billing/current-example.csv" download>Current-period example</a><a href="/billing/previous-example.csv" download>Earlier-period example</a></div>
    </div>
  </details>;
}

const blankOptions = () => ({ start: '', end: '', duplicatePolicy: 'review' });

function PeriodInput({ kind, files, options, onOptions, onFiles, loading }) {
  const current = kind === 'current';
  return <section className="billing-period-input" aria-label={`${current ? 'Current' : 'Previous'} period upload`}>
    <div className="billing-step-heading"><span className="billing-step">{current ? '1' : '2'}</span><div><h3>{current ? 'Your current bill' : 'An earlier bill'}{!current && <span className="billing-optional">Optional</span>}</h3><p>{current ? 'Choose the CSV file, or all parts of one export.' : 'Add a separate, earlier period to see what changed.'}</p></div></div>
    <label className="billing-file-label" htmlFor={`${kind}-files`}>{current ? 'Current billing CSV files' : 'Previous billing CSV files'}</label>
    <input id={`${kind}-files`} type="file" multiple accept=".csv,text/csv" onChange={(event) => { const picked = [...event.target.files]; event.target.value = ''; if (picked.length) onFiles(kind, picked); }} disabled={loading} />
    {!!files.length && <div className="billing-selected" role="status"><FileCheck2 size={18} aria-hidden="true"/><div>{files.map((file, index) => <div key={`${file.name}-${index}`}>{file.name} <span>· {file.rows.length.toLocaleString()} rows · {file.format}</span></div>)}</div>{!current && <button type="button" onClick={() => onFiles(kind, [])} aria-label="Remove previous period"><X size={16}/></button>}</div>}
    {!!files.length && <details className="billing-period-options"><summary>Period dates &amp; identical rows</summary><p>Leave dates blank to use the range covered by your records. Set the full billing window if the first or last day has no charges. The selected end date is inclusive.</p><div className="billing-date-fields"><label htmlFor={`${kind}-start`}>Start date<input id={`${kind}-start`} type="date" value={options.start} onChange={(event) => onOptions({ ...options, start: event.target.value })}/></label><label htmlFor={`${kind}-end`}>End date<input id={`${kind}-end`} type="date" value={options.end} onChange={(event) => onOptions({ ...options, end: event.target.value })}/></label></div><label htmlFor={`${kind}-duplicates`}>Identical rows without a RecordId</label><select id={`${kind}-duplicates`} value={options.duplicatePolicy} onChange={(event) => onOptions({ ...options, duplicatePolicy: event.target.value })}><option value="review">Ask me if any are found</option><option value="drop">Count once · repeated exports</option><option value="keep">Keep all · separate charges</option></select></details>}
  </section>;
}

export default function BillingUpload({ onAnalyze, onExample, onCancel, initial }) {
  const [current, setCurrent] = useState(initial?.current || []);
  const [previous, setPrevious] = useState(initial?.previous || []);
  const [currentOptions, setCurrentOptions] = useState(initial?.options?.current || blankOptions());
  const [previousOptions, setPreviousOptions] = useState(initial?.options?.previous || blankOptions());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState(null);
  const request = useRef(0);
  const errorRef = useRef(null);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const selectFiles = async (kind, files) => {
    const id = ++request.current;
    setError(''); setFileError(null);
    if (kind === 'current') {
      setCurrent([]); setCurrentOptions(blankOptions());
      setPrevious([]); setPreviousOptions(blankOptions());
    } else { setPrevious([]); setPreviousOptions(blankOptions()); }
    if (!files.length) return;
    setLoading(true);
    try {
      const parsed = await readBillingFiles(files);
      if (id === request.current) (kind === 'current' ? setCurrent : setPrevious)(parsed);
    } catch (err) { if (id === request.current) { setError(err.message); setFileError(kind); } }
    finally { if (id === request.current) setLoading(false); }
  };
  const analyze = (event) => {
    event.preventDefault();
    if (fileError || loading) return;
    setError('');
    try {
      const options = { current: currentOptions, previous: previousOptions };
      onAnalyze(buildBillingReport(current, previous, options), { current, previous, options });
    } catch (err) { setError(err.message); }
  };
  return <main className="billing-main" data-testid="billing-upload">
    <section className="billing-intro"><div><p className="billing-eyebrow">A clearer view of your cloud costs</p><h2>Let’s make sense<br className="billing-desktop-break"/> of your cloud bill.</h2><p>Upload your cloud billing export to see where your money went and what changed.</p><div className="billing-privacy-pill"><LockKeyhole size={16} aria-hidden="true"/>On your device. No cloud login needed.</div></div><div className="billing-intro-art" aria-hidden="true"><CloudUpload strokeWidth={1.2}/><span>From billing rows<br/>to a clearer picture.</span></div></section>
    <form onSubmit={analyze} className="billing-upload-card">
      <div className="billing-form-heading"><h2>Review my cloud bill</h2><p>FOCUS exports or the simple CSV template · UTF-8, comma-separated</p><div className="billing-inline-links"><a href="/billing/template.csv" download>Download template</a><a href="/billing/current-example.csv" download>See a filled-in example</a></div></div>
      <div className="billing-upload-grid"><PeriodInput kind="current" files={current} options={currentOptions} onOptions={setCurrentOptions} onFiles={selectFiles} loading={loading}/><PeriodInput kind="previous" files={previous} options={previousOptions} onOptions={setPreviousOptions} onFiles={selectFiles} loading={loading}/></div>
      {error && <div className="billing-error" ref={errorRef} tabIndex={-1} role="alert"><strong>Let’s check that file</strong><p>{error}</p><span>No report has been created from this selection. {onCancel ? 'Your earlier report is available with “Back to report”.' : 'You can fix the file or choose another one.'}</span>{fileError === 'previous' && <div><button type="button" className="billing-link-button" onClick={() => { setError(''); setFileError(null); }}>Remove invalid comparison selection</button></div>}</div>}
      <div className="billing-submit-row"><button type="submit" className="billing-primary" disabled={!current.length || loading || !!fileError}>{loading ? 'Reading your files…' : 'Review my bill'}<ArrowRight size={17} aria-hidden="true"/></button><button className="billing-link-button" type="button" onClick={onExample}>Try an example</button>{onCancel && <button className="billing-link-button" type="button" onClick={onCancel}>Back to report</button>}</div>
      <p className="billing-smallprint">Up to 10 MB and 50,000 rows per period. Your files, results, and Lumen questions stay in this tab’s memory. Reloading or closing the tab clears them. Download a report if you want to keep it.</p>
    </form>
    <BillingInstructions/>
  </main>;
}
