import React, { useState } from 'react';
import logo from '../../assets/cloud-and-capital-icon.png';
import BillingUpload from './BillingUpload';
import BillingReport from './BillingReport';
import './billing.css';

export default function BillingApp({ SampleDashboard }) {
  const [screen, setScreen] = useState('upload');
  const [report, setReport] = useState(null);
  const [selection, setSelection] = useState(null);
  const [reportKey, setReportKey] = useState(0);
  const navigate = (next) => { setScreen(next); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const clear = () => { setReport(null); setSelection(null); navigate('upload'); };
  const example = () => { setReport(null); setSelection(null); navigate('sample'); };
  const analyze = (next, chosen) => { setReport(next); setSelection(chosen); setReportKey((key) => key + 1); navigate('report'); };
  if (screen === 'sample') return <><div className="billing-sample-banner" role="region" aria-label="Example data"><span>You’re exploring an invented example.</span><button onClick={clear}>Review my own cloud bill →</button></div><SampleDashboard/></>;
  return <div className="billing-app"><header className="billing-header"><div className="billing-header-inner"><a href="https://cloudandcapital.com" className="billing-brand"><img src={logo} alt="Cloud & Capital"/><div><h1>Cloud Cost Guard</h1><span>Cloud &amp; Capital</span></div></a><span className="billing-header-note">A clearer picture, before your next bill.</span></div></header>{screen === 'report' ? <BillingReport key={reportKey} report={report} onReplace={() => navigate('upload')} onClear={clear} onExample={example}/> : <BillingUpload onAnalyze={analyze} onExample={example} initial={selection} onCancel={report ? () => navigate('report') : undefined}/>}<footer className="billing-footer"><span>Cloud &amp; Capital</span><p>Read your bill. Ask better questions. Make informed decisions.</p><a href="https://cloudandcapital.com/services">Want a second pair of eyes?</a></footer></div>;
}
