import React, { useEffect, useRef, useState } from 'react';
import logo from '../../assets/cloud-and-capital-icon.png';
import BillingUpload from './BillingUpload';
import './billing.css';
import ColorModeToggle from '../ColorModeToggle';
import { normalizeCsv } from '../../lib/billing/csv';
import { runBillingPipeline } from '../../lib/billing/pipeline';
import { SAMPLE_BILLS } from '../../lib/billing/examples';

export default function BillingApp({ Dashboard }) {
  const [screen, setScreen] = useState('upload');
  const [report, setReport] = useState(null);
  const [selection, setSelection] = useState(null);
  const [reportKey, setReportKey] = useState(0);
  const [exampleProgress, setExampleProgress] = useState('');
  const [exampleError, setExampleError] = useState('');
  const sampleRequest = useRef(null);
  useEffect(() => () => sampleRequest.current?.abort(), []);
  useEffect(() => {
    if (!report || report.example) return undefined;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [report]);
  const navigate = (next) => { setScreen(next); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const clear = () => { setReportKey(key => key + 1); sampleRequest.current?.abort(); sampleRequest.current = null; setExampleProgress(''); setExampleError(''); setReport(null); setSelection(null); navigate('upload'); };
  const advancedExample = () => { clear(); navigate('sample'); };
  const example = async () => {
    clear();
    const controller = new AbortController();
    sampleRequest.current = controller;
    setExampleProgress('Preparing your sample bill review…');
    try {
      const files = SAMPLE_BILLS.map(file => normalizeCsv(file.text, file.name));
      const next = await runBillingPipeline([files[0]], [files[1]], {}, { mode: 'illustrative', signal: controller.signal, onProgress: setExampleProgress });
      if (controller.signal.aborted) return;
      setReport({ ...next, example: true }); setReportKey(key => key + 1); navigate('report');
    } catch (error) { if (error.name !== 'AbortError') setExampleError(error.message); }
    finally { if (sampleRequest.current === controller) { sampleRequest.current = null; setExampleProgress(''); } }
  };
  const analyze = (next, chosen) => { setReport(next); setSelection(chosen); setReportKey((key) => key + 1); navigate('report'); };
  if (screen === 'sample') return <><div className="billing-sample-banner" role="region" aria-label="Example data"><span>You’re exploring an invented example.</span><button onClick={clear}>Review my own cloud bill →</button></div><Dashboard/></>;
  if (screen === 'report') return <>{report.example && <div className="billing-sample-banner" role="region" aria-label="Example data"><span>Invented bills, reviewed exactly like your own files.</span><button onClick={clear}>Review my own cloud bill →</button></div>}<Dashboard key={reportKey} report={report} onReplace={report.example ? clear : () => navigate('upload')} onClear={clear} onExample={example}/></>;
  return <div className="billing-app"><header className="billing-header"><div className="billing-header-inner"><a href="https://cloudandcapital.com" className="billing-brand"><img src={logo} alt="Cloud & Capital"/><div><h1>Cloud Cost Guard</h1><span>Cloud &amp; Capital</span></div></a><div className="billing-header-tools"><span className="billing-header-note">A clearer picture, before your next bill.</span><ColorModeToggle /></div></div></header><BillingUpload key={reportKey} onAnalyze={analyze} onExample={example} onAdvancedExample={advancedExample} exampleProgress={exampleProgress} exampleError={exampleError} initial={selection} onCancel={report ? () => navigate('report') : undefined}/><footer className="billing-footer"><span>Cloud &amp; Capital</span><p>Read your bill. Ask better questions. Make informed decisions.</p><a href="https://cloudandcapital.com/services">Want a second pair of eyes?</a></footer></div>;
}
