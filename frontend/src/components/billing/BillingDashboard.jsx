import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, CheckCircle, FileText, Info, PieChart as PieIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { BILLING_EVIDENCE_LIMITS, money, periodLabel, summarizeBillingPeriod } from '../../lib/billing/report';
import { decimalString, decimalUnits } from '../../lib/billing/csv';

// These sections occupy the existing dashboard shell and tabs. They never load
// the illustrative CCAC model: every amount comes from the active upload.
const PAGE_SIZE = 25;
const COLORS = ['#78917c', '#bd9290', '#c6ae8e', '#97a5a0', '#ded1c0'];
const compact = (text) => text.length > 18 ? `${text.slice(0, 17)}…` : text;

function TablePages({ page, setPage, total, label }) {
  if (total <= PAGE_SIZE) return null;
  const last = Math.ceil(total / PAGE_SIZE) - 1;
  return <nav className="billing-table-pages" aria-label={`${label} pages`}>
    <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} groups</span>
    <div><button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Previous ${label} page`}>Previous</button><button disabled={page === last} onClick={() => setPage(page + 1)} aria-label={`Next ${label} page`}>Next</button></div>
  </nav>;
}

function BillingMetric({ title, value, exact, testId, credit = false }) {
  return <Card className={`kpi-card${credit ? ' billing-credit-metric' : ''}`}>
    <CardHeader className="pb-2"><CardTitle className="text-sm text-brand-muted">{title}</CardTitle></CardHeader>
    <CardContent className="py-3"><div className="text-2xl font-bold" data-testid={testId}>{value}</div>{exact && <p className="billing-exact">{exact}</p>}</CardContent>
  </Card>;
}

export function BillingSummary({ report }) {
  const { current, currency } = report;
  const cost = (value) => money(value, currency);
  const large = [current.net, current.charges, current.credits].some((value) => cost(value).length > 11);
  const groups = useMemo(() => {
    const services = current.services.filter((row) => decimalUnits(row.charges) > 0n)
      .sort((a, b) => {
        const difference = decimalUnits(b.charges) - decimalUnits(a.charges);
        return difference > 0n ? 1 : difference < 0n ? -1 : a.key.localeCompare(b.key);
      });
    const entries = services.slice(0, 4).map((row) => ({ name: row.service, provider: row.provider, exact: row.charges }));
    if (services.length > 4) entries.push({ name: 'Other services', provider: '', exact: decimalString(services.slice(4).reduce((sum, row) => sum + decimalUnits(row.charges), 0n)) });
    return entries.map((row, index) => ({ ...row, value: Number(row.exact), fill: COLORS[index] }));
  }, [current.services]);

  return <section className={`executive-summary billing-dashboard-summary${large ? ' billing-dashboard-large-values' : ''}`} data-testid="executive-summary">
    <Card className="hero-card"><CardContent className="hero-content">
      <div className="hero-copy">
        <div className="eyebrow">Net cloud cost · your uploaded bill</div>
        <div className="hero-total" data-testid="billing-net-total">{cost(current.net)}</div>
        <div className="exact-value">Exact: {currency} {current.net}</div>
        <p className="text-sm text-brand-muted mt-2">{periodLabel(current)}</p>
        <div className="reconcile-line"><CheckCircle className="h-5 w-5" aria-hidden="true"/><div><strong>Service totals add up</strong><span>Calculated from your records. Check coverage against your provider bill.</span></div></div>
        <div className="scope-stack" data-testid="scope-cards">
          <BillingMetric title="Positive charges" value={cost(current.charges)} exact={`${currency} ${current.charges}`} testId="billing-charges"/>
          <BillingMetric title="Credits & adjustments" value={cost(current.credits)} exact={`${currency} ${current.credits}`} testId="billing-credits" credit/>
          <BillingMetric title="Counted records" value={current.rows.length.toLocaleString()} exact={`${current.services.length.toLocaleString()} service groups`}/>
        </div>
      </div>
      <Card className="scope-card" data-testid="scope-donut-card">
        <CardHeader><CardTitle className="flex items-center gap-2"><PieIcon className="h-5 w-5" aria-hidden="true"/>Where your charges went</CardTitle><CardDescription>Positive charges by service. Signed credits reduce the net total on the left.</CardDescription></CardHeader>
        <CardContent>
          {groups.length ? <><div className="scope-chart" data-testid="billing-scope-chart"><ResponsiveContainer><PieChart><Pie data={groups} dataKey="value" innerRadius={58} outerRadius={90} paddingAngle={2} isAnimationActive={false}>{groups.map((entry, index) => <Cell key={index} fill={entry.fill}/>)}</Pie><Tooltip formatter={(value, _, item) => cost(item?.payload?.exact ?? value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}/></PieChart></ResponsiveContainer></div>
            <div className="billing-scope-legend">{groups.map((entry, index) => <div key={index}><span><i style={{ background: entry.fill }}/>{entry.name}{entry.provider && <small>{entry.provider}</small>}</span><strong>{cost(entry.exact)}</strong></div>)}</div></> : <p className="billing-no-charges">There are no positive charges to chart. The net total still includes your credits and zero-cost records.</p>}
        </CardContent>
      </Card>
    </CardContent></Card>
    <p className="billing-rounding">Supplied billed cost in {currency}; no currency conversion or amortization. Display values are rounded. Exact totals and downloads retain up to 8 decimal places.</p>
  </section>;
}

export function BillingComparison({ report, onReplace }) {
  const { comparison, previous, currency } = report;
  const cost = (value) => money(value, currency);
  return <section className="billing-comparison-card" data-testid="billing-comparison">
    <div><p className="billing-eyebrow">What changed?</p><h3>{comparison ? `${cost(comparison.delta)} total change` : 'Add an earlier bill to compare'}</h3><p>{comparison ? `${comparison.percent === null ? 'Percentage unavailable: previous net cost is zero or negative.' : `${comparison.percent}% compared with the earlier upload.`} This compares the records supplied, not a verified account-wide trend.` : 'With one upload, we can show spending and the biggest services. We need a separate, earlier period to measure a change.'}</p></div>
    {previous ? <div className="billing-previous-total"><span>Previous net cost</span><strong>{cost(previous.net)}</strong><span>{periodLabel(previous)}</span></div> : <button className="billing-secondary" onClick={onReplace}>Add comparison CSV</button>}
    {comparison?.warnings.map((warning) => <p className="billing-comparison-warning" key={warning}>{warning}</p>)}
  </section>;
}

export function BillingFindings({ report }) {
  return <><div className="section-heading"><div><div className="eyebrow">From your billing records</div><h2>Your cost findings</h2><p>Where the money went, and what the supplied comparison can explain.</p></div></div>
    <div className="finding-list billing-upload-findings">{report.findings.map((finding, index) => <article className="finding-row" key={finding.title}>
      <div className="finding-severity"><span className="billing-finding-number">{String(index + 1).padStart(2, '0')}</span><span>{finding.title === 'Before you act' ? 'Coverage & context' : 'Billing review'}</span></div>
      <div className="finding-summary"><h3>{finding.title}</h3><p>{finding.text}</p></div>
    </article>)}</div>
    {report.comparison && <BillingChanges report={report}/>}
  </>;
}

function BillingChanges({ report }) {
  const [page, setPage] = useState(0);
  const { comparison, previous, current, currency } = report;
  const cost = (value) => money(value, currency);
  return <section aria-labelledby="billing-changes-title">
    <div className="billing-section-heading"><h2 id="billing-changes-title">Largest changes</h2><span>Current minus previous</span></div>
    <p className="billing-section-note">Service groups ordered by the size of their movement. An absent service means no records were supplied; it does not establish that a resource was added or removed.</p>
    <p className="billing-mobile-table-hint">Swipe across the table to see every comparison →</p>
    <div className="billing-table-wrap" role="region" aria-label="Uploaded service comparisons" tabIndex={0}><table className="billing-table"><thead><tr><th>Service / provider</th><th>Previous</th><th>Current</th><th>Change</th><th>Coverage</th></tr></thead>
      <tbody>{comparison.drivers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((driver) => <tr key={driver.key}><th scope="row">{driver.service}<small>{driver.provider}</small></th><td>{cost(driver.previous)}</td><td>{cost(driver.current)}</td><td>{cost(driver.delta)}</td><td>{driver.coverage}</td></tr>)}</tbody>
      <tfoot><tr><th>Total · {currency}</th><td>{cost(previous.net)}</td><td>{cost(current.net)}</td><td>{cost(comparison.delta)}</td><td>Period totals</td></tr></tfoot>
    </table></div>
    <TablePages page={page} setPage={setPage} total={comparison.drivers.length} label="changes"/>
  </section>;
}

export function BillingServices({ report }) {
  const [page, setPage] = useState(0);
  const { current, currency } = report;
  const cost = (value) => money(value, currency);
  return <section aria-labelledby="billing-services-title">
    <div className="section-heading"><div><div className="eyebrow">Service breakdown</div><h2 id="billing-services-title">Every service, accounted for</h2><p>{current.rows.length.toLocaleString()} counted records across all supplied providers.</p></div></div>
    <p className="billing-mobile-table-hint">Swipe across the table to see net costs and shares →</p>
    <div className="billing-table-wrap" role="region" aria-label="Uploaded service costs" tabIndex={0}><table className="billing-table"><thead><tr><th>Service / provider</th><th>Charges</th><th>Credits / adjustments</th><th>Net cost</th><th>Share of charges</th></tr></thead>
      <tbody>{current.services.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((service) => <tr key={service.key}><th scope="row">{service.service}<small>{service.provider}</small></th><td>{cost(service.charges)}</td><td>{cost(service.credits)}</td><td>{cost(service.net)}</td><td>{service.chargeShare === null ? 'Not applicable' : `${service.chargeShare}%`}</td></tr>)}</tbody>
      <tfoot><tr><th>Total · {currency}</th><td>{cost(current.charges)}</td><td>{cost(current.credits)}</td><td>{cost(current.net)}</td><td>{current.charges === '0' ? 'Not applicable' : '100%'}</td></tr></tfoot>
    </table></div>
    <TablePages page={page} setPage={setPage} total={current.services.length} label="services"/>
    <p className="billing-rounding">Shares use positive charges, so credits do not distort the percentages. Rounded rows can differ by a cent from rounded totals.</p>
  </section>;
}

export function BillingClouds({ report }) {
  const [provider, setProvider] = useState('');
  const { current, currency } = report;
  const providers = useMemo(() => [...new Set(current.rows.map((row) => row.provider))].sort(), [current.rows]);
  const period = useMemo(() => provider ? summarizeBillingPeriod({ ...current, rows: current.rows.filter((row) => row.provider === provider) }) : current, [current, provider]);
  const cost = (value) => money(value, currency);
  const topServices = period.services.slice(0, 8).map((service) => ({ ...service, label: compact(service.service), cost: Number(service.net) }));
  const daily = useMemo(() => {
    const byDate = new Map(period.daily.map((row) => [row.date, row.cost]));
    return Array.from({ length: period.days }, (_, index) => {
      const date = new Date(Date.parse(`${period.start}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
      return { date, exact: byDate.get(date), cost: byDate.has(date) ? Number(byDate.get(date)) : null };
    });
  }, [period]);
  return <section aria-labelledby="billing-clouds-title">
    <div className="section-heading"><div><div className="eyebrow">Your cloud charges</div><h2 id="billing-clouds-title">Cloud spending</h2><p>Filter the charts by providers present in this bill. The dashboard headline, downloads and Lumen cover the full upload.</p></div></div>
    <div className="billing-provider-filters" role="group" aria-label="Filter uploaded cloud charts"><Button variant={provider ? 'outline' : 'default'} className={provider ? 'btn-brand-outline' : 'btn-brand-primary'} onClick={() => setProvider('')} aria-pressed={!provider}>All providers</Button>{providers.map((name) => <Button key={name} variant={provider === name ? 'default' : 'outline'} className={provider === name ? 'btn-brand-primary' : 'btn-brand-outline'} onClick={() => setProvider(name)} aria-pressed={provider === name}>{name}</Button>)}</div>
    <p className="billing-filter-total" data-testid="billing-provider-total"><strong>{provider || 'All providers'}: {cost(period.net)} net</strong><span>{period.rows.length.toLocaleString()} records · current upload</span></p>
    <div className="billing-charts" aria-label="Spending charts">
      <Card className="kpi-card billing-chart-card"><h3>Biggest services by net cost</h3><p>{Math.min(period.services.length, 8)} of {period.services.length} service groups · {currency}. Full values are in Services.</p><div className="billing-chart" data-testid="billing-service-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={topServices} layout="vertical" margin={{ left: 0, right: 12, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)}/><YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 11 }} interval={0}/><ReferenceLine x={0} stroke="#6e756e"/><Tooltip formatter={(value, _, item) => cost(item?.payload?.net ?? value)} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.service} · ${payload[0].payload.provider}` : ''}/><Bar dataKey="cost" fill="#78917c" radius={[0, 5, 5, 0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div></Card>
      <Card className="kpi-card billing-chart-card"><h3>Cost by charge start date</h3><p>{current.spansMultipleDays ? 'Some charges span multiple days. Their whole cost appears on their start date; this is not daily usage spend.' : 'Records are grouped by their UTC charge start date.'} Gaps mean no records were supplied.</p><div className="billing-chart" data-testid="billing-date-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={daily} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => value.slice(5)} minTickGap={22}/><YAxis width={55} tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)}/><ReferenceLine y={0} stroke="#6e756e"/><Tooltip formatter={(value, _, item) => cost(item?.payload?.exact ?? value)}/><Line dataKey="cost" stroke="#b47e7f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls={false}/></LineChart></ResponsiveContainer></div></Card>
    </div>
  </section>;
}

