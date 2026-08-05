import generatedDashboardView from "../data/ccac-dashboard-view.generated.json";

export const CCAC_DASHBOARD_UNAVAILABLE_MESSAGE =
  "Validated illustrative dashboard data is unavailable.";

const EXPECTED_PRODUCERS = {
  "ai-cost-lens": { version: "0.2.0", artifact: "ai-cost-lens.json", sha256: "b51cf23ea86cdaaea52bdfbba6188f995824f3591fed03ac97e262f23d1333be" },
  "finops-lite": { version: "0.3.0", artifact: "finops-lite.json", sha256: "f8529ff5db134a6e81554fd5b2c87e687dc2258009522246d4642ca81501b3a0" },
  "finops-watchdog": { version: "0.4.0", artifact: "finops-watchdog.json", sha256: "ec9269ce4e27ecb412108ca46dc4bd1229ad61682f234fee6cf71ca9833fb717" },
  "recovery-economics": { version: "0.2.1", artifact: "recovery-economics.json", sha256: "db44438fea1d33f1b76591aa4ce6a3d6560ba8528c575dcb782a6da4ad8f71e4" },
  "saas-cost-analyzer": { version: "0.2.0", artifact: "saas-cost-analyzer.json", sha256: "58f31ae72c17f80c1608d8f292756e741763ca4ef868d3ac0badf7a6df940bc8" },
};

const REQUIRED_UNSUPPORTED_CONCEPTS = new Set([
  "combined_technology_spend",
  "cloud_ai_saas_total",
  "combined_scope_donut",
  "combined_daily_technology_spend",
  "next_month_forecast",
  "avoidable_run_rate",
  "monthly_opportunity_scalar",
  "tagging_coverage",
  "kubernetes_cost_or_utilization",
  "verified_savings",
  "realized_savings",
  "demonstrated_recoverability",
  "unknown_as_zero",
]);

// These canonical metrics remain referenced by audit-visible SaaS findings but are
// intentionally not projected as displayable metric records in view version 1.
const NONPROJECTED_CANONICAL_METRIC_REFERENCES = new Set([
  "metric.saas.design-a77de8a6.unknown-activity-seats",
  "metric.saas.design-a77de8a6.unassigned-seats",
]);

const REQUIRED_DISCLOSURES = [
  "All data in this report is illustrative and does not describe a real customer environment.",
  "Every displayed number references a canonical producer metric; the Command Center does not invent savings, anomalies, or forecasts.",
  "Metrics with different periods or accounting boundaries are not added into a single technology-spend total.",
  "Opportunity ranges are estimates, not verified savings; potential, nested, and exclusive overlaps are excluded from aggregates.",
  "AI costs with potential cloud-billing overlap and modeled resilience exposure remain non-additive at the executive boundary.",
  "One or more producer results are partial; inspect their quality issues before decisions.",
];

export class CcacDashboardViewUnavailableError extends Error {
  constructor() {
    super(CCAC_DASHBOARD_UNAVAILABLE_MESSAGE);
    this.name = "CcacDashboardViewUnavailableError";
  }
}

