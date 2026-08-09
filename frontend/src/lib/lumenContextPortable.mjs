import { createCcac11PresentationModel } from "./ccac11PresentationModelPortable.mjs";

const PRESENTATION_UNAVAILABLE = [
  { concept: "azure_canonical_data", explanation: "No Azure ingestion is represented in this trusted report.", reason_code: "not_represented_in_validated_report" },
  { concept: "gcp_canonical_data", explanation: "No GCP ingestion is represented in this trusted report.", reason_code: "not_represented_in_validated_report" },
  { concept: "combined_invoices", explanation: "Annual and quarterly invoice records cover incompatible periods; no canonical combined invoice metric exists.", reason_code: "missing_canonical_metric" },
];

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.keys(value).sort().reduce((result, key) => value[key] === undefined || key === "displayValue" ? result : ({ ...result, [key]: stable(value[key]) }), {})
    : value;

const compactTrace = (trace = {}, includeMethod = false) => ({
  producer: trace.producer,
  evidence_ids: trace.evidence_ids,
  basis: trace.basis,
  unit: trace.unit,
  currency: trace.currency,
  additivity: trace.additivity,
  ...(includeMethod ? { formula: trace.formula } : {}),
});

const compactMetric = (record, includeMethod = false) => ({
  id: record.id,
  name: record.name,
  value: record.value,
  unknown_reason: record.unknown_reason,
  dimensions: record.dimensions,
  trace: compactTrace(record.trace, includeMethod),
});

const compactFinding = (record) => ({
  id: record.id,
  title: record.title,
  context: record.context,
  type: record.type,
  severity: record.severity,
  status: record.status,
  quality: record.quality,
  producer: record.producer,
  evidence_ids: record.evidence_ids,
  metric_ids: record.metric_ids,
  trace: record.trace,
});

function buildCanonicalLumenContext(view) {
  const model = createCcac11PresentationModel(view);

  return stable({
    disclosure: {
      data_classification: "illustrative",
      connected_accounts: false,
      statement: "Validated CCAC 1.1 illustrative report. No customer accounts, credentials, external resources, or live billing systems are connected.",
    },
    identity: model.identity,
    provenance: {
      source_report_sha256: model.identity.source_report_sha256,
      source_metadata: model.sourceMetadata,
      producers: model.producers,
    },
    technology_spend: {
      total: compactMetric(model.total),
      scopes: model.scopes.map((record) => compactMetric(record)),
      reconciliation: model.reconciliation,
    },
    cloud: {
      comparison: model.cloud.comparison.map((record) => compactMetric(record, true)),
      services: model.cloud.services.map((record) => compactMetric(record)),
      daily: model.cloud.daily.map((record) => compactMetric(record)),
    },
    ai: {
      direct_scope: compactMetric(model.ai.directScope),
      broader_domain_total: compactMetric(model.ai.domainTotal, true),
      broader_domain_additivity: model.ai.crossDomainAdditivity,
      cost_metrics: model.ai.costMetrics.map((record) => compactMetric(record, true)),
      roi_or_business_value: null,
    },
    saas: {
      invoice_metrics: model.saas.invoices.map((record) => compactMetric(record)),
      combined_invoice_total: null,
    },
    findings: model.findings.map(compactFinding),
    anomalies: model.anomalies.map((anomaly) => ({
      finding_id: anomaly.finding.id,
      impact_classification: anomaly.impact_classification,
      expected: compactMetric(anomaly.expected, true),
      observed: compactMetric(anomaly.observed),
      impact: compactMetric(anomaly.impact, true),
      percentage_change: compactMetric(anomaly.percentage_change, true),
      score: compactMetric(anomaly.score, true),
    })),
    resilience: {
      recoverability: model.resilience.classification,
      modeled_evidence: model.resilience.modeled.map((record) => compactMetric(record, true)),
      observed_evidence: model.resilience.observed.map((record) => compactMetric(record)),
      finding_ids: model.resilience.findings.map(({ id }) => id),
    },
    opportunity: model.opportunity,
    canonical_unsupported: Object.values(model.unsupported),
    presentation_unavailable: PRESENTATION_UNAVAILABLE,
    human_review: {
      automatic_actions: false,
      statement: "Lumen provides read-only decision support. Ownership validation, human approval, rollback planning, and post-change verification are required before external action.",
    },
  });
}

function serializeCanonicalLumenContext(view) {
  return JSON.stringify(buildCanonicalLumenContext(view));
}

export {
  PRESENTATION_UNAVAILABLE,
  buildCanonicalLumenContext,
  serializeCanonicalLumenContext,
};
