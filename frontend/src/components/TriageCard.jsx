import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { AlertTriangle, CheckCircle, Clipboard, X } from "lucide-react";
import { getCloudCapitalReport } from "../lib/report";
import { buildAwsCostExplorerDailyCommand } from "../lib/awsCostExplorer";

const fmt = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const when = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
};

export default function TriageCard({ defaultExpanded = false, onDismiss }) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const report = getCloudCapitalReport();

  const anomaly = useMemo(() => report?.anomalies?.recent?.[0] || null, [report]);
  if (!anomaly) return null;

  const baseline = Number(anomaly.baseline || 0);
  const current = Number(anomaly.current || 0);
  const increase = Math.max(0, current - baseline);
  const spikePct = baseline > 0 ? (increase / baseline) * 100 : 0;
  const investigationCommand = buildAwsCostExplorerDailyCommand(anomaly.timestamp);

  const copyCommand = async () => {
    try {
      if (!investigationCommand) throw new Error("Invalid investigation range");
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(investigationCommand);
      setCopyError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <Card className="kpi-card border-amber-200 bg-amber-50/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <div>
              <CardTitle className="text-sm font-semibold text-amber-900">Triage Preview: Cost Spike</CardTitle>
              <CardDescription className="text-amber-800/90">
                Detected {when(anomaly.timestamp)} · illustrative workflow
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDismiss && (
              <Button size="sm" variant="outline" className="rounded-lg btn-brand-outline" onClick={onDismiss} title="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" className="rounded-lg btn-brand-primary" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Hide review plan" : "Review plan"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge className="bg-amber-600 text-white rounded-md px-2 py-1">
            {`Unexplained increase ${fmt(increase)}`}
          </Badge>
          <span className="text-sm text-amber-900">
            Baseline {fmt(baseline)} → Current {fmt(current)} (+{spikePct.toFixed(1)}%)
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Separator />
          <div className="rounded-lg border border-amber-100 bg-white/80 p-3">
            <div className="text-sm font-semibold text-amber-900">What happens before any change</div>
            <ol className="mt-2 list-decimal pl-5 text-sm text-amber-900 space-y-1">
              <li>Confirm whether the increase matches a planned workload or deployment.</li>
              <li>Identify the account, service, owner and usage driver behind the variance.</li>
              <li>Estimate a savings range only after the cause is confirmed.</li>
              <li>Route the recommendation to the resource owner for approval.</li>
              <li>Verify cost and service health after an approved change.</li>
            </ol>
          </div>

          {investigationCommand ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">Read-only investigation command</div>
              <pre className="text-xs m-0 overflow-auto"><code>{investigationCommand}</code></pre>
            </div>
          ) : (
            <p className="text-sm text-amber-900">A valid investigation date is unavailable for this finding.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="btn-brand-outline rounded-lg" onClick={copyCommand} disabled={!investigationCommand}>
              {copied ? <CheckCircle className="h-4 w-4 mr-1" /> : <Clipboard className="h-4 w-4 mr-1" />}
              {copied ? "Copied" : "Copy investigation command"}
            </Button>
            <span className="text-xs text-amber-800">No remediation is executed from this public demo.</span>
          </div>
          {copyError && <p className="text-xs text-red-700">Clipboard access is unavailable. Select the command above to copy it manually.</p>}
        </CardContent>
      )}
    </Card>
  );
}