export function BillingUnavailable({ section, onServices }) {
  const missing = BILLING_EVIDENCE_LIMITS[section];
  return <Card className="unavailable-card billing-missing-section" data-testid={`billing-unavailable-${section}`}><CardContent className="unavailable-content"><Info className="h-5 w-5" aria-hidden="true"/><div><p className="eyebrow">Additional data needed</p><h2>{missing.title}</h2><p>{missing.text}</p><p>Only your supplied cloud costs are included in the dashboard total.</p><Button variant="outline" className="btn-brand-outline" onClick={onServices}>Review uploaded services</Button></div></CardContent></Card>;
}

export function BillingOverview({ report }) {
  return <section className="billing-overview"><div className="section-heading"><div><div className="eyebrow">Coverage & cost basis</div><h2>What this dashboard includes</h2><p>Calculated from your uploaded records, with its limits kept visible.</p></div></div>
    <Card className="kpi-card"><CardContent className="billing-overview-copy"><h3>One bill, one consistent report</h3><p>{report.costBasis}</p><p>Service totals add up to the net cost. This checks the calculation; it does not reconcile your upload against a provider invoice or prove every account is covered.</p><p>{report.previous ? 'The earlier upload supplies the comparison baseline. Differences locate cost changes; usage and pricing evidence are needed to explain their cause.' : 'No earlier bill was supplied. A cost change, trend or anomaly cannot be established from this single period.'}</p><p>Forecasts, potential savings, resilience tests, Kubernetes utilization, direct AI invoices and SaaS seats are not inferred from cloud billing amounts.</p><p>{report.privacy}</p></CardContent></Card>
  </section>;
}

