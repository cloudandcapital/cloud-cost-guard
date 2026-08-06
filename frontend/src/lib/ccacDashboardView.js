import generatedDashboardView from "../data/ccac-dashboard-view.generated.json";
import identityPolicy from "./ccacDashboardViewIdentityPolicy";

export const CCAC_DASHBOARD_UNAVAILABLE_MESSAGE =
  "Validated illustrative dashboard data is unavailable.";

const SOURCE_POLICY = identityPolicy.source_policy;
const PROJECTED_POLICY = identityPolicy.projected_view;
const EXPECTED_PRODUCERS = Object.fromEntries(
  Object.entries(SOURCE_POLICY.producers).map(([name, producer]) => [name, {
    version: producer.version,
    artifact: producer.artifact.filename,
    sha256: producer.artifact.sha256,
  }]),
);

const REQUIRED_UNSUPPORTED_CONCEPTS = new Set(SOURCE_POLICY.unsupported_concepts);

// These canonical metrics remain referenced by audit-visible SaaS findings but are
// intentionally not projected as displayable metric records in view version 1.
const NONPROJECTED_CANONICAL_METRIC_REFERENCES = new Set([
  "metric.saas.design-a77de8a6.unknown-activity-seats",
  "metric.saas.design-a77de8a6.unassigned-seats",
]);

const REQUIRED_DISCLOSURES = SOURCE_POLICY.display.disclosures;

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

function validatePlainJsonData(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) unavailable();
    return;
  }
  if (typeof value !== "object") unavailable();
  if (ancestors.has(value)) unavailable();
  ancestors.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) unavailable();
    value.forEach((child) => validatePlainJsonData(child, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unavailable();
    Reflect.ownKeys(value).forEach((key) => {
      if (typeof key !== "string") unavailable();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !("value" in descriptor)) unavailable();
      validatePlainJsonData(descriptor.value, ancestors);
    });
  }
  ancestors.delete(value);
}

function requireUniqueTextArray(value) {
  const array = requireArray(value);
  const seen = new Set();
  array.forEach((entry) => {
    requireText(entry);
    if (seen.has(entry)) unavailable();
    seen.add(entry);
  });
  return array;
}

function requireExactSet(actual, expected) {
  const values = requireUniqueTextArray(actual);
  if (values.length !== expected.length) unavailable();
  const allowed = new Set(expected);
  values.forEach((value) => {
    if (!allowed.has(value)) unavailable();
  });
}

function requireExactSequence(actual, expected) {
  const values = requireUniqueTextArray(actual);
  if (values.length !== expected.length) unavailable();
  values.forEach((value, index) => {
    if (value !== expected[index]) unavailable();
  });
}

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

function validateTrace(trace, id, relationship) {
  const record = requireObject(trace);
  if (record.canonical_id !== id) unavailable();
  validateProducer(record.producer);
  const expected = EXPECTED_PRODUCERS[record.producer.name];
  if (
    record.source_artifact !== expected.artifact
    || record.producer.name !== relationship.producer
    || record.source_artifact !== relationship.source_artifact
  ) unavailable();
  requireText(record.unit);
  if (record.currency !== null && !isText(record.currency)) unavailable();
  validatePeriod(record.period);
  requireText(record.basis);
  requireText(record.quality);
  requireExactSet(record.evidence_ids, relationship.evidence_ids);
  requireExactSet(record.input_metric_ids, relationship.input_metric_ids);
  if (record.formula !== null && !isText(record.formula)) unavailable();
}