const unavailable = () => {
  throw new CcacDashboardViewUnavailableError();
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

function requireObject(value) {
  if (!isObject(value)) unavailable();
  return value;
}

function requireArray(value) {
  if (!Array.isArray(value)) unavailable();
  return value;
}

function requireText(value) {
  if (!isText(value)) unavailable();
  return value;
}

function rejectNonfiniteNumbers(value) {
  if (typeof value === "number" && !Number.isFinite(value)) unavailable();
  if (Array.isArray(value)) {
    value.forEach(rejectNonfiniteNumbers);
  } else if (isObject(value)) {
    Object.values(value).forEach(rejectNonfiniteNumbers);
  }
}

function validateProducer(producer) {
  const record = requireObject(producer);
  const expected = EXPECTED_PRODUCERS[requireText(record.name)];
  if (!expected || record.version !== expected.version) unavailable();
}

function validatePeriod(period) {
  const record = requireObject(period);
  requireText(record.start);
  requireText(record.end);
  requireText(record.timezone);
}

function validateTrace(trace, id) {
  const record = requireObject(trace);
  if (record.canonical_id !== id) unavailable();
  validateProducer(record.producer);
  const expected = EXPECTED_PRODUCERS[record.producer.name];
  if (record.source_artifact !== expected.artifact) unavailable();
  requireText(record.unit);
  if (record.currency !== null && !isText(record.currency)) unavailable();
  validatePeriod(record.period);
  requireText(record.basis);
  requireText(record.quality);
  requireArray(record.evidence_ids).forEach(requireText);
  requireArray(record.input_metric_ids).forEach(requireText);
  if (record.formula !== null && !isText(record.formula)) unavailable();
}

function validateMetric(metric) {
  const record = requireObject(metric);
  const id = requireText(record.id);
  requireText(record.name);
  if (record.value !== null && typeof record.value !== "string") unavailable();
  if (record.value === null) requireText(record.unknown_reason);
  if (record.value !== null && record.unknown_reason !== null) unavailable();
  requireObject(record.dimensions);
  validateTrace(record.trace, id);
  return id;
}

function addMetricInventory(inventory, metrics) {
  const localIds = new Set();
  requireArray(metrics).forEach((metric) => {
    const id = validateMetric(metric);
    if (localIds.has(id)) unavailable();
    localIds.add(id);
    if (!inventory.has(id)) inventory.set(id, metric);
  });
}

function validateFinding(finding, metricIds) {
  const record = requireObject(finding);
  const id = requireText(record.id);
  validateProducer(record.producer);
  requireText(record.title);
  requireText(record.type);
  requireText(record.status);
  requireText(record.severity);
  requireText(record.quality);
  const references = requireArray(record.metric_ids);
  references.forEach((metricId) => {
    requireText(metricId);
    if (!metricIds.has(metricId) && !NONPROJECTED_CANONICAL_METRIC_REFERENCES.has(metricId)) unavailable();
  });
  requireArray(record.evidence_ids).forEach(requireText);
  const trace = requireObject(record.trace);
  if (trace.canonical_id !== id || trace.source_artifact !== EXPECTED_PRODUCERS[record.producer.name].artifact) unavailable();
  validateProducer(trace.producer);
  requireArray(trace.metric_ids).forEach((metricId) => {
    requireText(metricId);
    if (!metricIds.has(metricId) && !NONPROJECTED_CANONICAL_METRIC_REFERENCES.has(metricId)) unavailable();
  });
  requireArray(trace.evidence_ids).forEach(requireText);
  return id;
}

function validateProducerInventory(view) {
  const producers = requireArray(view.producers);
  if (producers.length !== Object.keys(EXPECTED_PRODUCERS).length) unavailable();
  const names = new Set();
  producers.forEach((producer) => {
    validateProducer(producer);
    if (names.has(producer.name)) unavailable();
    names.add(producer.name);
    const source = requireObject(producer.source);
    if (
      source.artifact !== EXPECTED_PRODUCERS[producer.name].artifact
      || source.artifact_sha256 !== EXPECTED_PRODUCERS[producer.name].sha256
    ) unavailable();
    const quality = requireObject(producer.quality);
    requireArray(quality.issues);
    if (producer.name === "saas-cost-analyzer") {
      if (quality.status !== "partial" || quality.issues.length === 0) unavailable();
    } else if (quality.status !== "valid") {
      unavailable();
    }
  });
  if (names.size !== Object.keys(EXPECTED_PRODUCERS).length) unavailable();
}

function validateSourceMetadata(view) {
  const metadata = requireObject(view.source_metadata);
  const hashes = requireObject(metadata.artifact_sha256s);
  if (Object.keys(hashes).length !== Object.keys(EXPECTED_PRODUCERS).length) unavailable();
  Object.keys(EXPECTED_PRODUCERS).forEach((name) => {
    if (hashes[name] !== EXPECTED_PRODUCERS[name].sha256) unavailable();
    const producer = view.producers.find((entry) => entry.name === name);
    if (hashes[name] !== producer.source.artifact_sha256) unavailable();
  });
  if (metadata.manifest_sha256 !== "16c4ce49800f0909cfa281739fb983e0d3c8c39d661f6eec7e3b4f08f2f378a6") unavailable();
  const counts = requireObject(metadata.catalog_counts);
  if (
    counts.metrics !== 155
    || counts.findings !== 10
    || counts.opportunities !== 1
    || counts.opportunity_aggregates !== 1
  ) unavailable();
}

function validateUnsupported(view) {
  const entries = requireArray(view.unsupported);
  const concepts = new Set();
  entries.forEach((entry) => {
    const record = requireObject(entry);
    const concept = requireText(record.concept);
    if (concepts.has(concept)) unavailable();
    concepts.add(concept);
    requireText(record.explanation);
    requireText(record.reason_code);
    if (Object.keys(record).sort().join(",") !== "concept,explanation,reason_code") unavailable();
  });
  if (concepts.size !== REQUIRED_UNSUPPORTED_CONCEPTS.size) unavailable();
  REQUIRED_UNSUPPORTED_CONCEPTS.forEach((concept) => {
    if (!concepts.has(concept)) unavailable();
  });
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

// This is a defensive browser-side identity and structural boundary. It supplements,
// but does not reproduce or replace, the Python fixture, projection, and policy gates.
export function validateCcacDashboardView(candidate) {
  const view = requireObject(candidate);
  rejectNonfiniteNumbers(view);
  if (view.schema !== "ccg-dashboard-view/1.0.0") unavailable();

  const identity = requireObject(view.identity);
  if (
    identity.mode !== "illustrative"
    || identity.contract !== "ccac/1.0.0"
    || identity.status !== "complete"
    || identity.command_center_version !== "0.2.1"
    || identity.source_report_sha256 !== "3e56662a5192644dd17d698184267c5e638f24018991f442dfbcf81b4dc8edaa"
  ) unavailable();
  requireText(identity.report_id);
  requireText(identity.run_id);
  requireText(identity.generated_at);
  validatePeriod(identity.report_period);
  if (JSON.stringify(identity.disclosures) !== JSON.stringify(REQUIRED_DISCLOSURES)) unavailable();

  ["cloud", "ai", "saas", "resilience", "opportunity", "source_metadata"].forEach((section) => {
    requireObject(view[section]);
  });
  ["anomalies", "findings", "producers", "unsupported"].forEach((section) => {
    requireArray(view[section]);
  });

  validateProducerInventory(view);
  validateSourceMetadata(view);
  validateUnsupported(view);
  if (view.ai.cross_domain_additivity !== "non_additive") unavailable();
  if (view.resilience.recoverability_classification !== "not_demonstrated") unavailable();
  if (view.saas.combined_total !== null) unavailable();

  const metricInventory = new Map();
  addMetricInventory(metricInventory, [view.cloud.total]);
  addMetricInventory(metricInventory, view.cloud.comparison);
  addMetricInventory(metricInventory, view.cloud.services);
  addMetricInventory(metricInventory, view.cloud.daily);
  addMetricInventory(metricInventory, [view.ai.total]);
  addMetricInventory(metricInventory, view.ai.metrics);
  addMetricInventory(metricInventory, view.saas.invoice_metrics);
  addMetricInventory(metricInventory, view.resilience.modeled_metrics);
  addMetricInventory(metricInventory, view.resilience.observed_restore_metrics);
  view.anomalies.forEach((anomaly) => {
    const record = requireObject(anomaly);
    addMetricInventory(metricInventory, [record.observed, record.expected, record.impact, record.percentage_change, record.score]);
    if (record.impact_classification !== "anomaly_impact_not_savings") unavailable();
  });

  metricInventory.forEach((metric) => {
    metric.trace.input_metric_ids.forEach((id) => {
      if (!metricInventory.has(id)) unavailable();
    });
  });

  const findingIds = new Set();
  view.findings.forEach((finding) => {
    const id = validateFinding(finding, metricInventory);
    if (findingIds.has(id)) unavailable();
    findingIds.add(id);
  });
  view.anomalies.forEach((anomaly) => {
    const finding = requireObject(anomaly.finding);
    if (!findingIds.has(finding.id)) unavailable();
    const catalogFinding = view.findings.find((entry) => entry.id === finding.id);
    if (JSON.stringify(finding) !== JSON.stringify(catalogFinding)) unavailable();
  });
  requireArray(view.resilience.findings).forEach((finding) => {
    const record = requireObject(finding);
    if (!findingIds.has(record.id)) unavailable();
    const catalogFinding = view.findings.find((entry) => entry.id === record.id);
    if (JSON.stringify(record) !== JSON.stringify(catalogFinding)) unavailable();
  });
  requireArray(view.ai.unattributed_findings).forEach((finding) => {
    const record = requireObject(finding);
    if (!findingIds.has(record.id)) unavailable();
    const catalogFinding = view.findings.find((entry) => entry.id === record.id);
    if (JSON.stringify(record) !== JSON.stringify(catalogFinding)) unavailable();
  });

  const sourceOpportunity = requireObject(view.opportunity.source);
  const opportunityId = requireText(sourceOpportunity.id);
  validateProducer(sourceOpportunity.producer);
  const estimate = requireObject(sourceOpportunity.estimate);
  ["low", "expected", "high"].forEach((field) => {
    if (estimate[field] !== null && typeof estimate[field] !== "string") unavailable();
  });
  requireArray(sourceOpportunity.evidence_ids).forEach(requireText);
  const opportunityTrace = requireObject(sourceOpportunity.trace);
  if (opportunityTrace.canonical_id !== opportunityId || opportunityTrace.source_artifact !== "saas-cost-analyzer.json") unavailable();
  validateProducer(opportunityTrace.producer);
  requireArray(opportunityTrace.evidence_ids).forEach(requireText);

  const aggregate = requireObject(view.opportunity.annual_aggregate);
  requireText(aggregate.id);
  ["low", "expected", "high"].forEach((field) => {
    if (aggregate[field] !== null && typeof aggregate[field] !== "string") unavailable();
  });
  const aggregateOpportunityIds = requireArray(aggregate.opportunity_ids);
  if (aggregateOpportunityIds.length !== 1 || aggregateOpportunityIds[0] !== opportunityId) unavailable();
  const aggregateTrace = requireObject(aggregate.trace);
  if (aggregateTrace.canonical_id !== aggregate.id || aggregateTrace.source_artifact !== "report.json") unavailable();
  if (
    !isObject(aggregateTrace.producer)
    || aggregateTrace.producer.name !== "tech-spend-command-center"
    || aggregateTrace.producer.version !== "0.2.1"
  ) unavailable();
  requireArray(aggregateTrace.source_opportunity_ids).forEach((id) => {
    if (id !== opportunityId) unavailable();
  });

  return candidate;
}

const validatedGeneratedDashboardView = validateCcacDashboardView(generatedDashboardView);

export function getValidatedCcacDashboardView() {
  return cloneValue(validatedGeneratedDashboardView);
}
