import React, { useState } from "react";
import "./App.css";
import {
  CCAC_DASHBOARD_UNAVAILABLE_MESSAGE,
  CcacDashboardViewUnavailableError,
  getValidatedCcacDashboardView,
} from "./lib/ccacDashboardView";
import logo from "./assets/cloud-and-capital-icon.png";
import AskClaude from "./components/AskClaude";
import TriageCard from "./components/TriageCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { AlertTriangle, BarChart3, Bot, Calendar, DollarSign, Layers } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const unavailableText = (reason) => reason ? `Unavailable — ${String(reason).replaceAll("_", " ")}` : "Unavailable";

// Display-only decimal formatting. The canonical string is never parsed, rounded,
// aggregated, annualized, or otherwise recalculated.
export const formatCanonicalDecimal = (value, { currency = false, percent = false } = {}) => {
  if (value === null || value === undefined) return "Unavailable";
  const text = String(value);
  const match = text.match(/^(-?)(\d+)(\.\d+)?$/);
  if (!match) return text;
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency ? "$" : ""}${match[1]}${grouped}${match[3] || ""}${percent ? "%" : ""}`;
};

const metricText = (metric) => metric?.value === null
  ? unavailableText(metric?.unknown_reason)
  : formatCanonicalDecimal(metric?.value, {
      currency: metric?.trace?.unit === "currency" || metric?.trace?.unit === "currency_per_million_tokens" || metric?.trace?.currency === "USD",
      percent: metric?.trace?.unit === "percent",
    });

const displayService = (service) => ({ AmazonEC2: "Amazon EC2", AmazonS3: "Amazon S3" }[service] || service);
const displayFindingTitle = (title) => String(title).replaceAll("AmazonEC2", "Amazon EC2").replaceAll("AmazonS3", "Amazon S3");
const periodLabel = (period) => period ? `${period.start} – ${period.end} · ${period.timezone}` : "Canonical period unavailable";

const QualityBadge = ({ quality }) => (
  <Badge className={quality === "valid" ? "badge-brand" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}>
    {quality || "unknown"}
  </Badge>
);

const MetricCard = ({ title, metric, icon: Icon = DollarSign, subtitle }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <Icon className="h-4 w-4 text-brand-light-muted" />
    </CardHeader>
    <CardContent className="py-3">
      <div className="text-2xl font-bold text-brand-ink" data-canonical-id={metric?.id}>{metricText(metric)}</div>
      <p className="text-xs text-brand-muted mt-1">{subtitle || periodLabel(metric?.trace?.period)}</p>
      {metric?.trace?.quality && <div className="mt-2"><QualityBadge quality={metric.trace.quality} /></div>}
    </CardContent>
  </Card>
);

const UnsupportedCard = ({ title, entry }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader><CardTitle className="text-brand-ink">{title}</CardTitle></CardHeader>
    <CardContent>
      <p className="text-sm font-medium text-brand-muted">Unavailable in the validated view</p>
      <p className="text-xs text-brand-muted mt-2">{entry?.explanation}</p>
    </CardContent>
  </Card>
);

const FindingCard = ({ finding, onOpen }) => (
  <Card className="finding-card shadow-sm hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="text-sm font-medium text-brand-ink">{displayFindingTitle(finding.title)}</CardTitle>
        <Badge className={`severity-${finding.severity}`}>{String(finding.severity).toUpperCase()}</Badge>
      </div>
      <CardDescription>{finding.type.replaceAll("_", " ")} · {finding.status}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <QualityBadge quality={finding.quality} />
        <button className="text-sm text-brand-accent underline" onClick={() => onOpen(finding)}>View details</button>
      </div>
    </CardContent>
  </Card>
);

const UnavailableDashboard = () => (
  <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
    <Header period="Validated source unavailable" />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Alert role="alert" className="max-w-2xl mx-auto alert-brand">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{CCAC_DASHBOARD_UNAVAILABLE_MESSAGE}</AlertDescription>
      </Alert>
    </main>
    <AskClaude />
  </div>
);

const Header = ({ period }) => (
  <header className="nav-header">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <img src={logo} alt="Cloud & Capital" className="brand-logo" />
          <div className="leading-tight">
            <h1 className="brand-title">Cloud+ Cost Guard</h1>
            <p className="text-[15px] text-brand-muted">Technology spend decision support <span style={{ opacity: 0.62, fontSize: "11px" }}>· Illustrative demo</span></p>
          </div>
        </div>
        <div className="btn-brand-outline rounded-2xl flex items-center px-4 h-10 text-xs sm:text-sm text-brand-muted">
          <Calendar className="h-4 w-4 mr-2" />{period}
        </div>
      </div>
    </div>
  </header>
);

const Dashboard = () => {
  const [selectedFinding, setSelectedFinding] = useState(null);
  let view;
  try {
    view = getValidatedCcacDashboardView();
  } catch (error) {
    if (error instanceof CcacDashboardViewUnavailableError) return <UnavailableDashboard />;
    throw error;
  }

  const metricById = new Map();
  const add = (metrics) => metrics.forEach((metric) => metricById.set(metric.id, metric));
  add([view.cloud.total, ...view.cloud.comparison, ...view.cloud.services, ...view.cloud.daily, view.ai.total, ...view.ai.metrics,
    ...view.saas.invoice_metrics, ...view.resilience.modeled_metrics, ...view.resilience.observed_restore_metrics]);
  view.anomalies.forEach((item) => add([item.observed, item.expected, item.impact, item.percentage_change, item.score]));

  const unsupported = Object.fromEntries(view.unsupported.map((item) => [item.concept, item]));
  const cloudChange = view.cloud.comparison.find((metric) => metric.id === "metric.cloud.change-percentage");
  const aiCostMetrics = view.ai.metrics.filter((metric) => metric.trace.unit === "currency" && metric.dimensions?.model);
  const aiRequestMetrics = view.ai.metrics.filter((metric) => metric.trace.unit === "requests");
  const saasOpportunity = view.opportunity.annual_aggregate;
  const period = periodLabel(view.cloud.total.trace.period);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      <Header period={period} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-4 text-xs text-brand-muted flex flex-wrap items-center gap-3">
          <span><span className="font-medium">Data:</span> Validated CCAC illustrative dashboard view</span><span>•</span>
          <span>Snapshot: {view.identity.generated_at}</span>
        </div>

        <div className="space-y-6 mb-8">
          <Card className="kpi-card shadow-sm">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-1">Cloud infrastructure spend</div>
                  <div className="text-4xl font-bold text-brand-ink" data-canonical-id={view.cloud.total.id}>{metricText(view.cloud.total)}</div>
                  <div className="text-sm text-brand-muted mt-2" data-canonical-id={cloudChange?.id}>{metricText(cloudChange)} vs previous equal-length period</div>
                </div>
                <div className="md:text-right"><div className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Combined technology spend</div><div className="text-lg font-semibold text-brand-muted mt-1">Unavailable</div><div className="text-xs text-brand-muted">{unsupported.combined_technology_spend.explanation}</div></div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard title="Cloud Infrastructure" metric={view.cloud.total} />
            <MetricCard title="AI / LLM Spend" metric={view.ai.total} icon={Bot} subtitle="Non-additive outside the AI domain" />
            <MetricCard title="SaaS Tools" metric={view.saas.invoice_metrics[0]} icon={Layers} subtitle="Partial-quality invoice metric; no combined SaaS total" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="kpi-card shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Daily Cloud Spend</CardTitle><CardDescription>Canonical order · {period}</CardDescription></CardHeader><CardContent><div style={{width:"100%",height:280}}><ResponsiveContainer><LineChart data={view.cloud.daily}><CartesianGrid strokeDasharray="3 3" stroke="#EEE"/><XAxis dataKey="dimensions.date" fontSize={11}/><YAxis fontSize={11}/><Tooltip formatter={(value) => [formatCanonicalDecimal(value,{currency:true}),"Cloud spend"]}/><Line type="monotone" dataKey="value" stroke="#8B6F47" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></CardContent></Card>
            <Card className="kpi-card shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Cloud Services</CardTitle><CardDescription>Canonical service order</CardDescription></CardHeader><CardContent><div style={{width:"100%",height:280}}><ResponsiveContainer><BarChart data={view.cloud.services.map((metric)=>({...metric,label:displayService(metric.dimensions.service)}))}><CartesianGrid strokeDasharray="3 3" stroke="#EEE"/><XAxis dataKey="label"/><YAxis/><Tooltip formatter={(value)=>[formatCanonicalDecimal(value,{currency:true}),"Cost"]}/><Bar dataKey="value" fill="#6b8f71"/></BarChart></ResponsiveContainer></div></CardContent></Card>
          </div>
        </div>

        <div className="mb-6"><TriageCard findings={view.findings} generatedAt={view.identity.generated_at} /></div>

        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="ccg-tabs">
            <TabsTrigger value="findings" className="ccg-tab">Findings</TabsTrigger><TabsTrigger value="products" className="ccg-tab">Products</TabsTrigger><TabsTrigger value="clouds" className="ccg-tab">Clouds</TabsTrigger><TabsTrigger value="kubernetes" className="ccg-tab">Kubernetes</TabsTrigger><TabsTrigger value="overview" className="ccg-tab">Overview</TabsTrigger><TabsTrigger value="ai-spend" className="ccg-tab">AI Spend</TabsTrigger><TabsTrigger value="saas" className="ccg-tab">SaaS</TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between"><h2 className="font-brand-serif text-[20px] font-semibold">Cost Optimization Findings</h2><Badge className="badge-brand">{view.findings.length} findings</Badge></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{view.findings.map((finding)=><FindingCard key={finding.id} finding={finding} onOpen={setSelectedFinding}/>)}</div>
            {selectedFinding && <Card className="kpi-card shadow-sm" role="dialog" aria-label="Finding details"><CardHeader><CardTitle>{displayFindingTitle(selectedFinding.title)}</CardTitle><CardDescription>{selectedFinding.context}</CardDescription></CardHeader><CardContent className="space-y-2"><p className="text-sm text-brand-muted">Canonical metrics</p>{selectedFinding.metric_ids.map((id)=><div key={id} className="text-sm" data-canonical-id={id}>{metricById.has(id) ? metricText(metricById.get(id)) : "Referenced canonical metric is not projected for display"}</div>)}</CardContent></Card>}
          </TabsContent>

          <TabsContent value="products" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">Product Cost Breakdown</h2><Card className="kpi-card"><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="text-right">Cost</TableHead><TableHead>Quality</TableHead></TableRow></TableHeader><TableBody>{view.cloud.services.map((metric)=><TableRow key={metric.id}><TableCell>{displayService(metric.dimensions.service)}</TableCell><TableCell className="text-right" data-canonical-id={metric.id}>{metricText(metric)}</TableCell><TableCell><QualityBadge quality={metric.trace.quality}/></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

          <TabsContent value="clouds" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">Cloud Cost Management</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><MetricCard title="AWS cloud cost" metric={view.cloud.total}/><UnsupportedCard title="Azure and GCP breakdown" entry={{explanation:"The validated view projects AWS cloud metrics only; no other provider value is available."}}/></div></TabsContent>
          <TabsContent value="kubernetes" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">Kubernetes Cost Visibility</h2><UnsupportedCard title="Kubernetes cost and utilization" entry={unsupported.kubernetes_cost_or_utilization}/></TabsContent>

          <TabsContent value="overview" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">Cost Overview</h2><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card className="kpi-card"><CardHeader><CardTitle>Anomaly Signals</CardTitle><CardDescription>Impact is not a savings estimate</CardDescription></CardHeader><CardContent className="space-y-3">{view.anomalies.map((item)=><div key={item.finding.id} className="p-3 border rounded-lg"><div className="font-medium">{displayFindingTitle(item.finding.title)}</div><div className="text-sm text-brand-muted mt-1">Observed <span data-canonical-id={item.observed.id}>{metricText(item.observed)}</span> · Expected <span data-canonical-id={item.expected.id}>{metricText(item.expected)}</span> · Impact <span data-canonical-id={item.impact.id}>{metricText(item.impact)}</span></div></div>)}</CardContent></Card><Card className="kpi-card"><CardHeader><CardTitle>Annual Estimated Opportunity</CardTitle><CardDescription>{saasOpportunity.label}</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold" data-canonical-id={saasOpportunity.id}>{formatCanonicalDecimal(saasOpportunity.low,{currency:true})} – {formatCanonicalDecimal(saasOpportunity.high,{currency:true})}</div><p className="text-xs text-brand-muted mt-2">Annual · estimated · low confidence · not verified savings</p></CardContent></Card></div><Card className="kpi-card"><CardHeader><CardTitle>Resilience economics</CardTitle><CardDescription>Canonical modeled metrics in contractual order; modeled values do not demonstrate recoverability</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Canonical value</TableHead><TableHead>Quality</TableHead></TableRow></TableHeader><TableBody>{view.resilience.modeled_metrics.map((metric)=><TableRow key={metric.id}><TableCell>{metric.name}</TableCell><TableCell className="text-right" data-canonical-id={metric.id}>{metricText(metric)}</TableCell><TableCell><QualityBadge quality={metric.trace.quality}/></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

          <TabsContent value="ai-spend" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">AI Spend</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><MetricCard title="Total AI Spend" metric={view.ai.total} icon={Bot}/><MetricCard title="Requests (first canonical allocation)" metric={aiRequestMetrics[0]} icon={Layers}/><UnsupportedCard title="AI forecast" entry={unsupported.next_month_forecast}/></div><Card className="kpi-card"><CardHeader><CardTitle>AI model costs</CardTitle><CardDescription>Canonical allocation order; values are not recomputed into shares</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Provider</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader><TableBody>{aiCostMetrics.map((metric)=><TableRow key={metric.id}><TableCell>{metric.dimensions.model}</TableCell><TableCell>{metric.dimensions.provider}</TableCell><TableCell className="text-right" data-canonical-id={metric.id}>{metricText(metric)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

          <TabsContent value="saas" className="space-y-6"><h2 className="font-brand-serif text-[20px] font-semibold">SaaS Spend</h2><Alert className="alert-brand"><AlertTriangle className="h-4 w-4"/><AlertDescription>SaaS producer quality is partial. Unknown activity and incomplete assignment data are not treated as zero or unused.</AlertDescription></Alert><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">{view.saas.invoice_metrics.map((metric)=><MetricCard key={metric.id} title={metric.name} metric={metric} icon={Layers}/>)}</div><Card className="kpi-card"><CardHeader><CardTitle>{view.opportunity.source.title}</CardTitle><CardDescription>Annual estimate · {view.opportunity.source.confidence} confidence · review required</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold" data-canonical-id={view.opportunity.source.id}>{formatCanonicalDecimal(view.opportunity.source.estimate.low,{currency:true})} – {formatCanonicalDecimal(view.opportunity.source.estimate.high,{currency:true})}</div><p className="text-xs text-brand-muted mt-2">{view.opportunity.source.estimate.formula}</p></CardContent></Card></TabsContent>
        </Tabs>

        <section className="mt-8"><Card className="kpi-card"><CardHeader><CardTitle>Methodology & disclosures</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-brand-muted">{view.identity.disclosures.map((text)=><li key={text}>• {text}</li>)}</ul></CardContent></Card></section>
      </main>
      <AskClaude />
    </div>
  );
};

export default function App() { return <div className="App"><Dashboard /></div>; }