function validateMetric(metric) {
  const record = requireObject(metric);
  const id = requireText(record.id);
  const relationship = PROJECTED_POLICY.metric_relationships[id];
  if (!relationship) unavailable();
  requireText(record.name);
  if (record.value !== null && typeof record.value !== "string") unavailable();
  if (record.value === null) requireText(record.unknown_reason);
  if (record.value !== null && record.unknown_reason !== null) unavailable();
  requireObject(record.dimensions);
  validateTrace(record.trace, id, relationship);
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
  const relationship = SOURCE_POLICY.finding_relationships[id];
  if (!relationship) unavailable();
  validateProducer(record.producer);
  if (record.producer.name !== relationship.producer) unavailable();
  requireText(record.title);
  requireText(record.type);
  requireText(record.status);
  requireText(record.severity);
  requireText(record.quality);
  const references = requireUniqueTextArray(record.metric_ids);
  requireExactSet(references, relationship.metric_ids);
  references.forEach((metricId) => {
    requireText(metricId);
    if (!metricIds.has(metricId) && !NONPROJECTED_CANONICAL_METRIC_REFERENCES.has(metricId)) unavailable();
  });
  requireExactSet(record.evidence_ids, relationship.evidence_ids);
  const trace = requireObject(record.trace);
  if (trace.canonical_id !== id || trace.source_artifact !== EXPECTED_PRODUCERS[record.producer.name].artifact) unavailable();
  validateProducer(trace.producer);
  requireExactSet(trace.metric_ids, relationship.metric_ids);
  trace.metric_ids.forEach((metricId) => {
    requireText(metricId);
    if (!metricIds.has(metricId) && !NONPROJECTED_CANONICAL_METRIC_REFERENCES.has(metricId)) unavailable();
  });
  requireExactSet(trace.evidence_ids, relationship.evidence_ids);
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
    const expectedQuality = SOURCE_POLICY.quality_relationships[producer.name];
    if (quality.status !== expectedQuality.status) unavailable();
    const issues = requireArray(quality.issues);
    if (issues.length !== expectedQuality.issues.length) unavailable();
    issues.forEach((issue, index) => {
      const record = requireObject(issue);
      const expectedIssue = expectedQuality.issues[index];
      if (
        record.code !== expectedIssue.code
        || record.field !== expectedIssue.field
        || record.source_id !== expectedIssue.source_id
      ) unavailable();
    });
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
  if (metadata.manifest_sha256 !== SOURCE_POLICY.manifest.sha256) unavailable();
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
function validateCandidate(candidate) {
  validatePlainJsonData(candidate);
  const view = requireObject(candidate);
  if (view.schema !== SOURCE_POLICY.view_schema) unavailable();

  const identity = requireObject(view.identity);
  if (
    identity.mode !== SOURCE_POLICY.source_report.mode
    || identity.contract !== SOURCE_POLICY.source_report.contract
    || identity.status !== SOURCE_POLICY.source_report.status
    || identity.command_center_version !== SOURCE_POLICY.source_report.producer.version
    || identity.source_report_sha256 !== SOURCE_POLICY.source_report.sha256
    || identity.report_id !== SOURCE_POLICY.source_report.report_id
    || identity.run_id !== SOURCE_POLICY.source_report.run_id
    || identity.generated_at !== SOURCE_POLICY.source_report.generated_at
  ) unavailable();
  requireText(identity.report_id);
  requireText(identity.run_id);
  requireText(identity.generated_at);
  validatePeriod(identity.report_period);
  if (JSON.stringify(identity.report_period) !== JSON.stringify(SOURCE_POLICY.source_report.period)) unavailable();
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

  requireExactSet([...metricInventory.keys()], Object.keys(PROJECTED_POLICY.metric_relationships));

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
  requireExactSequence([...findingIds], SOURCE_POLICY.display.finding_ids);
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
  const opportunityRelationship = SOURCE_POLICY.opportunity_relationships[opportunityId];
  if (!opportunityRelationship || Object.keys(SOURCE_POLICY.opportunity_relationships).length !== 1) unavailable();
  validateProducer(sourceOpportunity.producer);
  if (sourceOpportunity.producer.name !== opportunityRelationship.producer) unavailable();
  const estimate = requireObject(sourceOpportunity.estimate);
  ["low", "expected", "high"].forEach((field) => {
    if (estimate[field] !== null && typeof estimate[field] !== "string") unavailable();
  });
  requireExactSet(sourceOpportunity.evidence_ids, opportunityRelationship.evidence_ids);
  const opportunityTrace = requireObject(sourceOpportunity.trace);
  if (opportunityTrace.canonical_id !== opportunityId || opportunityTrace.source_artifact !== "saas-cost-analyzer.json") unavailable();
  validateProducer(opportunityTrace.producer);
  requireExactSet(opportunityTrace.evidence_ids, opportunityRelationship.evidence_ids);

  const aggregate = requireObject(view.opportunity.annual_aggregate);
  const aggregateId = requireText(aggregate.id);
  const aggregateRelationship = SOURCE_POLICY.aggregate_relationships[aggregateId];
  if (!aggregateRelationship || Object.keys(SOURCE_POLICY.aggregate_relationships).length !== 1) unavailable();
  ["low", "expected", "high"].forEach((field) => {
    if (aggregate[field] !== null && typeof aggregate[field] !== "string") unavailable();
  });
  const aggregateOpportunityIds = requireArray(aggregate.opportunity_ids);
  requireExactSet(aggregateOpportunityIds, aggregateRelationship.opportunity_ids);
  if (aggregateOpportunityIds[0] !== opportunityId) unavailable();
  const aggregateTrace = requireObject(aggregate.trace);
  if (aggregateTrace.canonical_id !== aggregate.id || aggregateTrace.source_artifact !== "report.json") unavailable();
  if (
    !isObject(aggregateTrace.producer)
    || aggregateTrace.producer.name !== "tech-spend-command-center"
    || aggregateTrace.producer.version !== "0.2.1"
  ) unavailable();
  requireExactSet(aggregateTrace.source_opportunity_ids, aggregateRelationship.opportunity_ids);

  return cloneValue(candidate);
}

export function validateCcacDashboardView(candidate) {
  try {
    return validateCandidate(candidate);
  } catch (error) {
    if (error instanceof CcacDashboardViewUnavailableError) throw error;
    return unavailable();
  }
}

const validatedGeneratedDashboardView = validateCcacDashboardView(generatedDashboardView);

export function getValidatedCcacDashboardView() {
  return cloneValue(validatedGeneratedDashboardView);
}
