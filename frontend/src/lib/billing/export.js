const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const textCell = (value) => {
  const text = String(value ?? '');
  // Text fields can contain spreadsheet formulas; amounts use a separate numeric path.
  return `"${(/^[\s]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

function normalizedCsv(period) {
  return 'ChargePeriodStart,ChargePeriodEnd,ServiceName,BilledCost,BillingCurrency,ProviderName,RecordId,BillingAccountId\r\n' + period.rows.map((row) => [
    textCell(row.start), textCell(row.end), textCell(row.service), row.cost, textCell(row.currency), textCell(row.provider), textCell(row.recordId), textCell(row.accountId),
  ].join(',')).join('\r\n') + '\r\n';
}

export function buildBillingExports(report) {
  const base = `cloud-cost-guard-${report.currency}-${report.current.start}-to-${report.current.end}`;
  const rows = report.current.services.map((row) => `<tr><td>${escape(row.provider)}</td><td>${escape(row.service)}</td><td>${escape(row.charges)}</td><td>${escape(row.credits)}</td><td>${escape(row.net)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloud Cost Guard · your billing review</title><style>body{background:#f5eee9;color:#292e2a;font:15px/1.65 system-ui,sans-serif;margin:0}main{max-width:960px;padding:32px 20px;margin:auto}h1,h2{font-family:Georgia,serif;line-height:1.2}article{border:1px solid #ddd6cd;background:#fffdf9;border-radius:14px;padding:20px;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;text-align:left;border-bottom:1px solid #ddd;overflow-wrap:anywhere}.table{overflow:auto}.total{font-size:32px;font-weight:bold}p{overflow-wrap:anywhere}@media print{body{background:white}article{break-inside:avoid}}</style></head><body><main><p>Cloud &amp; Capital · Cloud Cost Guard</p><h1>Your cloud billing review</h1><p>${escape(report.current.start)} to ${escape(report.current.end)} (end exclusive), UTC. ${report.current.days} days.</p><article><h2>Net cost</h2><p class="total">${escape(report.currency)} ${escape(report.current.net)}</p><p>Positive charges: ${escape(report.current.charges)} · credits / negative adjustments: ${escape(report.current.credits)}. All values in ${escape(report.currency)} are exact supplied decimals.</p><p>${escape(report.current.dateBasis)}</p></article>${report.previous ? `<article><h2>Previous upload</h2><p>${escape(report.previous.start)} to ${escape(report.previous.end)} (end exclusive), UTC. ${report.previous.days} days.</p><p>Net ${escape(report.currency)} ${escape(report.previous.net)} · change ${escape(report.comparison.delta)}${report.comparison.percent !== null ? ` (${escape(report.comparison.percent)}%)` : ' · percentage unavailable: previous net is zero or negative'}.</p><p>${escape(report.previous.dateBasis)}</p></article>` : ''}<h2>Service breakdown</h2><div class="table"><table><thead><tr><th>Provider</th><th>Service</th><th>Charges</th><th>Credits / adjustments</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table></div>${report.findings.map((finding) => `<article><h2>${escape(finding.title)}</h2><p>${escape(finding.text)}</p></article>`).join('')}<article><h2>Data checks</h2><p>${escape(report.costBasis)}</p><p>${report.current.rows.length} counted of ${report.current.sourceRowCount} current rows. ${escape(report.current.warnings.join(' '))}</p>${report.previous ? `<p>${report.previous.rows.length} counted of ${report.previous.sourceRowCount} previous rows. ${escape(report.previous.warnings.join(' '))}</p>` : ''}<p>Current sources: ${escape(report.current.sources.map((source) => source.name).join(', '))}</p>${report.previous ? `<p>Previous sources: ${escape(report.previous.sources.map((source) => source.name).join(', '))}</p>` : ''}<p>${escape(report.privacy)}</p></article></main></body></html>`;
  const files = {
    html: { filename: `${base}.html`, mimeType: 'text/html;charset=utf-8', content: html },
    json: { filename: `${base}-evidence.json`, mimeType: 'application/json;charset=utf-8', content: `${JSON.stringify(report, null, 2)}\n` },
    current: { filename: `${base}-current.csv`, mimeType: 'text/csv;charset=utf-8', content: normalizedCsv(report.current) },
  };
  if (report.previous) files.previous = { filename: `${base}-previous.csv`, mimeType: 'text/csv;charset=utf-8', content: normalizedCsv(report.previous) };
  return files;
}