function DataChecks({ period, label }) {
  return <div className="billing-check-period"><h3>{label}</h3><p><strong>{period.rows.length.toLocaleString()} counted records</strong> from {period.sourceRowCount.toLocaleString()} input rows · {period.currency}</p><p>{periodLabel(period)}</p><p>{period.dateBasis}.</p><ul>{period.sources.map((source, index) => <li key={`${source.name}-${index}`}>{source.name} · {source.format} · {source.rows.toLocaleString()} rows</li>)}</ul>{period.warnings.map((warning) => <p className="billing-check-note" key={warning}>{warning}</p>)}</div>;
}

export function BillingDataChecks({ report }) {
  return <details className="billing-instructions" data-testid="billing-data-checks"><summary>Data checks, coverage &amp; exact cost basis</summary><div className="billing-instruction-body"><p>{report.costBasis}</p><div className="billing-format-grid"><DataChecks period={report.current} label="Current upload"/>{report.previous && <DataChecks period={report.previous} label="Previous upload"/>}</div><p>No account access or invoice reconciliation is performed. Missing fields are never filled with example values. Omitted parts, accounts, taxes, or credits cannot be recovered by this tool.</p><p>{report.privacy}</p></div></details>;
}

export function BillingDownloads({ report, onDownload }) {
  return <section className="billing-download-card" aria-labelledby="billing-downloads-title"><div><FileText size={23} aria-hidden="true"/><h2 id="billing-downloads-title">Take your review with you</h2><p>Created here in your browser, from this dashboard’s uploaded report. CSV text cells are protected against spreadsheet formulas.</p></div><div className="billing-download-actions"><button onClick={() => onDownload('html')}><ArrowDownToLine size={16}/>Printable report</button><button onClick={() => onDownload('json')}><ArrowDownToLine size={16}/>Evidence JSON</button><button onClick={() => onDownload('current')}><ArrowDownToLine size={16}/>Current records CSV</button>{report.previous && <button onClick={() => onDownload('previous')}><ArrowDownToLine size={16}/>Previous records CSV</button>}</div></section>;
}
