import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";
import { getCloudCapitalReport } from "./lib/report";

// Local brand icon
import logo from "./assets/cloud-and-capital-icon.png";

// AI/automation demo card
import TriageCard from "./components/TriageCard";

// Ask Claude floating assistant
import AskClaude from "./components/AskClaude";

// Recharts
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine
} from "recharts";

// UI
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Separator } from "./components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

// Icons
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Eye, Download, BarChart3, Activity, PieChart as PieChartIcon,
  TrendingUp as TrendingUpIcon, Calendar, CheckCircle, XCircle, X,
  Bot, Layers, Server
} from "lucide-react";

/** IMPORTANT: same-origin proxy */
const API = "/api";

/* -------- Utils -------- */
const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace?.(/[^0-9.-]/g, "") ?? v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(amount || 0));

const formatPercent = (percent) => {
  const p = Number(percent || 0);
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
};

/* US date for "Last Updated" */
const formatTimestamp = (ts) => {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12; if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min} ${ampm}`;
};

const getDataFreshnessHours = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 36e5);
};

const getConfidenceColor = (confidence) => ({
  very_high: "text-green-700 bg-green-50",
  high: "text-green-600 bg-green-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-red-600 bg-red-50",
}[String(confidence || "").toLowerCase()] || "text-yellow-600 bg-yellow-50");

const getRiskColor = (risk) => ({
  Low: "text-green-700",
  Medium: "text-yellow-600",
  High: "text-red-600",
}[risk] || "text-yellow-600");

const getSeverityColor = (severity) => ({
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
}[String(severity || "").toLowerCase()] || "severity-medium");

// Uniform severity icons (force size/color everywhere)
const getSeverityIcon = (severity) => {
  const s = String(severity || "").toLowerCase();
  const common = "severity-icon";
  if (s === "critical") return <XCircle className={`${common} severity-icon--critical`} />;
  if (s === "high") return <AlertTriangle className={`${common} severity-icon--high`} />;
  if (s === "medium") return <AlertTriangle className={`${common} severity-icon--medium`} />;
  if (s === "low") return <CheckCircle className={`${common} severity-icon--low`} />;
  return <AlertTriangle className={common} />;
};

/* Choose the most relevant command to display for a finding */
const pickBestCommand = (f) => {
  const cmds = Array.isArray(f?.commands) ? f.commands : [];
  if (!cmds.length) return null;
  const lcTitle = String(f?.title || "").toLowerCase();
  const lcType  = String(f?.type  || "").toLowerCase();
  const serviceHints = [
    { hint: ["ec2","instance","underutilized","autoscaling"], match: /aws\s+ec2|autoscaling/i },
    { hint: ["ebs","volume","unattached"],                     match: /aws\s+ec2.*(describe-volumes|delete-volume)/i },
    { hint: ["eip","elastic ip"],                              match: /aws\s+ec2.*(describe-addresses|release-address)/i },
    { hint: ["rds","db"],                                      match: /aws\s+rds/i },
    { hint: ["s3","bucket"],                                   match: /aws\s+s3|s3api/i },
    { hint: ["lambda"],                                        match: /aws\s+(logs|lambda)/i },
    { hint: ["elb","load balancer"],                           match: /aws\s+elbv2/i },
    { hint: ["cloudwatch","anomaly","ce"],                     match: /aws\s+ce\s+get-cost-and-usage/i },
    { hint: ["nat"],                                           match: /aws\s+ec2.*nat/i },
  ];
  for (const s of serviceHints) {
    if (s.hint.some(h => lcTitle.includes(h) || lcType.includes(h))) {
      const found = cmds.find(c => s.match.test(c));
      if (found) return found;
    }
  }
  const ce = cmds.find(c => /aws\s+ce\s+get-cost-and-usage/i.test(c));
  if (ce) return ce;
  return cmds[0];
};


/* -------- Findings sort/pick -------- */
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const sortAndPickFindings = (arr, limit = 9) => {
  const safe = Array.isArray(arr) ? arr : [];
  return [...safe]
    .sort((a, b) => {
      const va = toNumber(a.monthly_savings_usd_est);
      const vb = toNumber(b.monthly_savings_usd_est);
      if (vb !== va) return vb - va;
      const sa = SEVERITY_ORDER[String(a.severity || "").toLowerCase()] ?? 99;
      const sb = SEVERITY_ORDER[String(b.severity || "").toLowerCase()] ?? 99;
      return sa - sb;
    })
    .slice(0, limit);
};

/* -------- Presentational components -------- */
const KPICard = ({ title, value, change, icon: Icon, subtitle, dataFreshness }) => (
  <Card className="kpi-card shadow-sm hover:shadow-brand-md transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-brand-muted">{title}</CardTitle>
      <div className="flex items-center">
        <Icon className="h-4 w-4 text-brand-light-muted" />
        {Number.isFinite(dataFreshness) && dataFreshness < 1 && (
          <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-green-50 text-green-700">LIVE</span>
        )}
        {Number.isFinite(dataFreshness) && dataFreshness >= 1 && (
          <span className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] bg-[#F2EFEA] text-brand-light-muted">{dataFreshness}h</span>
        )}
      </div>
    </CardHeader>
    <CardContent className="py-3">
      <div className="text-2xl font-bold text-brand-ink">{value}</div>
      {Number.isFinite(change) ? (
        <p className="text-xs text-brand-muted flex items-center gap-1 mt-1">
          {change >= 0 ? <TrendingUp className="h-3 w-3 text-brand-error" /> : <TrendingDown className="h-3 w-3 text-brand-success" />}
          <span className={change >= 0 ? "text-brand-error" : "text-brand-success"}>{formatPercent(change)}</span>
          {subtitle}
        </p>
      ) : (
        subtitle && <p className="text-xs text-brand-muted mt-1">{subtitle}</p>
      )}
    </CardContent>
  </Card>
);

const CostTrendChart = ({ data, height = 300, label = "Cost trends over the last 30 days" }) => {
  const avg = Array.isArray(data) && data.length ? data.reduce((s, d) => s + (Number(d.cost) || 0), 0) / data.length : 0;
  return (
    <Card className="kpi-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-brand-ink">
          <BarChart3 className="h-5 w-5" />Daily Spend Trend
        </CardTitle>
        <CardDescription className="text-brand-muted">{label}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
              <XAxis dataKey="formatted_date" stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} />
              <YAxis stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(value) => [formatCurrency(value), "Daily Cost"]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              {avg > 0 && <ReferenceLine y={avg} stroke="#AAA" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="cost" stroke="#8B6F47" strokeWidth={3} dot={{ fill: "#8B6F47", r: 3 }} activeDot={{ r: 5, fill: "#8B6F47" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

/* -------- Simple Modal (no extra deps) -------- */
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#E7DCCF] px-4 py-3">
          <h3 className="text-sm font-semibold text-brand-ink">{title}</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-brand-bg/80"
          >
            <X className="h-4 w-4 text-brand-muted" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[#E7DCCF] px-4 py-3">
          <Button variant="outline" onClick={onClose} className="btn-brand-outline">Close</Button>
        </div>
      </div>
    </div>
  );
};

const FindingCard = ({ finding, onViewDetails }) => (
  <Card className="finding-card shadow-sm">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {getSeverityIcon(finding.severity)}
          <CardTitle className="text-sm font-medium text-brand-ink">{finding.title}</CardTitle>
        </div>
        <div className="flex flex-col gap-1">
          <Badge className={getSeverityColor(finding.severity) + " px-2 py-1 text-xs font-medium rounded-md"}>
            {String(finding.severity || "").toUpperCase()}
          </Badge>
          {finding.confidence && (
            <Badge className={getConfidenceColor(finding.confidence) + " px-2 py-1 text-xs rounded-md"}>
              {String(finding.confidence).replace("_", " ").toUpperCase()} CONF
            </Badge>
          )}
        </div>
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-muted">Monthly Savings</span>
          <span className="text-lg font-semibold text-brand-success">{formatCurrency(finding.monthly_savings_usd_est)}</span>
        </div>

        {finding.evidence && (finding.evidence.resource_id || finding.evidence.region || finding.evidence.instance_type) && (
          <div className="evidence-box">
            {finding.evidence.resource_id && <div className="font-mono text-brand-muted"><span className="evidence-label">Resource:</span> {finding.evidence.resource_id}</div>}
            {finding.evidence.region && <div className="text-brand-muted"><span className="evidence-label">Region:</span> {finding.evidence.region}</div>}
            {finding.evidence.instance_type && <div className="text-brand-muted"><span className="evidence-label">Type:</span> {finding.evidence.instance_type}</div>}
          </div>
        )}

        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">Risk: <span className={getRiskColor(finding.risk_level)}>{finding.risk_level}</span></span>
          {finding.implementation_time && <span className="text-brand-muted">Time: {finding.implementation_time}</span>}
        </div>

        {finding.suggested_action && <p className="text-sm text-brand-ink">{finding.suggested_action}</p>}

        {finding.commands && finding.commands.length > 0 && (
          <div className="p-3 rounded-lg border border-[#E7DCCF] bg-[#F7F1EA]"><code className="text-xs font-mono text-brand-ink">{pickBestCommand(finding)}</code></div>
        )}

        <div className="flex items-center justify-between text-xs text-brand-muted">
          {finding.last_analyzed && <span>Analyzed: {formatTimestamp(finding.last_analyzed)}</span>}
        </div>

        <Button variant="outline" size="sm" onClick={() => onViewDetails(finding)} className="w-full btn-brand-outline">
          <Eye className="h-3 w-3 mr-1" />
          View Details & Methodology
        </Button>
      </div>
    </CardContent>
  </Card>
);

const ProductTable = ({ products }) => (
  <div className="table-brand rounded-lg">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-brand-muted font-semibold">Product</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">30d Cost</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">WoW Change</TableHead>
          <TableHead className="text-right text-brand-muted font-semibold">% of Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p, i) => {
          const wow = toNumber(p.wow_delta || p.wow_usd || 0);
          const label = p.product || p.name || p.service || "—";
          const amount = toNumber(p.amount_usd || p.amount || 0);
          const pct = toNumber(p.percent_of_total || 0);
          return (
            <TableRow key={i} className="hover:bg-brand-bg/30">
              <TableCell className="font-medium text-brand-ink">{label}</TableCell>
              <TableCell className="text-right text-brand-ink">{formatCurrency(amount)}</TableCell>
              <TableCell className="text-right">
                <div className={`flex items-center justify-end gap-1 ${wow >= 0 ? "text-brand-error" : "text-brand-success"}`}>
                  {wow >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatCurrency(Math.abs(wow))}
                </div>
              </TableCell>
              <TableCell className="text-right text-brand-ink">{pct.toFixed(1)}%</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

const AiModelBreakdown = ({ models }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <PieChartIcon className="h-5 w-5" />Cost by Model
      </CardTitle>
      <CardDescription className="text-brand-muted">AI model spend breakdown this period</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="flex items-center justify-between">
        <div style={{ width: "55%", height: 260 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={models} cx="50%" cy="50%" innerRadius={45} outerRadius={105} paddingAngle={2} dataKey="value">
                {models.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(val, _n, props) => [formatCurrency(val), `${props.payload.name} (${props.payload.percentage}%)`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-2/5 space-y-2">
          {models.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.fill }} />
                <span className="text-brand-ink text-xs truncate" style={{ maxWidth: "7rem" }}>{m.name}</span>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="font-semibold text-brand-ink text-xs">{formatCurrency(m.value)}</div>
                <div className="text-xs text-brand-muted">{m.percentage}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const SaasToolChart = ({ tools }) => {
  const data = tools.map(t => ({ name: t.tool, cost: toNumber(t.cost) }));
  return (
    <Card className="kpi-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-brand-ink">
          <BarChart3 className="h-5 w-5" />Cost by Tool
        </CardTitle>
        <CardDescription className="text-brand-muted">Monthly SaaS spend per product</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEE" horizontal={false} />
              <XAxis type="number" stroke="#7A6B5D" fontSize={11} tick={{ fill: "#7A6B5D" }}
                tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
              <YAxis type="category" dataKey="name" stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} width={72} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                formatter={(value) => [formatCurrency(value), "Monthly Cost"]}
              />
              <Bar dataKey="cost" fill="#8B6F47" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const SaasMonthlyChart = ({ data }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <TrendingUpIcon className="h-5 w-5" />Month-over-Month Trend
      </CardTitle>
      <CardDescription className="text-brand-muted">SaaS spend over the last 4 months</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
            <XAxis dataKey="month" stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }} />
            <YAxis stroke="#7A6B5D" fontSize={12} tick={{ fill: "#7A6B5D" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
              formatter={(value) => [formatCurrency(value), "Monthly Cost"]}
            />
            <Line type="monotone" dataKey="cost" stroke="#8B6F47" strokeWidth={3}
              dot={{ fill: "#8B6F47", r: 5 }} activeDot={{ r: 7, fill: "#8B6F47" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const SaasUnusedTable = ({ tools }) => (
  <Card className="kpi-card shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-brand-ink">
        <AlertTriangle className="h-5 w-5" />License Utilization
      </CardTitle>
      <CardDescription className="text-brand-muted">Seat usage and unused licenses per tool</CardDescription>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="table-brand rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-brand-muted font-semibold">Tool</TableHead>
              <TableHead className="text-right text-brand-muted font-semibold">Monthly Cost</TableHead>
              <TableHead className="text-right text-brand-muted font-semibold">Licensed</TableHead>
              <TableHead className="text-right text-brand-muted font-semibold">Active</TableHead>
              <TableHead className="text-right text-brand-muted font-semibold">Unused</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((t, i) => (
              <TableRow key={i} className="hover:bg-brand-bg/30">
                <TableCell className="font-medium text-brand-ink">{t.tool}</TableCell>
                <TableCell className="text-right text-brand-ink">{formatCurrency(toNumber(t.cost))}</TableCell>
                <TableCell className="text-right text-brand-ink">{t.seats_licensed > 0 ? t.seats_licensed : "—"}</TableCell>
                <TableCell className="text-right text-brand-ink">{t.seats_active > 0 ? t.seats_active : "—"}</TableCell>
                <TableCell className="text-right">
                  {t.unused > 0
                    ? <span className="font-semibold text-brand-error">{t.unused}</span>
                    : <span className="text-brand-success">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);

/* -------- Main -------- */
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [keyInsights, setKeyInsights] = useState({});
  const [aiTrend, setAiTrend] = useState([]);
  const [saasBaseTrend, setSaasBaseTrend] = useState([]);
  const [k8sData, setK8sData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState("30d");

  const report = getCloudCapitalReport();
  const costBaseline = report?.cost_baseline || {};
  const anomalies = report?.anomalies || {};
  const resilience = report?.resilience || {};
  const reportWindowLabel = report?.window?.label || "Last 30 days";
  const tagging = report?.tagging || {};
  const coveragePct = tagging.coverage_pct ?? 73;
  const untaggedPct = tagging.untagged_pct ?? 27;
  const hasCostData = costBaseline?.cost_status?.has_data !== false;

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFinding, setModalFinding] = useState(null);

  useEffect(() => {
    loadAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const totalCost = hasCostData ? toNumber(costBaseline.total_cost) : 0;
      const dailyAverage = hasCostData ? toNumber(costBaseline.daily_average) : 0;
      const trendPct = hasCostData ? toNumber(costBaseline?.trend?.change_percentage) : null;
      const dataFreshnessHours = getDataFreshnessHours(report?.generated_at);

      const topServices = Array.isArray(costBaseline.top_services) ? costBaseline.top_services : [];
      const products = topServices.map((svc) => ({
        product: svc.service_name || "—",
        amount_usd: toNumber(svc.total_cost),
        percent_of_total: toNumber(svc.percentage_of_total),
        wow_delta: 0
      }));

      const resilienceWorkloads = Array.isArray(resilience.top_workloads) ? resilience.top_workloads : [];
      const moversSeed = Array.isArray(anomalies.recent) ? anomalies.recent : [];
      const recentFindings = [...resilienceWorkloads]
        .sort((a, b) => toNumber(b.total_monthly_resilience_cost) - toNumber(a.total_monthly_resilience_cost))
        .map((w, idx) => ({
          finding_id: `resilience-${w.workload || idx}`,
          title: w.workload || "—",
          severity: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
          monthly_savings_usd_est: toNumber(w.total_monthly_resilience_cost)
        }));

      setSummary({
        generated_at: report?.generated_at,
        kpis: {
          total_30d_cost: totalCost,
          wow_percent: trendPct,
          data_freshness_hours: dataFreshnessHours,
          last_updated: report?.generated_at
        },
        top_products: products,
        recent_findings: recentFindings
      });

      // Demo findings are derived directly from unified report sections:
      // anomalies.recent + resilience.top_workloads.
      const anomalyFindings = moversSeed.map((item, idx) => {
        const group = item.group || "Cloud Service";
        const severity = String(item.severity || "medium").toLowerCase();
        const normalizedSeverity = ["critical", "high", "medium", "low"].includes(severity) ? severity : "medium";
        const anomalyDelta = Math.max(0, toNumber(item.delta));
        const monthlySavingsEstimate = Number((anomalyDelta * 6).toFixed(2));
        return {
          finding_id: `anomaly-${idx}-${String(group).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: `${group} spend anomaly above baseline`,
          type: "anomaly",
          severity: normalizedSeverity,
          confidence: normalizedSeverity === "critical" || normalizedSeverity === "high" ? "high" : "medium",
          monthly_savings_usd_est: monthlySavingsEstimate,
          risk_level: normalizedSeverity === "critical" ? "High" : "Medium",
          implementation_time: "1-3 hours",
          suggested_action: `Investigate ${group} usage growth, validate workload changes, and apply scaling or budget guardrails to reduce repeat spikes.`,
          commands: [
            `aws ce get-cost-and-usage --time-period Start=${String(item.timestamp || "").slice(0, 10)},End=${String(item.timestamp || "").slice(0, 10)} --granularity DAILY --metrics BlendedCost --group-by Type=DIMENSION,Key=SERVICE`
          ],
          last_analyzed: item.timestamp || report?.generated_at,
          evidence: {
            service: group,
            baseline: toNumber(item.baseline),
            current: toNumber(item.current),
            delta_usd: anomalyDelta,
            delta_pct: toNumber(item.delta_pct)
          },
          methodology: "Derived from report.anomalies.recent to provide demo optimization actions."
        };
      });

      const resilienceDerivedFindings = resilienceWorkloads.slice(0, 2).map((workload, idx) => {
        const workloadName = workload.workload || `workload-${idx + 1}`;
        const resilienceCost = toNumber(workload.total_monthly_resilience_cost);
        const monthlySavingsEstimate = Number((resilienceCost * 0.22).toFixed(2));
        return {
          finding_id: `resilience-finding-${idx}-${String(workloadName).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          title: `Optimize resilience policy for ${workloadName}`,
          type: "resilience",
          severity: idx === 0 ? "high" : "medium",
          confidence: "medium",
          monthly_savings_usd_est: monthlySavingsEstimate,
          risk_level: "Medium",
          implementation_time: "2-4 hours",
          suggested_action: `Review retention, backup frequency, and storage tiering for ${workloadName} while preserving required recovery objectives.`,
          commands: [
            `# Review backup retention and restore policy for ${workloadName}`
          ],
          last_analyzed: report?.generated_at,
          evidence: {
            workload: workloadName,
            monthly_resilience_cost: resilienceCost
          },
          methodology: "Derived from report.resilience.top_workloads to surface resilience cost opportunities."
        };
      });

      const demoFindings = [...anomalyFindings, ...resilienceDerivedFindings].slice(0, 6);
      setFindings(demoFindings);

      // Total for daily average fallback
      const total = products.reduce((acc, p) => acc + toNumber(p.amount_usd || p.amount || 0), 0);

      // Daily Spend Trend
      const days = Math.max(1, toNumber(costBaseline.period_days) || 30);
      const endDate = report?.window?.end ? new Date(report.window.end) : new Date();
      const avg = dailyAverage || (total && days ? total / days : 0);
      const series = Array.from({ length: days }, (_, i) => {
        const d = new Date(endDate);
        d.setDate(d.getDate() - (days - 1 - i));
        const jitter = avg * 0.06 * Math.sin(i / 2.7) + (avg * 0.03 * (Math.random() - 0.5));
        const amount = Math.max(0, avg + jitter);
        return { formatted_date: format(d, "MM/dd"), dateISO: d.toISOString().slice(0,10), cost: amount };
      });
      setCostTrend(series);

      // Key Insights
      const highest = series.reduce(
        (m, pt) => (pt.cost > m.amount ? { date: pt.formatted_date, dateISO: pt.dateISO || new Date().toISOString().slice(0,10), amount: pt.cost } : m),
        { date: "-", dateISO: null, amount: 0 }
      );
      const totalWindow = series.reduce((s, pt) => s + pt.cost, 0);
      const monthBudget = 180000;
      setKeyInsights({
        highest_single_day: highest,
        projected_month_end: totalWindow,
        mtd_actual: totalWindow * (new Date().getDate() / Math.max(series.length, 1)),
        monthly_budget: monthBudget,
        budget_variance: totalWindow - monthBudget
      });

      // AI Spend daily trend synthesis
      const aiSpendRaw = report?.ai_spend || {};
      const aiDailyAvg = toNumber(aiSpendRaw.daily_average) || 0;
      if (aiDailyAvg > 0) {
        const aiSeries = Array.from({ length: days }, (_, i) => {
          const d = new Date(endDate);
          d.setDate(d.getDate() - (days - 1 - i));
          const jitter = aiDailyAvg * 0.08 * Math.sin(i / 3.1) + aiDailyAvg * 0.04 * (Math.random() - 0.5);
          return { formatted_date: format(d, "MM/dd"), cost: Math.max(0, aiDailyAvg + jitter) };
        });
        setAiTrend(aiSeries);
      }

      // SaaS daily trend synthesis (flat spread with minimal jitter)
      const saasRaw = report?.saas_spend || {};
      const saasDailyAvg = toNumber(saasRaw.total_cost) / Math.max(days, 1);
      if (saasDailyAvg > 0) {
        const saasSeries = Array.from({ length: days }, (_, i) => {
          const d = new Date(endDate);
          d.setDate(d.getDate() - (days - 1 - i));
          const jitter = saasDailyAvg * 0.025 * Math.sin(i / 7.2);
          return { formatted_date: format(d, "MM/dd"), cost: Math.max(0, saasDailyAvg + jitter) };
        });
        setSaasBaseTrend(saasSeries);
      }

      // Kubernetes data
      try {
        const k8sResp = await axios.get(`${API}/k8s`);
        setK8sData(k8sResp.data);
      } catch {
        // K8s endpoint optional — use synthetic fallback
        setK8sData({
          total_cost: 43000,
          cluster_count: 2,
          avg_node_utilization_pct: 47,
          overprovisioning_waste_est: 13760,
          namespaces: [
            { namespace: "production",    cost: 18400, cpu_request_pct: 72, mem_request_pct: 68 },
            { namespace: "data-pipeline", cost:  8900, cpu_request_pct: 61, mem_request_pct: 74 },
            { namespace: "ml-training",   cost:  6100, cpu_request_pct: 83, mem_request_pct: 79 },
            { namespace: "staging",       cost:  5200, cpu_request_pct: 38, mem_request_pct: 42 },
            { namespace: "monitoring",    cost:  2800, cpu_request_pct: 24, mem_request_pct: 31 },
            { namespace: "dev",           cost:  1600, cpu_request_pct: 12, mem_request_pct: 18 },
          ],
          node_pools: [
            { pool: "general-purpose",   nodes: 12, node_type: "n2-standard-8",  cost: 24800, utilization_pct: 34 },
            { pool: "compute-optimized", nodes:  4, node_type: "c2-standard-16", cost: 12400, utilization_pct: 71 },
            { pool: "memory-optimized",  nodes:  3, node_type: "n2-highmem-16",  cost:  8900, utilization_pct: 58 },
          ],
          top_wasteful_workloads: [
            { namespace: "staging",    cost: 5200, cpu_request_pct: 38, mem_request_pct: 42 },
            { namespace: "monitoring", cost: 2800, cpu_request_pct: 24, mem_request_pct: 31 },
            { namespace: "dev",        cost: 1600, cpu_request_pct: 12, mem_request_pct: 18 },
          ],
        });
      }

    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load cost data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openFindingModal = (finding) => {
    setModalFinding(finding);
    setModalOpen(true);
  };

  const exportCSV = async () => {
    try {
      const { data } = await axios.get(`${API}/findings?sort=savings&limit=1000`);
      const arr = Array.isArray(data) ? data : [];
      const rowsToExport = arr.filter((f) => toNumber(f.monthly_savings_usd_est) > 0);
      const headers = ["Title", "Type", "Severity", "Monthly Savings", "Resource ID", "Action"];
      const rows = rowsToExport.map((f) => [
        f.title, f.type, f.severity, f.monthly_savings_usd_est, f.resource_id || "", f.suggested_action
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cost-findings.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-brand-muted">Loading cost analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light flex items-center justify-center">
        <Alert className="max-w-md alert-brand">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { top_products = [], recent_findings = [] } = summary || {};
  const trendPercent = hasCostData ? toNumber(costBaseline?.trend?.change_percentage) : null;
  const totalAnomalies = toNumber(anomalies.total_anomalies);
  const severityCounts = anomalies.by_severity || {};
  const criticalCount = toNumber(severityCounts.critical);
  const highCount = toNumber(severityCounts.high);
  const mediumCount = toNumber(severityCounts.medium);
  const dataFreshnessHours = getDataFreshnessHours(report?.generated_at);

  // AI Spend render-time constants
  const aiSpend = report?.ai_spend || {};
  const aiPalette = ["#8B6F47", "#B5905C", "#D8C3A5", "#A8A7A7", "#E98074"];
  const aiModelTotal = (aiSpend.models || []).reduce((s, m) => s + toNumber(m.cost), 0);
  const aiModelChartData = (aiSpend.models || []).map((m, i) => ({
    name: m.model,
    value: toNumber(m.cost),
    percentage: aiModelTotal ? Number(((toNumber(m.cost) / aiModelTotal) * 100).toFixed(1)) : 0,
    fill: aiPalette[i % aiPalette.length]
  }));

  // SaaS Spend render-time constants
  const saasSpend = report?.saas_spend || {};

  // Cloud+ Summary render-time constants
  const cloudTotal = toNumber(costBaseline.total_cost);
  const aiTotal = toNumber(aiSpend.total_cost);
  const saasTotal = toNumber(saasSpend.total_cost);
  const grandTotal = cloudTotal + aiTotal + saasTotal;
  const cloudPrev = toNumber(costBaseline?.trend?.previous_period_cost) || 0;
  const aiPrev = aiTotal - toNumber(aiSpend.trend?.change_amount);
  const saasPrev = saasTotal - toNumber(saasSpend.trend?.change_amount);
  const grandPrev = cloudPrev + aiPrev + saasPrev;
  const grandDeltaAmt = grandTotal - grandPrev;
  const grandDeltaPct = grandPrev > 0 ? (grandDeltaAmt / grandPrev) * 100 : 0;
  const scopeDonutData = [
    { name: "Cloud Infrastructure", value: cloudTotal, fill: "#6b8f71" },
    { name: "AI / LLM",             value: aiTotal,    fill: "#c4956a" },
    { name: "SaaS Tools",           value: saasTotal,  fill: "#8b9dc3" }
  ];
  const topAnomaly = Array.isArray(anomalies.recent) && anomalies.recent.length > 0 ? anomalies.recent[0] : null;
  const projCloudNextMonth = (keyInsights?.projected_month_end || cloudTotal);
  const projAiNextMonth = aiTotal * (1 + toNumber(aiSpend.trend?.change_percentage) / 100);
  const projSaasNextMonth = saasTotal * (1 + toNumber(saasSpend.trend?.change_percentage) / 100);
  const projGrandTotal = projCloudNextMonth + projAiNextMonth + projSaasNextMonth;

  // Unified trend: merge cloud/ai/saas into one series for the combined chart
  const unifiedTrend = costTrend.map((pt, i) => ({
    formatted_date: pt.formatted_date,
    cloud: pt.cost,
    ai: aiTrend[i]?.cost || 0,
    saas: saasBaseTrend[i]?.cost || 0
  }));

  // Filter to savings-impact findings and recompute UI-facing metrics
  const positiveFindings = (Array.isArray(findings) ? findings : []).filter(f => toNumber(f.monthly_savings_usd_est) > 0);
  const displayFindings = sortAndPickFindings(positiveFindings, 9);
  const totalSavingsOpportunity = displayFindings.reduce((s, f) => s + toNumber(f.monthly_savings_usd_est), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-brand-light">
      {/* Header */}
      <div className="nav-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Cloud & Capital" className="brand-logo" />
              <div className="leading-tight">
                <h1 className="brand-title">Cloud+ Cost Guard</h1>
                <p className="text-[15px] text-brand-muted">Multi-cloud cost optimization <span style={{ opacity: 0.5, fontSize: "11px", letterSpacing: "0.04em" }}>· Demo data · sample workload</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-38 md:w-42 btn-brand-outline rounded-2xl flex items-center justify-start px-4">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Last 30 days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={exportCSV} className="btn-brand-outline rounded-2xl">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>

              <Button onClick={loadAllData} className="btn-brand-primary rounded-2xl">
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Data Source banner (compact caption) */}
        <div className="mb-4 text-xs text-brand-muted flex items-center gap-3">
          <span><span className="font-medium">Data Source:</span> AWS • Azure • GCP • Kubernetes • AI Providers • SaaS Billing</span>
          <span className="hidden sm:inline">•</span>
          <span>Last Updated: {new Date().toLocaleDateString()}</span>
        </div>

        {/* ── Cloud+ Executive Summary ───────────────────── */}
        <div className="space-y-6 mb-8">

          {/* Hero banner: grand total + period delta + projected */}
          <Card className="kpi-card shadow-sm">
            <CardContent className="py-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-1">
                    Total Tech Spend — Cloud · AI · SaaS
                  </div>
                  <div className="text-4xl font-bold text-brand-ink">{formatCurrency(grandTotal)}</div>
                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                    {grandDeltaAmt >= 0
                      ? <TrendingUp className="h-4 w-4 text-brand-error" />
                      : <TrendingDown className="h-4 w-4 text-brand-success" />}
                    <span className={grandDeltaAmt >= 0 ? "font-semibold text-brand-error" : "font-semibold text-brand-success"}>
                      {grandDeltaAmt >= 0 ? "+" : ""}{formatCurrency(grandDeltaAmt)}
                    </span>
                    <span className={grandDeltaAmt >= 0 ? "text-brand-error" : "text-brand-success"}>
                      ({formatPercent(grandDeltaPct)})
                    </span>
                    <span className="text-brand-muted ml-1">vs prior period · {reportWindowLabel}</span>
                  </div>
                </div>
                <div className="md:text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-1">Projected Next Month</div>
                  <div className="text-2xl font-bold text-brand-ink">{formatCurrency(projGrandTotal)}</div>
                  <div className="text-xs text-brand-muted mt-0.5">based on current period trends</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Three scope cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard
              title="Cloud Infrastructure"
              value={formatCurrency(cloudTotal)}
              change={hasCostData ? trendPercent : null}
              icon={DollarSign}
              subtitle="vs last period"
              dataFreshness={dataFreshnessHours}
            />
            <KPICard
              title="AI / LLM Spend"
              value={formatCurrency(aiTotal)}
              change={toNumber(aiSpend.trend?.change_percentage)}
              icon={Bot}
              subtitle="vs last period"
            />
            <KPICard
              title="SaaS Tools"
              value={formatCurrency(saasTotal)}
              change={toNumber(saasSpend.trend?.change_percentage)}
              icon={Layers}
              subtitle="vs last period"
            />
          </div>

          {/* Tag Coverage + Savings Opportunity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-brand-muted">Tag Coverage</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl font-bold text-brand-ink">{coveragePct}%</span>
                  <span className="text-xs text-brand-muted">{untaggedPct}% untagged</span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#E9E3DE", borderRadius: 999 }}>
                  <div style={{ width: `${coveragePct}%`, height: 8, background: "#6b8f71", borderRadius: 999 }} />
                </div>
                <p className="text-xs text-brand-muted mt-2">of resources properly tagged</p>
              </CardContent>
            </Card>

            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-brand-muted">Savings Opportunity</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold" style={{ color: "#16803A" }}>
                  {formatCurrency(totalSavingsOpportunity)}
                </div>
                <p className="text-xs text-brand-muted mt-1">
                  total identified monthly savings · across {displayFindings.length} finding{displayFindings.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Unified trend + scope donut + top anomaly & forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Unified 3-scope trend chart */}
            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <BarChart3 className="h-5 w-5" />Unified Spend Trend
                </CardTitle>
                <CardDescription className="text-brand-muted">
                  Cloud, AI &amp; SaaS daily spend — {reportWindowLabel}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={unifiedTrend} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                      <XAxis dataKey="formatted_date" stroke="#7A6B5D" fontSize={11} tick={{ fill: "#7A6B5D" }} interval={6} />
                      <YAxis stroke="#7A6B5D" fontSize={11} tick={{ fill: "#7A6B5D" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                        formatter={(value, name) => [formatCurrency(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                      />
                      <Line type="monotone" dataKey="cloud" name="cloud" stroke="#8B6F47" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#8B6F47" }} />
                      <Line type="monotone" dataKey="ai" name="ai" stroke="#B5905C" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#B5905C" }} />
                      <Line type="monotone" dataKey="saas" name="saas" stroke="#A8A7A7" strokeWidth={2} dot={false} strokeDasharray="4 2" activeDot={{ r: 4, fill: "#A8A7A7" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-5 mt-3 justify-center text-xs text-brand-muted">
                  <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 rounded bg-[#8B6F47]" /><span>Cloud</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 rounded bg-[#B5905C]" /><span>AI</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 rounded bg-[#A8A7A7]" /><span>SaaS</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Tech Spend by Scope donut */}
            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <PieChartIcon className="h-5 w-5" />Tech Spend by Scope
                </CardTitle>
                <CardDescription className="text-brand-muted">Cloud vs AI vs SaaS share of total</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={scopeDonutData} cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={3} dataKey="value">
                        {scopeDonutData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                        formatter={(val, _n, props) => [
                          formatCurrency(val),
                          `${props.payload.name} (${grandTotal ? ((val / grandTotal) * 100).toFixed(1) : 0}%)`
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5 mt-3">
                  {scopeDonutData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.fill }} />
                        <span className="text-brand-muted text-xs">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-brand-ink text-xs">{formatCurrency(s.value)}</span>
                        <span className="text-xs text-brand-muted w-9 text-right">
                          {grandTotal ? ((s.value / grandTotal) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top anomaly + next-month forecast */}
            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <AlertTriangle className="h-5 w-5" />Top Signal &amp; Forecast
                </CardTitle>
                <CardDescription className="text-brand-muted">Highest-impact anomaly and next-month projection</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-5">
                {topAnomaly ? (
                  <div className="p-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2]">
                    <div className="flex items-center gap-2 mb-3">
                      {getSeverityIcon(topAnomaly.severity)}
                      <span className="text-sm font-semibold text-brand-ink">{topAnomaly.group} spend anomaly</span>
                      <Badge className={`ml-auto ${getSeverityColor(topAnomaly.severity)} text-xs px-2 py-0.5`}>
                        {String(topAnomaly.severity || "").toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-brand-muted mb-0.5">Baseline</div>
                        <div className="font-semibold text-brand-ink">{formatCurrency(toNumber(topAnomaly.baseline))}</div>
                      </div>
                      <div>
                        <div className="text-brand-muted mb-0.5">Current</div>
                        <div className="font-semibold text-brand-error">{formatCurrency(toNumber(topAnomaly.current))}</div>
                      </div>
                      <div>
                        <div className="text-brand-muted mb-0.5">Delta</div>
                        <div className="font-semibold text-brand-error">+{toNumber(topAnomaly.delta_pct).toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-brand-line bg-brand-bg/30 text-sm text-brand-muted flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-brand-success" />No anomalies detected.
                  </div>
                )}

                <Separator />

                <div>
                  <div className="text-sm font-medium text-brand-ink mb-3">Next Month Forecast</div>
                  <div className="space-y-2.5">
                    {[
                      { label: "Cloud", value: projCloudNextMonth, pct: grandTotal ? ((cloudTotal / grandTotal) * 100).toFixed(1) : "0", fill: "#8B6F47" },
                      { label: "AI",    value: projAiNextMonth,    pct: grandTotal ? ((aiTotal    / grandTotal) * 100).toFixed(1) : "0", fill: "#B5905C" },
                      { label: "SaaS",  value: projSaasNextMonth,  pct: grandTotal ? ((saasTotal  / grandTotal) * 100).toFixed(1) : "0", fill: "#D8C3A5" },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.fill }} />
                          <span className="text-brand-muted">{s.label}</span>
                          <span className="text-xs text-brand-muted">({s.pct}%)</span>
                        </div>
                        <span className="font-medium text-brand-ink">{formatCurrency(s.value)}</span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex items-center justify-between text-sm font-semibold pt-0.5">
                      <span className="text-brand-ink">Total</span>
                      <span className="text-brand-ink">{formatCurrency(projGrandTotal)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
        {/* ── End Cloud+ Executive Summary ────────────────── */}

        {/* Compact AI triage */}
        <div className="mb-6">
          <TriageCard defaultExpanded={false} />
        </div>

        {/* K8s spend summary in the unified header area */}
        {k8sData && (
          <div className="mb-4 text-xs text-brand-muted flex items-center gap-3">
            <Server className="h-3 w-3" />
            <span>
              <span className="font-medium">Kubernetes:</span>{" "}
              {formatCurrency(k8sData.total_cost)}/mo ·{" "}
              {k8sData.avg_node_utilization_pct}% avg node util ·{" "}
              <span className="text-brand-error font-medium">{formatCurrency(k8sData.overprovisioning_waste_est)} over-provisioning waste</span>
            </span>
          </div>
        )}

        {/* Tabs — drill-down by scope */}
        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="ccg-tabs">
            <TabsTrigger value="findings" className="ccg-tab">Findings</TabsTrigger>
            <TabsTrigger value="products" className="ccg-tab">Products</TabsTrigger>
            <TabsTrigger value="clouds" className="ccg-tab">Clouds</TabsTrigger>
            <TabsTrigger value="kubernetes" className="ccg-tab">Kubernetes</TabsTrigger>
            <TabsTrigger value="overview" className="ccg-tab">Overview</TabsTrigger>
            <TabsTrigger value="ai-spend" className="ccg-tab">AI Spend</TabsTrigger>
            <TabsTrigger value="saas" className="ccg-tab">SaaS</TabsTrigger>
          </TabsList>

          {/* Findings */}
          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">
                Cost Optimization Findings
              </h2>
              <Badge className="badge-brand text-brand-success border-brand-success/20">
                {totalAnomalies} anomalies detected
              </Badge>
            </div>

            {displayFindings.length === 0 ? (
              <Card className="kpi-card shadow-sm">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-brand-success mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-brand-ink mb-2">All Optimized!</h3>
                  <p className="text-brand-muted">No cost optimization opportunities found at this time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayFindings.map((f) => (
                  <FindingCard key={f.finding_id || `${f.title}-${f.resource_id || ""}`} finding={f} onViewDetails={openFindingModal} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Products */}
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">Product Cost Breakdown</h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink"><BarChart3 className="h-5 w-5" />Top Products by Cost</CardTitle>
                <CardDescription className="text-brand-muted">Your highest spending cloud products and their week-over-week changes</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <ProductTable products={Array.isArray(top_products) ? top_products : []} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clouds */}
          <TabsContent value="clouds" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">
                Cloud Infrastructure by Provider
              </h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            {/* Three-cloud KPI summary row */}
            {(() => {
              const clouds = report?.clouds || {};
              const cloudDefs = [
                { key: "aws",   label: "Amazon Web Services", color: "#E8870A", bg: "#FFF8F0" },
                { key: "azure", label: "Microsoft Azure",      color: "#0078D4", bg: "#EFF6FF" },
                { key: "gcp",   label: "Google Cloud",         color: "#1A73E8", bg: "#EEF4FF" },
              ];
              const allTotal = cloudDefs.reduce((s, d) => s + toNumber((clouds[d.key] || {}).total_cost), 0);
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {cloudDefs.map(({ key, label, color }) => {
                    const c = clouds[key] || {};
                    const trend = toNumber(c.trend?.change_percentage);
                    const share = allTotal > 0 ? ((toNumber(c.total_cost) / allTotal) * 100).toFixed(1) : "0";
                    return (
                      <Card key={key} className="kpi-card shadow-sm" style={{ borderTop: `3px solid ${color}` }}>
                        <CardContent className="py-4">
                          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color }}>{label}</div>
                          <div className="text-2xl font-bold text-brand-ink">{formatCurrency(toNumber(c.total_cost))}</div>
                          <div className="flex items-center gap-1 mt-1 text-xs">
                            {trend >= 0
                              ? <TrendingUp className="h-3 w-3 text-brand-error" />
                              : <TrendingDown className="h-3 w-3 text-brand-success" />}
                            <span className={trend >= 0 ? "text-brand-error" : "text-brand-success"}>{formatPercent(trend)}</span>
                            <span className="text-brand-muted ml-1">vs prior period · {share}% of cloud total</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}

            {/* Per-cloud drill-down */}
            <Tabs defaultValue="aws" className="space-y-4">
              <TabsList className="ccg-tabs">
                <TabsTrigger value="aws" className="ccg-tab">AWS</TabsTrigger>
                <TabsTrigger value="azure" className="ccg-tab">Azure</TabsTrigger>
                <TabsTrigger value="gcp" className="ccg-tab">GCP</TabsTrigger>
              </TabsList>

              {[
                { key: "aws",   label: "Amazon Web Services", color: "#E8870A" },
                { key: "azure", label: "Microsoft Azure",      color: "#0078D4" },
                { key: "gcp",   label: "Google Cloud",         color: "#1A73E8" },
              ].map(({ key, label, color }) => {
                const cloudData = report?.clouds?.[key] || {};
                const services = Array.isArray(cloudData.top_services) ? cloudData.top_services : [];
                const cloudFindings = sortAndPickFindings(
                  Array.isArray(cloudData.findings) ? cloudData.findings : [],
                  3
                );
                const serviceChartData = services.map(s => ({
                  name: s.service_name,
                  cost: toNumber(s.total_cost),
                }));
                const trendPct = toNumber(cloudData.trend?.change_percentage);

                return (
                  <TabsContent key={key} value={key} className="space-y-6">
                    {/* Cloud summary row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <KPICard
                        title={`${label} Total`}
                        value={formatCurrency(toNumber(cloudData.total_cost))}
                        change={trendPct}
                        icon={DollarSign}
                        subtitle="vs prior period"
                      />
                      <KPICard
                        title="Daily Average"
                        value={formatCurrency(toNumber(cloudData.daily_average))}
                        icon={BarChart3}
                        subtitle={reportWindowLabel}
                      />
                      <KPICard
                        title="Savings Found"
                        value={formatCurrency(
                          cloudFindings.reduce((s, f) => s + toNumber(f.monthly_savings_usd_est), 0)
                        )}
                        icon={TrendingDown}
                        subtitle={`across ${cloudFindings.length} finding${cloudFindings.length !== 1 ? "s" : ""}`}
                      />
                    </div>

                    {/* Service breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="kpi-card shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-brand-ink">
                            <BarChart3 className="h-5 w-5" />
                            <span style={{ color }}>{label}</span> — Service Breakdown
                          </CardTitle>
                          <CardDescription className="text-brand-muted">
                            {reportWindowLabel} · {formatCurrency(toNumber(cloudData.total_cost))} total
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div style={{ width: "100%", height: 260 }}>
                            <ResponsiveContainer>
                              <BarChart data={serviceChartData} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#EEE" horizontal={false} />
                                <XAxis type="number" stroke="#7A6B5D" fontSize={11} tick={{ fill: "#7A6B5D" }}
                                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                                <YAxis type="category" dataKey="name" stroke="#7A6B5D" fontSize={11}
                                  tick={{ fill: "#7A6B5D" }} width={116} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                                  formatter={(value) => [formatCurrency(value), "Cost"]}
                                />
                                <Bar dataKey="cost" fill={color} radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="kpi-card shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-brand-ink">Top Services</CardTitle>
                          <CardDescription className="text-brand-muted">
                            Cost share by service — {reportWindowLabel}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="table-brand rounded-lg">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-brand-muted font-semibold">Service</TableHead>
                                  <TableHead className="text-right text-brand-muted font-semibold">Cost</TableHead>
                                  <TableHead className="text-right text-brand-muted font-semibold">% of Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {services.map((s, i) => (
                                  <TableRow key={i} className="hover:bg-brand-bg/30">
                                    <TableCell className="font-medium text-brand-ink">{s.service_name}</TableCell>
                                    <TableCell className="text-right text-brand-ink">{formatCurrency(toNumber(s.total_cost))}</TableCell>
                                    <TableCell className="text-right text-brand-ink">{toNumber(s.percentage_of_total).toFixed(1)}%</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Cloud-specific findings */}
                    {cloudFindings.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-brand-ink mb-4">
                          {label} Optimization Findings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {cloudFindings.map((f) => (
                            <FindingCard key={f.finding_id} finding={f} onViewDetails={openFindingModal} />
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          {/* Kubernetes */}
          <TabsContent value="kubernetes" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">
                Kubernetes Cost Visibility
              </h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            {k8sData ? (
              <>
                {/* K8s KPI row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard
                    title="Total K8s Spend"
                    value={formatCurrency(toNumber(k8sData.total_cost))}
                    icon={Server}
                    subtitle={`${k8sData.cluster_count} cluster${k8sData.cluster_count !== 1 ? "s" : ""}`}
                  />
                  <KPICard
                    title="Avg Node Utilization"
                    value={`${toNumber(k8sData.avg_node_utilization_pct).toFixed(1)}%`}
                    icon={Activity}
                    subtitle="CPU + memory weighted"
                  />
                  <KPICard
                    title="Over-provisioning Waste"
                    value={formatCurrency(toNumber(k8sData.overprovisioning_waste_est))}
                    icon={AlertTriangle}
                    subtitle="estimated monthly savings"
                  />
                  <KPICard
                    title="Namespaces"
                    value={(k8sData.namespaces || []).length}
                    icon={Layers}
                    subtitle="tracked workload scopes"
                  />
                </div>

                {/* Namespace breakdown + node pools */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Namespace bar chart */}
                  <Card className="kpi-card shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-brand-ink">
                        <BarChart3 className="h-5 w-5" />Namespace Cost Breakdown
                      </CardTitle>
                      <CardDescription className="text-brand-muted">Monthly spend per Kubernetes namespace</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div style={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                          <BarChart
                            data={(k8sData.namespaces || []).map(n => ({ name: n.namespace, cost: toNumber(n.cost) }))}
                            layout="vertical"
                            margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#EEE" horizontal={false} />
                            <XAxis type="number" stroke="#7A6B5D" fontSize={11} tick={{ fill: "#7A6B5D" }}
                              tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`} />
                            <YAxis type="category" dataKey="name" stroke="#7A6B5D" fontSize={12}
                              tick={{ fill: "#7A6B5D" }} width={96} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#FFF", border: "1px solid #E9E3DE", borderRadius: 8, color: "#0A0A0A" }}
                              formatter={(value) => [formatCurrency(value), "Monthly Cost"]}
                            />
                            <Bar dataKey="cost" fill="#6b8f71" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Node pool efficiency */}
                  <Card className="kpi-card shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-brand-ink">
                        <Server className="h-5 w-5" />Node Pool Efficiency
                      </CardTitle>
                      <CardDescription className="text-brand-muted">Utilization and cost per node pool</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="table-brand rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-brand-muted font-semibold">Pool</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">Nodes</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">Cost</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">Util %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(k8sData.node_pools || []).map((p, i) => (
                              <TableRow key={i} className="hover:bg-brand-bg/30">
                                <TableCell className="font-medium text-brand-ink">
                                  <div>{p.pool}</div>
                                  <div className="text-xs text-brand-muted">{p.node_type}</div>
                                </TableCell>
                                <TableCell className="text-right text-brand-ink">{p.nodes}</TableCell>
                                <TableCell className="text-right text-brand-ink">{formatCurrency(toNumber(p.cost))}</TableCell>
                                <TableCell className="text-right">
                                  <span className={toNumber(p.utilization_pct) < 50 ? "text-brand-error font-semibold" : "text-brand-success font-semibold"}>
                                    {toNumber(p.utilization_pct).toFixed(1)}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Wasteful workloads */}
                {(k8sData.top_wasteful_workloads || []).length > 0 && (
                  <Card className="kpi-card shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-brand-ink">
                        <AlertTriangle className="h-5 w-5" />Top Wasteful Workloads
                      </CardTitle>
                      <CardDescription className="text-brand-muted">
                        Namespaces with low CPU or memory request utilization — top savings opportunities
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="table-brand rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-brand-muted font-semibold">Namespace</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">Monthly Cost</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">CPU Request %</TableHead>
                              <TableHead className="text-right text-brand-muted font-semibold">Memory Request %</TableHead>
                              <TableHead className="text-brand-muted font-semibold">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(k8sData.top_wasteful_workloads || []).map((w, i) => (
                              <TableRow key={i} className="hover:bg-brand-bg/30">
                                <TableCell className="font-medium text-brand-ink">{w.namespace}</TableCell>
                                <TableCell className="text-right text-brand-ink">{formatCurrency(toNumber(w.cost))}</TableCell>
                                <TableCell className="text-right">
                                  <span className={toNumber(w.cpu_request_pct) < 40 ? "text-brand-error font-semibold" : "text-brand-ink"}>
                                    {toNumber(w.cpu_request_pct).toFixed(0)}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={toNumber(w.mem_request_pct) < 40 ? "text-brand-error font-semibold" : "text-brand-ink"}>
                                    {toNumber(w.mem_request_pct).toFixed(0)}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-brand-muted text-xs">
                                  {toNumber(w.cpu_request_pct) < 30
                                    ? "Right-size requests; consider namespace resource quotas"
                                    : "Review pod resource requests vs actual usage"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="kpi-card shadow-sm">
                <CardContent className="text-center py-12">
                  <Server className="h-12 w-12 text-brand-muted mx-auto mb-4" />
                  <p className="text-brand-muted">Loading Kubernetes data…</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">Cost Overview</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="kpi-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-brand-ink">Anomaly Severity</CardTitle>
                  <CardDescription className="text-brand-muted">Recent anomaly counts by severity</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {[
                    { type: "Critical", count: criticalCount, color: "bg-blue-500" },
                    { type: "High", count: highCount, color: "bg-yellow-500" },
                    { type: "Medium", count: mediumCount, color: "bg-red-500" }
                  ].map((it, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${it.color}`} />
                        <span className="text-sm text-brand-ink">{it.type}</span>
                      </div>
                      <span className="text-sm font-medium text-brand-ink">{it.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="kpi-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-brand-ink">Resilience Workloads</CardTitle>
                  <CardDescription className="text-brand-muted">Top workloads by monthly resilience cost</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {(Array.isArray(recent_findings) ? recent_findings.filter(f => toNumber(f.monthly_savings_usd_est) > 0).slice(0, 5) : []).map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-brand-bg/50 rounded-lg border border-brand-line">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(f.severity)}
                          <span className="text-sm text-brand-ink truncate max-w-48">{f.title}</span>
                        </div>
                        <span className="text-sm font-medium text-brand-success">{formatCurrency(f.monthly_savings_usd_est)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AI Spend */}
          <TabsContent value="ai-spend" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">AI Spend</h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard
                title="Total AI Spend"
                value={formatCurrency(toNumber(aiSpend.total_cost))}
                change={toNumber(aiSpend.trend?.change_percentage)}
                icon={Bot}
                subtitle="vs last period"
              />
              <KPICard
                title="Daily Average"
                value={formatCurrency(toNumber(aiSpend.daily_average))}
                icon={TrendingUp}
                subtitle={reportWindowLabel}
              />
              <KPICard
                title="Period Change"
                value={formatCurrency(toNumber(aiSpend.trend?.change_amount))}
                icon={TrendingUp}
                subtitle={`${formatPercent(toNumber(aiSpend.trend?.change_percentage))} vs prior period`}
              />
              <KPICard
                title="Models in Use"
                value={(aiSpend.models || []).length}
                icon={Layers}
                subtitle="across all providers"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CostTrendChart data={aiTrend} label="AI spend over the last 30 days" />
              <AiModelBreakdown models={aiModelChartData} />
            </div>

            <Card className="kpi-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-brand-ink">
                  <Bot className="h-5 w-5" />Top Models by Cost
                </CardTitle>
                <CardDescription className="text-brand-muted">AI model spend ranked by cost this period</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="table-brand rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-brand-muted font-semibold">Model</TableHead>
                        <TableHead className="text-brand-muted font-semibold">Provider</TableHead>
                        <TableHead className="text-right text-brand-muted font-semibold">Cost</TableHead>
                        <TableHead className="text-right text-brand-muted font-semibold">% of AI Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(aiSpend.models || []).map((m, i) => (
                        <TableRow key={i} className="hover:bg-brand-bg/30">
                          <TableCell className="font-medium text-brand-ink">{m.model}</TableCell>
                          <TableCell className="text-brand-muted capitalize">{m.provider}</TableCell>
                          <TableCell className="text-right text-brand-ink">{formatCurrency(toNumber(m.cost))}</TableCell>
                          <TableCell className="text-right text-brand-ink">
                            {aiModelTotal ? Number(((toNumber(m.cost) / aiModelTotal) * 100).toFixed(1)) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SaaS */}
          <TabsContent value="saas" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-brand-serif text-[18px] md:text-[20px] leading-tight font-semibold text-brand-ink tracking-tight">SaaS Spend</h2>
              <Badge className="badge-brand">{reportWindowLabel}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard
                title="Total SaaS Spend"
                value={formatCurrency(toNumber(saasSpend.total_cost))}
                change={toNumber(saasSpend.trend?.change_percentage)}
                icon={Layers}
                subtitle="vs last period"
              />
              <KPICard
                title="Period Change"
                value={formatCurrency(toNumber(saasSpend.trend?.change_amount))}
                icon={TrendingUp}
                subtitle={`${formatPercent(toNumber(saasSpend.trend?.change_percentage))} vs prior period`}
              />
              <KPICard
                title="Unused Licenses"
                value={toNumber(saasSpend.total_unused_licenses)}
                icon={AlertTriangle}
                subtitle="across all tools"
              />
              <KPICard
                title="Estimated Waste"
                value={formatCurrency(toNumber(saasSpend.estimated_waste))}
                icon={DollarSign}
                subtitle="unused license cost"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SaasToolChart tools={saasSpend.tools || []} />
              <SaasMonthlyChart data={saasSpend.monthly_trend || []} />
            </div>

            <SaasUnusedTable tools={saasSpend.tools || []} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Finding details modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalFinding?.title || "Finding Details"}
      >
        {modalFinding ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-brand-muted">Severity</div>
                <div className="font-medium">{String(modalFinding.severity || "").toUpperCase()}</div>
              </div>
              <div>
                <div className="text-brand-muted">Confidence</div>
                <div className="font-medium">{String(modalFinding.confidence || "").replace("_"," ").toUpperCase()}</div>
              </div>
              <div>
                <div className="text-brand-muted">Monthly Savings</div>
                <div className="font-semibold text-brand-success">{formatCurrency(modalFinding.monthly_savings_usd_est)}</div>
              </div>
              <div>
                <div className="text-brand-muted">Risk / Time</div>
                <div className="font-medium">{modalFinding.risk_level} {modalFinding.implementation_time ? `• ${modalFinding.implementation_time}` : ""}</div>
              </div>
            </div>

            {modalFinding.suggested_action && (
              <div>
                <div className="text-brand-muted mb-1">Suggested Action</div>
                <div className="rounded-lg border border-[#E7DCCF] bg-[#F7F1EA] p-3">{modalFinding.suggested_action}</div>
              </div>
            )}

            {modalFinding.commands && modalFinding.commands.length > 0 && (
              <div>
                <div className="text-brand-muted mb-1">Recommended Command</div>
                <pre className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 text-xs overflow-auto">{pickBestCommand(modalFinding)}</pre>
              </div>
            )}

            {modalFinding.evidence && (
              <div>
                <div className="text-brand-muted mb-1">Evidence</div>
                <pre className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 text-xs overflow-auto">{JSON.stringify(modalFinding.evidence, null, 2)}</pre>
              </div>
            )}

            {modalFinding.methodology && (
              <div>
                <div className="text-brand-muted mb-1">Methodology</div>
                <div className="rounded-lg border border-[#E7DCCF] bg-[#FFF] p-3 whitespace-pre-wrap">{modalFinding.methodology}</div>
              </div>
            )}

            {modalFinding.last_analyzed && (
              <div className="text-xs text-brand-muted">
                Last Analyzed: {formatTimestamp(modalFinding.last_analyzed)}
              </div>
            )}
          </div>
        ) : (
          <div>No finding selected.</div>
        )}
      </Modal>

      {/* Ask Claude floating assistant */}
      <AskClaude />
    </div>
  );
};

const Home = () => <Dashboard />;

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes><Route path="/" element={<Home />} /></Routes>
      </BrowserRouter>
    </div>
  );
}
