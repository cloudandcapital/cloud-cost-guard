import React, { useState } from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const displayTitle = (title) => String(title).replaceAll("AmazonEC2", "Amazon EC2").replaceAll("AmazonS3", "Amazon S3");

export default function TriageCard({ findings, generatedAt, defaultExpanded = false, onDismiss }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const topFinding = findings?.[0];
  if (!topFinding) return null;

  return (
    <Card className="kpi-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-brand-ink"><AlertTriangle className="h-5 w-5" />Priority triage</CardTitle>
            <CardDescription>Validated canonical finding · {generatedAt}</CardDescription>
          </div>
          {onDismiss && <Button variant="ghost" size="icon" aria-label="Dismiss triage" onClick={onDismiss}><X className="h-4 w-4" /></Button>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><div className="font-medium text-brand-ink">{displayTitle(topFinding.title)}</div><div className="text-xs text-brand-muted mt-1">{topFinding.context}</div></div>
          <Badge className={`severity-${topFinding.severity}`}>{topFinding.severity.toUpperCase()}</Badge>
        </div>
        <button className="mt-4 text-sm text-brand-accent underline" onClick={() => setExpanded(!expanded)}>{expanded ? "Hide traceability" : "Show traceability"}</button>
        {expanded && <div className="mt-3 rounded-lg border border-brand-line p-3 text-xs text-brand-muted"><div className="flex items-center gap-1 text-brand-success"><CheckCircle className="h-3 w-3" />Canonical relationships preserved</div><div className="mt-2">{topFinding.metric_ids.length} metric reference(s) · {topFinding.evidence_ids.length} evidence reference(s) · {topFinding.quality} quality</div></div>}
      </CardContent>
    </Card>
  );
}
