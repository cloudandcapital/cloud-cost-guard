import generatedView from "../data/ccac-dashboard-view-v1.1.generated.json";

export const CCAC11_VIEW_SCHEMA = "ccg-dashboard-view/1.1.0";
export const SOURCE_REPORT_SHA256 = "5479da098b31fdf630fe3a0edc3ac67d30848185cecc61b640d998461b2f6b41";
export const FINAL_MANIFEST_SHA256 = "1919025af73e9cc4a3b5d29d21f13ad9c391e40533874b0c5cfc0325867eb632";
export const REPORT_PROVENANCE_MANIFEST_SHA256 = "a991ba3fbe53c11b9ac9cc347b4b62307fe5de083a90362ae46088c7bc08eeb5";

const EXPECTED_SCOPES = [
  "metric.tech-spend.scope.cloud",
  "metric.tech-spend.scope.direct_ai",
  "metric.tech-spend.scope.saas",
];

const decimalPattern = /^(0|[1-9]\d*)(\.\d+)?$/;

export class CanonicalViewError extends Error {}

const fail = (message) => {
  throw new CanonicalViewError(`Canonical CCAC 1.1 view rejected: ${message}`);
};

const requireObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is missing`);
  return value;
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) fail(`${label} is missing`);
  return value;
};

const requireDecimal = (record, expectedId) => {
  requireObject(record, expectedId);
  if (record.id !== expectedId || record.trace?.canonical_id !== expectedId) fail(`${expectedId} identity mismatch`);
  if (typeof record.value !== "string" || !decimalPattern.test(record.value)) fail(`${expectedId} has an invalid value`);
  const number = Number(record.value);
  if (!Number.isFinite(number) || number < 0) fail(`${expectedId} has an invalid value`);
  if (record.unknown_reason !== null) fail(`${expectedId} is unexpectedly unknown`);
  return { ...record, displayValue: number };
};

const assertUniqueIds = (records) => {
  const ids = new Set();
  records.forEach((record) => {
    if (!record?.id || ids.has(record.id)) fail("canonical IDs are missing or duplicated");
    ids.add(record.id);
  });
};

const unsupportedMap = (records) => Object.fromEntries(requireArray(records, "unsupported registry").map((item) => [item.concept, item]));

export function createCcac11PresentationModel(view = generatedView) {
  requireObject(view, "view");
  if (view.schema !== CCAC11_VIEW_SCHEMA) fail("schema mismatch");
  const identity = requireObject(view.identity, "identity");
  if (identity.mode !== "illustrative" || identity.status !== "complete") fail("report is not a complete illustrative run");
  if (identity.source_report_sha256 !== SOURCE_REPORT_SHA256) fail("trusted-report hash mismatch");

  const metadata = requireObject(view.source_metadata, "source metadata");
  if (metadata.final_manifest_sha256 !== FINAL_MANIFEST_SHA256) fail("final manifest hash mismatch");
  if (metadata.report_provenance_manifest_sha256 !== REPORT_PROVENANCE_MANIFEST_SHA256) fail("report-provenance manifest hash mismatch");
  if (metadata.approved_release_provenance?.ccac?.version !== "v0.2.0") fail("CCAC release mismatch");
  if (metadata.approved_release_provenance?.ccac?.wheel_sha256 !== "bc46f363b1a03c94cf0da75759bccd0271de2c53b1f77a1a7255f9c8e7f768f1") fail("CCAC wheel mismatch");
  if (metadata.approved_release_provenance?.command_center_commit !== "b114f776727a070e34c2f0d771165464f2055b93") fail("Command Center revision mismatch");

  const technologySpend = requireObject(view.technology_spend, "technology spend");
  const total = requireDecimal(technologySpend.total, "metric.tech-spend.total");
  const scopes = requireArray(technologySpend.scopes, "technology spend scopes").map((record) => requireDecimal(record, record?.id));
  if (scopes.length !== 3 || scopes.map(({ id }) => id).join("|") !== EXPECTED_SCOPES.join("|")) fail("scope inventory mismatch");
  const reconciliation = requireObject(technologySpend.reconciliation, "reconciliation");
  if (reconciliation.status !== "passed" || reconciliation.output_metric_id !== total.id) fail("reconciliation did not pass");
  if (reconciliation.input_metric_ids?.join("|") !== EXPECTED_SCOPES.join("|")) fail("reconciliation inputs mismatch");
  if (reconciliation.difference !== "0.0") fail("reconciliation difference mismatch");

  const scopeById = Object.fromEntries(scopes.map((record) => [record.id, record]));
  const cloudTotal = scopeById[EXPECTED_SCOPES[0]];
  const directAi = scopeById[EXPECTED_SCOPES[1]];
  const saasScope = scopeById[EXPECTED_SCOPES[2]];
  if (view.cloud?.total?.id !== cloudTotal.id || view.saas?.canonical_scope_total?.id !== saasScope.id) fail("scope references diverge");

  const cloudDaily = requireArray(view.cloud?.daily, "cloud daily series").map((record) => requireDecimal(record, record.id));
  const cloudServices = requireArray(view.cloud?.services, "cloud services").map((record) => requireDecimal(record, record.id));
  const cloudComparison = requireArray(view.cloud?.comparison, "cloud comparison").map((record) => requireDecimal(record, record.id));
  const aiDomainTotal = requireDecimal(view.ai?.total, "metric.ai.total-cost");
  if (aiDomainTotal.trace?.additivity !== "non_additive") fail("AI domain total must remain non-additive");
  const aiCostMetrics = requireArray(view.ai?.metrics, "AI metrics")
    .filter((record) => record.trace?.unit === "currency" && record.id !== aiDomainTotal.id && record.id !== directAi.id)
    .map((record) => requireDecimal(record, record.id));
  const invoices = requireArray(view.saas?.invoice_metrics, "SaaS invoices").map((record) => requireDecimal(record, record.id));
  if (invoices.length !== 2 || view.saas.combined_invoice_total !== null) fail("SaaS invoice boundary mismatch");

  const findings = requireArray(view.findings, "findings");
  const anomalies = requireArray(view.anomalies, "anomalies").map((anomaly) => ({
    ...anomaly,
    expected: requireDecimal(anomaly.expected, anomaly.expected?.id),
    observed: requireDecimal(anomaly.observed, anomaly.observed?.id),
    impact: requireDecimal(anomaly.impact, anomaly.impact?.id),
    percentage_change: requireDecimal(anomaly.percentage_change, anomaly.percentage_change?.id),
    score: requireDecimal(anomaly.score, anomaly.score?.id),
  }));
  const modeledResilience = requireArray(view.resilience?.modeled_metrics, "modeled resilience metrics").map((record) => requireDecimal(record, record.id));
  const observedResilience = requireArray(view.resilience?.observed_restore_metrics, "observed resilience metrics").map((record) => requireDecimal(record, record.id));
  const anomalyMetrics = anomalies.flatMap(({ expected, observed, impact, percentage_change: percentageChange, score }) => [expected, observed, impact, percentageChange, score]);
  assertUniqueIds([...scopes, total, ...cloudDaily, ...cloudServices, ...cloudComparison, ...findings, ...anomalyMetrics, ...modeledResilience, ...observedResilience]);
  findings.forEach((finding) => {
    if (finding.trace?.canonical_id !== finding.id || !finding.evidence_ids?.length || !finding.producer?.name) fail("finding provenance mismatch");
  });

  const unsupported = unsupportedMap(view.unsupported);
  ["combined_daily_technology_spend", "next_month_forecast", "tagging_coverage", "kubernetes_cost_or_utilization", "verified_savings", "unknown_as_zero"].forEach((concept) => {
    if (!unsupported[concept]) fail(`unsupported concept ${concept} is missing`);
  });

  return {
    schema: view.schema,
    identity,
    sourceMetadata: metadata,
    total,
    reconciliation,
    scopes,
    scopeById,
    cloud: { total: cloudTotal, daily: cloudDaily, services: cloudServices, comparison: cloudComparison },
    ai: { directScope: directAi, domainTotal: aiDomainTotal, costMetrics: aiCostMetrics, crossDomainAdditivity: view.ai.cross_domain_additivity },
    saas: { scope: saasScope, invoices },
    findings,
    anomalies,
    resilience: {
      classification: view.resilience.recoverability_classification,
      findings: view.resilience.findings,
      modeled: modeledResilience,
      observed: observedResilience,
    },
    opportunity: view.opportunity,
    unsupported,
  };
}

export function getCcac11PresentationModel() {
  return createCcac11PresentationModel(generatedView);
}
