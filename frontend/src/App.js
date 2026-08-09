import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./assets/cloud-and-capital-icon.png";
import AskClaude from "./components/AskClaude";
import { getCcac11PresentationModel } from "./lib/ccac11PresentationModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Activity, AlertTriangle, Bot, Calendar, CheckCircle, ChevronRight, Cloud, Download, Eye, Info, Layers, PieChart as PieIcon, ShieldCheck, X } from "lucide-react";

const money = (value, digits = 2) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value);

const periodLabel = (period) => `${period.start} through ${period.end} · half-open · ${period.timezone}`;
const unavailable = "Not available in this illustrative report";
const colors = ["#6b8f71", "#c4956a", "#8b9dc3"];

const MetricCard = ({ title, value, subtitle, icon: Icon = Info }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <Icon className="h-4 w-4 text-brand-light-muted" />
    </CardHeader>
    <CardContent className="py-3">
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      {subtitle && <p className="text-xs text-brand-muted mt-1">{subtitle}</p>}
    </CardContent>
  </Card>
);

const UnavailableCard = ({ title, explanation }) => (
  <Card className="unavailable-card" data-testid={`unavailable-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
    <CardContent className="unavailable-content">
      <Info className="h-4 w-4" aria-hidden="true" />
      <div><div className="text-sm font-semibold text-brand-ink">{title}</div><div className="text-xs font-medium text-brand-muted">{unavailable}</div><p className="text-xs text-brand-muted mt-1">{explanation}</p></div>
    </CardContent>
  </Card>
);

const FindingCard = ({ finding, onDetails }) => (
  <article className="finding-row" data-canonical-id={finding.id}>
    <div className="finding-severity"><Badge className={`severity-${finding.severity}`}>{finding.severity.toUpperCase()}</Badge><span>{finding.type.replaceAll("_", " ")}</span></div>
    <div className="finding-summary"><h3>{finding.title}</h3><p>{finding.context}</p><div className="finding-meta"><span>Status: {finding.status}</span><span>Producer: {finding.producer.name} {finding.producer.version}</span><span>Quality: {finding.quality}</span><span>Evidence: {finding.evidence_ids.join(", ")}</span></div></div>
    <Button variant="outline" size="sm" onClick={() => onDetails(finding)} className="btn-brand-outline finding-action"><Eye className="h-3 w-3 mr-2" />Methodology<ChevronRight className="h-3 w-3 ml-2" /></Button>
  </article>
);

const ResponsiveTable = ({ children, label }) => <div className="table-scroll" role="region" aria-label={label} tabIndex="0">{children}</div>;

const FindingModal = ({ finding, onClose }) => {
  if (!finding) return null;
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={finding.title} data-testid="finding-modal">
        <div className="modal-header">
          <h3 className="font-brand-serif text-xl font-semibold">{finding.title}</h3>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-brand-muted">Canonical ID</div><div className="font-medium break-all">{finding.id}</div></div>
            <div><div className="text-brand-muted">Classification</div><div className="font-medium">{finding.type.replaceAll("_", " ")} · {finding.severity}</div></div>
          </div>
          <div><div className="text-brand-muted mb-1">Canonical context</div><div className="rounded-lg border border-[#E7DCCF] bg-[#F7F1EA] p-3">{finding.context}</div></div>
          <div><div className="text-brand-muted mb-1">Evidence</div><div>{finding.evidence_ids.join(", ")}</div></div>
          <div><div className="text-brand-muted mb-1">Source</div><div>{finding.producer.name} {finding.producer.version} · {finding.trace.source_artifact}</div></div>
          <Button variant="outline" onClick={onClose} className="w-full btn-brand-outline">Close</Button>
        </div>
      </div>
    </div>
  );
};

function Dashboard() {
  const [revision, setRevision] = useState(0);
  const [provider, setProvider] = useState("aws");
  const [finding, setFinding] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("findings");
  const tabRail = useRef(null);
  useEffect(() => {
    const rail = tabRail.current;
    const selected = rail?.querySelector('[data-state="active"]');
    if (rail && selected) rail.scrollTo({ left: selected.offsetLeft - (rail.clientWidth - selected.clientWidth) / 2, behavior: "smooth" });
  }, [activeTab]);
  const result = useMemo(() => {
    void revision;
    try { return { model: getCcac11PresentationModel(), error: null }; }
    catch (error) { return { model: null, error: error.message }; }
  }, [revision]);

  if (result.error) return (
    <main className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light flex items-center justify-center p-6" data-testid="canonical-error-state">
      <Alert className="max-w-xl alert-brand"><AlertTriangle className="h-4 w-4" /><AlertDescription>{result.error}. Legacy data was not loaded.</AlertDescription></Alert>
    </main>
  );

  const model = result.model;
  const scopeChart = model.scopes.map((scope, index) => ({
    name: scope.id.endsWith("cloud") ? "Cloud" : scope.id.endsWith("direct_ai") ? "Direct AI" : "SaaS",
    value: scope.displayValue,
    fill: colors[index],
    record: scope,
  }));
  const cloudDaily = model.cloud.daily.map((record) => ({ date: record.dimensions.date.slice(5), cost: record.displayValue }));
  const cloudServices = model.cloud.services.map((record) => ({ name: record.dimensions.service, cost: record.displayValue }));
  const aiModels = model.ai.costMetrics.map((record) => ({
    id: record.id, provider: record.dimensions.provider, model: record.dimensions.model,
    billingChannel: record.dimensions.billing_channel, cost: record.displayValue,
  }));
  const topAnomaly = model.anomalies[0];
  const unsupported = (key) => model.unsupported[key]?.explanation || unavailable;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light" data-testid="approved-dashboard" data-view-schema={model.schema}>
      <header className="nav-header" data-testid="dashboard-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="Cloud & Capital" className="brand-logo" />
            <div className="leading-tight"><h1 className="brand-title">Cloud+ Cost Guard</h1><p className="brand-deck">Canonical technology spend decision support <span>· Illustrative</span></p></div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <div className="btn-brand-outline rounded-2xl flex items-center justify-center px-2 sm:px-4 h-10 text-xs text-brand-muted"><Calendar className="h-4 w-4 mr-2" />21-day report</div>
            <Button variant="outline" disabled title="Canonical export support is a separate roadmap phase" className="btn-brand-outline rounded-2xl px-2 sm:px-4 text-xs" data-testid="canonical-export-disabled"><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button onClick={() => setRevision((value) => value + 1)} className="btn-brand-primary rounded-2xl px-2 sm:px-4 text-xs"><Activity className="h-4 w-4 mr-2" />Refresh</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="trust-strip" data-testid="capability-disclosure">
          <span className="font-medium">Validated CCAC 1.1 illustrative report. No customer accounts, credentials, or production resources are connected.</span>
          <span>Refresh reloads the tracked canonical view; it does not sync cloud accounts.</span>
          <span>Report generated: {model.identity.generated_at}</span>
          <span>Lumen remains on separate illustrative grounding pending its dedicated migration.</span>
        </div>

        <section className="executive-summary" data-testid="executive-summary">
          <Card className="hero-card"><CardContent className="hero-content">
            <div className="hero-copy"><div className="eyebrow">Published Technology Spend</div><div className="hero-total" data-canonical-id={model.total.id}>{money(model.total.displayValue)}</div><div className="exact-value">Exact canonical value: USD {model.total.value}</div><div className="text-sm text-brand-muted mt-2">{periodLabel(model.identity.report_period)}</div>
              <div className="reconcile-line"><CheckCircle className="h-5 w-5" /><div><strong>Reconciliation passed</strong><span>Exact difference {model.total.trace.currency} {model.reconciliation.difference}</span></div></div>
              <div className="scope-stack" data-testid="scope-cards"><MetricCard title="Cloud" value={money(model.cloud.total.displayValue)} subtitle="Provider-billed; native AI included" icon={Cloud} /><MetricCard title="Direct AI" value={money(model.ai.directScope.displayValue, 4)} subtitle="Direct-vendor billing only" icon={Bot} /><MetricCard title="SaaS" value={money(model.saas.scope.displayValue)} subtitle="Same-period allocated scope" icon={Layers} /></div>
            </div>
            <Card className="scope-card" data-testid="scope-donut-card"><CardHeader><CardTitle className="flex items-center gap-2"><PieIcon className="h-5 w-5" />Tech Spend by Scope</CardTitle><CardDescription>Three trusted inputs reconcile exactly.</CardDescription></CardHeader><CardContent>
              <div className="scope-chart"><ResponsiveContainer><PieChart><Pie data={scopeChart} dataKey="value" innerRadius={58} outerRadius={90} paddingAngle={2}>{scopeChart.map((entry) => <Cell key={entry.record.id} fill={entry.fill} />)}</Pie><Tooltip formatter={(value) => money(value, 4)} /></PieChart></ResponsiveContainer></div>
              <div className="space-y-2">{scopeChart.map((entry) => <div key={entry.record.id} className="flex justify-between text-sm"><span><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ background: entry.fill }} />{entry.name}</span><strong>{money(entry.value, entry.name === "Direct AI" ? 4 : 2)}</strong></div>)}</div>
              <div className="mt-4 rounded-lg bg-[#F7F1EA] p-3 text-xs text-brand-muted" data-testid="scope-methodology">Cloud includes provider-billed native AI. Direct AI covers direct-vendor billing. SaaS is the canonical same-period allocated scope. These inputs reconcile to {money(model.total.displayValue, 4)}.</div>
            </CardContent></Card></CardContent></Card>
          <div className="coverage-panel"><div><div className="eyebrow">Coverage boundaries</div><p>Validated facts lead; unsupported measures remain explicit and secondary.</p></div><div className="coverage-grid"><UnavailableCard title="Tagging coverage" explanation={unsupported("tagging_coverage")} /><UnavailableCard title="Projected next month" explanation={unsupported("next_month_forecast")} /><UnavailableCard title="Combined daily Technology Spend" explanation={unsupported("combined_daily_technology_spend")} /></div></div>
          <div className="signal-grid">
            <Card className="kpi-card shadow-sm" data-testid="top-signal-card"><CardHeader><CardTitle>Top canonical anomaly</CardTitle><CardDescription>Anomaly impact is diagnostic, not savings.</CardDescription></CardHeader><CardContent className="space-y-3"><Badge className="severity-critical">{topAnomaly.finding.severity.toUpperCase()}</Badge><div className="font-semibold">{topAnomaly.finding.title}</div><div className="grid grid-cols-3 text-sm"><div>Expected<br/><strong>{money(topAnomaly.expected.displayValue)}</strong></div><div>Observed<br/><strong>{money(topAnomaly.observed.displayValue)}</strong></div><div>Impact<br/><strong>{money(topAnomaly.impact.displayValue)}</strong></div></div><div className="h-28"><ResponsiveContainer><BarChart data={[{name:"Expected",value:topAnomaly.expected.displayValue},{name:"Observed",value:topAnomaly.observed.displayValue},{name:"Impact",value:topAnomaly.impact.displayValue}]}><XAxis dataKey="name"/><YAxis hide/><Tooltip formatter={(value)=>money(value)}/><Bar dataKey="value" fill="#8B6F47"/></BarChart></ResponsiveContainer></div><p className="text-xs text-brand-muted">{topAnomaly.finding.context}</p></CardContent></Card>
          </div>
        </section>

        <Card className="kpi-card shadow-sm mb-5" data-testid="triage-card"><CardContent className="py-4"><div className="flex items-center justify-between gap-4"><div><div className="font-semibold">Triage boundary</div><p className="text-sm text-brand-muted">Canonical findings support read-only review. No savings or remediation value is generated in the browser.</p></div><Button variant="outline" onClick={() => setReviewOpen(!reviewOpen)} className="btn-brand-outline">{reviewOpen ? "Hide review plan" : "Review plan"}</Button></div>{reviewOpen && <ol className="mt-4 list-decimal pl-5 text-sm space-y-2"><li>Confirm canonical evidence and accountable owner.</li><li>Validate the observed condition without treating anomaly impact as savings.</li><li>Obtain approval before any external change.</li><li>Verify cost and service health after approved action.</li></ol>}</CardContent></Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="mobile-section-nav"><label htmlFor="mobile-section-select">Dashboard section</label><select id="mobile-section-select" data-testid="mobile-section-select" value={activeTab} onChange={(event) => setActiveTab(event.target.value)}>{[["findings","Findings"],["products","Products"],["clouds","Clouds"],["kubernetes","Kubernetes"],["overview","Overview"],["ai-spend","AI Spend"],["saas","SaaS"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="tab-shell"><TabsList ref={tabRail} className="ccg-tabs" data-testid="primary-tabs" aria-label="Dashboard sections">
            {[["findings","Findings"],["products","Products"],["clouds","Clouds"],["kubernetes","Kubernetes"],["overview","Overview"],["ai-spend","AI Spend"],["saas","SaaS"]].map(([value,label]) => <TabsTrigger key={value} value={value} className="ccg-tab">{label}</TabsTrigger>)}
          </TabsList></div>

          <TabsContent value="findings" className="space-y-5"><div className="section-heading"><div><div className="eyebrow">Decision queue</div><h2>Canonical Findings</h2><p>Prioritized review with provenance and methodology kept close at hand.</p></div><Badge className="badge-brand">{model.findings.length} findings</Badge></div><div className="finding-list">{model.findings.map((item) => <FindingCard key={item.id} finding={item} onDetails={setFinding} />)}</div></TabsContent>

          <TabsContent value="products" className="space-y-5"><h2 className="section-title">Cloud Services</h2><Card className="kpi-card"><CardContent className="pt-6"><ResponsiveTable label="Cloud service costs"><Table><TableHeader><TableRow><TableHead>Canonical service</TableHead><TableHead>Provider</TableHead><TableHead className="text-right">Reporting-period cost</TableHead></TableRow></TableHeader><TableBody>{model.cloud.services.map((service) => <TableRow key={service.id}><TableCell>{service.dimensions.service}</TableCell><TableCell>{service.dimensions.provider.toUpperCase()}</TableCell><TableCell className="text-right">{money(service.displayValue)}</TableCell></TableRow>)}</TableBody></Table></ResponsiveTable></CardContent></Card></TabsContent>

          <TabsContent value="clouds" className="space-y-6"><div className="flex flex-wrap gap-2">{["aws","azure","gcp"].map((name) => <Button key={name} variant={provider === name ? "default" : "outline"} onClick={() => setProvider(name)} className={provider === name ? "btn-brand-primary" : "btn-brand-outline"}>{name.toUpperCase()}</Button>)}</div>{provider !== "aws" ? <UnavailableCard title={`${provider.toUpperCase()} canonical data`} explanation={`No ${provider.toUpperCase()} ingestion is represented in this trusted report.`} /> : <><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><MetricCard title="AWS Cloud scope" value={money(model.cloud.total.displayValue)} subtitle={periodLabel(model.cloud.total.trace.period)} icon={Cloud} />{model.cloud.comparison.slice(1).map((metric) => <MetricCard key={metric.id} title={metric.name} value={metric.trace.unit === "percent" ? `${metric.value}%` : money(metric.displayValue)} subtitle="Canonical cloud comparison metric" icon={Activity} />)}</div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card className="kpi-card"><CardHeader><CardTitle>Canonical daily Cloud spend</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer><LineChart data={cloudDaily}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><Line dataKey="cost" stroke="#8B6F47" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></CardContent></Card><Card className="kpi-card"><CardHeader><CardTitle>Cloud services</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer><BarChart data={cloudServices}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={(value)=>money(value)}/><Bar dataKey="cost" fill="#6b8f71"/></BarChart></ResponsiveContainer></div></CardContent></Card></div></>}</TabsContent>

          <TabsContent value="kubernetes"><UnavailableCard title="Kubernetes cost and utilization" explanation={unsupported("kubernetes_cost_or_utilization")} /></TabsContent>

          <TabsContent value="overview" className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><MetricCard title="Reconciliation" value="Passed" subtitle={`Difference USD ${model.reconciliation.difference}`} icon={CheckCircle}/><MetricCard title="Recoverability" value="Not demonstrated" subtitle="Modeled and observed evidence remain distinct" icon={ShieldCheck}/><UnavailableCard title="Opportunity aggregate" explanation="One annual source opportunity exists, but no canonical aggregate was published." /></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card className="kpi-card"><CardHeader><CardTitle>Modeled resilience metrics</CardTitle><CardDescription>Estimated scenario values; not demonstrated recovery.</CardDescription></CardHeader><CardContent className="space-y-2">{model.resilience.modeled.filter((m)=>["hours","currency"].includes(m.trace.unit)).slice(0,8).map((m)=><div key={m.id} className="flex justify-between text-sm"><span>{m.name}</span><strong>{m.trace.unit === "currency" ? money(m.displayValue) : `${m.value} hours`}</strong></div>)}</CardContent></Card><Card className="kpi-card"><CardHeader><CardTitle>Observed restore-test metrics</CardTitle><CardDescription>Observed evidence remains separate from modeled values.</CardDescription></CardHeader><CardContent className="space-y-3">{model.resilience.observed.map((m)=><div key={m.id} className="flex justify-between"><span>{m.name}</span><strong>{m.value} hours</strong></div>)}</CardContent></Card></div></TabsContent>

          <TabsContent value="ai-spend" className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><MetricCard title="Canonical direct-AI scope" value={money(model.ai.directScope.displayValue,4)} subtitle="Additive Technology Spend input · direct vendors only" icon={Bot}/><MetricCard title="Broader AI domain analysis" value={money(model.ai.domainTotal.displayValue,4)} subtitle="Non-additive; includes provider-billed AI already represented in Cloud" icon={Info}/></div><Card className="kpi-card"><CardHeader><CardTitle>Supported model/provider cost metrics</CardTitle><CardDescription>Illustrative usage evidence only; not current vendor pricing.</CardDescription></CardHeader><CardContent><ResponsiveTable label="AI model and provider costs"><Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Provider</TableHead><TableHead>Billing channel</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader><TableBody>{aiModels.map((item)=><TableRow key={item.id}><TableCell>{item.model}</TableCell><TableCell>{item.provider}</TableCell><TableCell>{item.billingChannel.replaceAll("_"," ")}</TableCell><TableCell className="text-right">{money(item.cost,4)}</TableCell></TableRow>)}</TableBody></Table></ResponsiveTable></CardContent></Card></TabsContent>

          <TabsContent value="saas" className="space-y-6"><MetricCard title="Canonical SaaS scope" value={money(model.saas.scope.displayValue)} subtitle={`${periodLabel(model.saas.scope.trace.period)} · same-period allocated spend`} icon={Layers}/><div className="grid grid-cols-1 md:grid-cols-2 gap-6">{model.saas.invoices.map((invoice)=><Card key={invoice.id} className="kpi-card"><CardHeader><CardTitle>{invoice.dimensions.application}</CardTitle><CardDescription>{invoice.dimensions.billing_cadence} supplied invoice evidence</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{money(invoice.displayValue)}</div><p className="text-xs text-brand-muted mt-2">{periodLabel(invoice.trace.period)}. This invoice is not added to the canonical SaaS scope.</p></CardContent></Card>)}</div><UnavailableCard title="Combined invoice total" explanation="Annual and quarterly invoice records cover incompatible periods; no canonical combined invoice metric exists." /></TabsContent>
        </Tabs>
      </main>
      <FindingModal finding={finding} onClose={() => setFinding(null)} />
      {!finding && <AskClaude />}
    </div>
  );
}

export default Dashboard;
