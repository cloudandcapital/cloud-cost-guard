const CCAC11_VIEW_SCHEMA = "ccg-dashboard-view/1.1.0";
const SOURCE_REPORT_SHA256 = "5479da098b31fdf630fe3a0edc3ac67d30848185cecc61b640d998461b2f6b41";
const FINAL_MANIFEST_SHA256 = "1919025af73e9cc4a3b5d29d21f13ad9c391e40533874b0c5cfc0325867eb632";
const REPORT_PROVENANCE_MANIFEST_SHA256 = "a991ba3fbe53c11b9ac9cc347b4b62307fe5de083a90362ae46088c7bc08eeb5";

const PERIOD = { start: "2026-07-01", end: "2026-07-22", timezone: "UTC" };
const PRODUCERS = {
  "ai-cost-lens": ["0.3.0", "ai-cost-lens.json", "c4ab27a5c83ca7165de130a08c5d118fd18887b2", "c4715c88b5d31e5a7b8e9867bd89ede4edeac5491e2b2dc8c20f79b68eb95af4", "valid"],
  "finops-lite": ["0.4.0", "finops-lite.json", "d72649ec07aa57c60a7ea3f8ff2890b8d95c4b93", "0dc4e0d5e3053f03daa773da7bb5c84d3cb8ad8e7f1a52d0e4b4937da722d570", "valid"],
  "finops-watchdog": ["0.5.0", "finops-watchdog.json", "9bc4e90725969f7775b3aef110b01e10dec4a7e0", "4ff11ff8dd0562a128c2aa22ef2fb85f78574a042b08f70b0b000312fd5e4aeb", "valid"],
  "recovery-economics": ["0.3.0", "recovery-economics.json", "9a6c4e1ce34e58af10fc42d44d911338a724dabe", "eaeae3b11501d1cc4e77ab02ad5c594e8122e49abb5e1335a9130b909694be02", "valid"],
  "saas-cost-analyzer": ["0.3.0", "saas-cost-analyzer.json", "a627aff595eb0c0fc44f23a07662cfd82cc98bbe", "1f8af7f1e03cb4b5fdcb0c4692974640844d3d216bb3f2502640d6c2939d5b43", "partial"],
};
const COMMAND_CENTER = ["0.3.0", "report.json"];
const SCOPES = ["metric.tech-spend.scope.cloud", "metric.tech-spend.scope.direct_ai", "metric.tech-spend.scope.saas"];
const CLOUD_COMPARISON = ["metric.cloud.previous-total", "metric.cloud.change-amount", "metric.cloud.change-percentage"];
const CLOUD_SERVICES = ["metric.cloud.service.amazonec2-23d867e0.cost", "metric.cloud.service.amazons3-c600b2aa.cost"];
const CLOUD_DAILY = Array.from({ length: 21 }, (_, index) => `metric.cloud.day.2026-07-${String(index + 1).padStart(2, "0")}.cost`);
const AI_BASES = ["anthropic-illustrative-model-b-research-data-5d0cc148", "bedrock-illustrative-model-c-assistant-platfo-591c8d57", "openai-illustrative-model-a-assistant-product-62792193", "openai-illustrative-model-a-unattributed-unat-cdf1dc72"];
const AI_SUFFIXES = ["cached-input-tokens", "cost", "cost-per-million-tokens", "cost-per-request", "output-tokens", "reasoning-tokens", "requests", "uncached-input-tokens"];
const AI_METRICS = [...AI_BASES.flatMap((base) => AI_SUFFIXES.map((suffix) => `metric.ai.${base}.${suffix}`)), "metric.ai.total-cost", SCOPES[1]].sort();
const INVOICES = ["metric.saas.crm-9261ceef.invoice-cost", "metric.saas.design-a77de8a6.invoice-cost"];
const FINDINGS = ["finding.anomaly.provider-aws-scope-cloud-service-amazone-b105271d", "finding.anomaly.provider-aws-scope-cloud-service-amazons-0a7ea717", "finding.resilience-gap.orders-db.rto", "finding.resilience-gap.orders-db.rpo", "finding.resilience-gap.orders-db.restore-evidence", "finding.resilience-gap.orders-db.tested-rto", "finding.resilience-gap.orders-db.tested-rpo", "finding.allocation.openai-illustrative-model-a-unattributed-unat-cdf1dc72", "finding.saas.design-a77de8a6.activity-evidence", "finding.saas.design-a77de8a6.assignment-roster"];
const RESILIENCE_FINDINGS = FINDINGS.slice(2, 7);
const MODELED_RESILIENCE = ["compute-cost-per-event", "effective-stored-gb", "egress-cost-per-event", "expected-monthly-economic-exposure", "expected-monthly-outage-exposure", "expected-monthly-recovery-cost", "failback-cost-per-event", "failover-cost-per-event", "modeled-rpo-hours", "modeled-rto-hours", "monthly-backup-request-cost", "monthly-design-cost", "monthly-storage-cost", "recovery-event-cost", "retrieval-cost-per-event"].map((suffix) => `metric.resilience.orders-db.${suffix}`);
const OBSERVED_RESILIENCE = ["metric.resilience.orders-db.tested-recovered-point-age-hours", "metric.resilience.orders-db.tested-restore-duration-hours"];
const ADDITIVE_MODELED = new Set(["expected-monthly-economic-exposure", "expected-monthly-outage-exposure", "expected-monthly-recovery-cost", "monthly-backup-request-cost", "monthly-design-cost", "monthly-storage-cost"]);
const UNSUPPORTED = {
  combined_daily_technology_spend: "missing_canonical_metric", next_month_forecast: "missing_canonical_metric",
  avoidable_run_rate: "browser_derived_value_forbidden", monthly_opportunity_scalar: "period_conversion_forbidden",
  tagging_coverage: "missing_canonical_metric", kubernetes_cost_or_utilization: "missing_canonical_metric",
  verified_savings: "trust_classification_forbidden", realized_savings: "trust_classification_forbidden",
  demonstrated_recoverability: "insufficient_passing_evidence", unknown_as_zero: "missing_value_substitution_forbidden",
};
const decimalPattern = /^(0|[1-9]\d*)(\.\d+)?$/;
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {}) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

class CanonicalViewError extends Error {}
const fail = (message) => { throw new CanonicalViewError(`Canonical CCAC 1.1 view rejected: ${message}`); };
const object = (value, label) => { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is missing`); return value; };
const array = (value, label) => { if (!Array.isArray(value)) fail(`${label} is missing`); return value; };
const exactInventory = (records, ids, label) => {
  if (records.length !== ids.length || records.map(({ id }) => id).join("|") !== ids.join("|")) fail(`${label} inventory mismatch`);
};
const producerForFinding = (id) => id.startsWith("finding.anomaly.") ? "finops-watchdog" : id.startsWith("finding.resilience-gap.") ? "recovery-economics" : id.startsWith("finding.allocation.") ? "ai-cost-lens" : "saas-cost-analyzer";
const checkProducer = (producer, expected, label) => {
  const spec = expected === "tech-spend-command-center" ? COMMAND_CENTER : PRODUCERS[expected];
  if (!spec || producer?.name !== expected || producer?.version !== spec[0]) fail(`${label} producer mismatch`);
};
const checkPeriod = (actual, expected, label) => { if (!same(actual, expected)) fail(`${label} period mismatch`); };
const decimal = (record, id, spec = {}) => {
  object(record, id);
  if (record.id !== id || record.trace?.canonical_id !== id) fail(`${id} identity mismatch`);
  if (typeof record.value !== "string" || !decimalPattern.test(record.value) || !Number.isFinite(Number(record.value)) || Number(record.value) < 0 || record.unknown_reason !== null) fail(`${id} has an invalid value`);
  const trace = object(record.trace, `${id} trace`);
  checkProducer(trace.producer, spec.producer, id);
  const source = spec.producer === "tech-spend-command-center" ? COMMAND_CENTER[1] : PRODUCERS[spec.producer][1];
  if (trace.source_artifact !== source || trace.quality !== "valid" || trace.basis !== spec.basis || trace.unit !== spec.unit || trace.additivity !== spec.additivity || trace.currency !== (spec.currency ?? null)) fail(`${id} semantic trace mismatch`);
  checkPeriod(trace.period, spec.period || PERIOD, id);
  return { ...record, displayValue: Number(record.value) };
};
const finding = (record, id) => {
  object(record, id);
  const owner = producerForFinding(id);
  if (record.id !== id || record.trace?.canonical_id !== id || !record.evidence_ids?.length || !same(record.evidence_ids, record.trace?.evidence_ids)) fail(`${id} finding identity mismatch`);
  checkProducer(record.producer, owner, id); checkProducer(record.trace?.producer, owner, id);
  if (record.trace?.source_artifact !== PRODUCERS[owner][1]) fail(`${id} finding source mismatch`);
  return record;
};
const unique = (records) => { const ids = new Set(); records.forEach(({ id } = {}) => { if (!id || ids.has(id)) fail("canonical IDs are missing or duplicated"); ids.add(id); }); };

function createCcac11PresentationModel(view) {
  object(view, "view");
  if (view.schema !== CCAC11_VIEW_SCHEMA) fail("schema mismatch");
  const identity = object(view.identity, "identity");
  if (identity.contract !== "ccac/1.1.0" || identity.mode !== "illustrative" || identity.status !== "complete" || identity.report_id !== "report.tech-spend.trusted" || identity.command_center_version !== "0.3.0") fail("report identity mismatch");
  checkPeriod(identity.report_period, PERIOD, "report");
  if (identity.source_report_sha256 !== SOURCE_REPORT_SHA256) fail("trusted-report hash mismatch");
  const metadata = object(view.source_metadata, "source metadata");
  if (metadata.final_manifest_sha256 !== FINAL_MANIFEST_SHA256 || metadata.report_provenance_manifest_sha256 !== REPORT_PROVENANCE_MANIFEST_SHA256) fail("manifest hash mismatch");
  if (!same(metadata.catalog_counts, { findings: 10, metrics: 160, opportunities: 1, opportunity_aggregates: 0 })) fail("catalog counts mismatch");
  const provenance = object(metadata.approved_release_provenance, "release provenance");
  if (!same(provenance.ccac, { version: "v0.2.0", wheel_sha256: "bc46f363b1a03c94cf0da75759bccd0271de2c53b1f77a1a7255f9c8e7f768f1" }) || provenance.command_center_commit !== "b114f776727a070e34c2f0d771165464f2055b93") fail("approved release mismatch");
  const names = Object.keys(PRODUCERS);
  const producerCommits = object(provenance.producer_commits, "producer commits"); const artifactHashes = object(metadata.artifact_sha256s, "artifact hashes");
  if (!same(Object.keys(producerCommits).sort(), names) || !same(Object.keys(artifactHashes).sort(), names)) fail("producer provenance inventory mismatch");
  names.forEach((name) => { if (producerCommits[name] !== PRODUCERS[name][2] || artifactHashes[name] !== PRODUCERS[name][3]) fail(`${name} provenance mismatch`); });
  const producers = array(view.producers, "producers");
  if (producers.length !== names.length || !same(producers.map(({ name }) => name), names)) fail("producer inventory mismatch");
  producers.forEach((record) => { const spec = PRODUCERS[record.name]; if (!spec || record.version !== spec[0] || record.source?.artifact !== spec[1] || record.source?.artifact_sha256 !== spec[3] || record.quality?.status !== spec[4]) fail(`${record.name} producer metadata mismatch`); });

  const total = decimal(view.technology_spend?.total, "metric.tech-spend.total", { producer: "tech-spend-command-center", basis: "calculated", unit: "currency", currency: "USD", additivity: "additive" });
  if (total.value !== "2939.0525") fail("technology spend value mismatch");
  const scopeSpecs = [
    { producer: "finops-lite", basis: "observed", unit: "currency", currency: "USD", additivity: "additive" },
    { producer: "ai-cost-lens", basis: "calculated", unit: "currency", currency: "USD", additivity: "additive" },
    { producer: "saas-cost-analyzer", basis: "calculated", unit: "currency", currency: "USD", additivity: "additive" },
  ];
  const scopesRaw = array(view.technology_spend?.scopes, "technology spend scopes"); exactInventory(scopesRaw, SCOPES, "scope");
  const scopes = scopesRaw.map((record, index) => decimal(record, SCOPES[index], scopeSpecs[index]));
  if (!same(scopes.map(({ value }) => value), ["2194.0", "8.2825", "736.77"])) fail("scope values mismatch");
  const reconciliation = object(view.technology_spend?.reconciliation, "reconciliation");
  if (reconciliation.id !== "reconciliation.tech-spend" || reconciliation.status !== "passed" || reconciliation.output_metric_id !== total.id || !same(reconciliation.input_metric_ids, SCOPES) || reconciliation.difference !== "0.0" || reconciliation.tolerance !== "0.01") fail("reconciliation mismatch");
  const scopeById = Object.fromEntries(scopes.map((record) => [record.id, record]));
  if (!same(view.cloud?.total, scopesRaw[0]) || !same(view.saas?.canonical_scope_total, scopesRaw[2])) fail("scope alias mismatch");

  const dailyRaw = array(view.cloud?.daily, "cloud daily"); exactInventory(dailyRaw, CLOUD_DAILY, "cloud daily");
  const cloudDaily = dailyRaw.map((record, index) => decimal(record, CLOUD_DAILY[index], { producer: "finops-lite", basis: "observed", unit: "currency", currency: "USD", additivity: "additive", period: { start: CLOUD_DAILY[index].slice(17, 27), end: new Date(`${CLOUD_DAILY[index].slice(17, 27)}T00:00:00Z`).toISOString().slice(0, 10).replace(/-(\d\d)$/, (_, day) => `-${String(Number(day) + 1).padStart(2, "0")}`), timezone: "UTC" } }));
  const serviceRaw = array(view.cloud?.services, "cloud services"); exactInventory(serviceRaw, CLOUD_SERVICES, "cloud service");
  const cloudServices = serviceRaw.map((record, index) => decimal(record, CLOUD_SERVICES[index], { producer: "finops-lite", basis: "observed", unit: "currency", currency: "USD", additivity: "additive" }));
  const comparisonRaw = array(view.cloud?.comparison, "cloud comparison"); exactInventory(comparisonRaw, CLOUD_COMPARISON, "cloud comparison");
  const comparisonSpecs = [
    { producer: "finops-lite", basis: "observed", unit: "currency", currency: "USD", additivity: "additive", period: { start: "2026-06-10", end: "2026-07-01", timezone: "UTC" } },
    { producer: "finops-lite", basis: "calculated", unit: "currency", currency: "USD", additivity: "non_additive" },
    { producer: "finops-lite", basis: "calculated", unit: "percent", additivity: "ratio" },
  ];
  const cloudComparison = comparisonRaw.map((record, index) => decimal(record, CLOUD_COMPARISON[index], comparisonSpecs[index]));

  const aiRaw = array(view.ai?.metrics, "AI metrics"); exactInventory(aiRaw, AI_METRICS, "AI metric");
  const aiAll = aiRaw.map((record) => {
    if (record.id === SCOPES[1]) return decimal(record, record.id, scopeSpecs[1]);
    const suffix = record.id.split(".").pop(); const unit = record.id === "metric.ai.total-cost" || suffix === "cost" ? "currency" : suffix === "requests" ? "requests" : suffix === "cost-per-request" ? "currency_per_request" : suffix === "cost-per-million-tokens" ? "currency_per_million_tokens" : "tokens";
    const basis = suffix === "cost" && record.id.startsWith("metric.ai.bedrock-") ? "observed" : suffix === "cost" || suffix.startsWith("cost-per") || record.id === "metric.ai.total-cost" ? "calculated" : "observed";
    return decimal(record, record.id, { producer: "ai-cost-lens", basis, unit, currency: unit.startsWith("currency") ? "USD" : null, additivity: record.id === "metric.ai.total-cost" ? "non_additive" : unit.startsWith("currency_per") ? "ratio" : "additive" });
  });
  const aiDomainTotal = aiAll.find(({ id }) => id === "metric.ai.total-cost");
  if (view.ai?.total?.id !== aiDomainTotal.id || !same(view.ai.total, aiRaw.find(({ id }) => id === aiDomainTotal.id)) || aiDomainTotal.value !== "12.5325" || view.ai.cross_domain_additivity !== "non_additive") fail("AI domain boundary mismatch");
  const aiCostMetrics = aiAll.filter((record) => record.trace.unit === "currency" && ![aiDomainTotal.id, SCOPES[1]].includes(record.id));

  const invoiceRaw = array(view.saas?.invoice_metrics, "SaaS invoices"); exactInventory(invoiceRaw, INVOICES, "SaaS invoice");
  const invoicePeriods = [{ start: "2025-12-01", end: "2026-12-01", timezone: "UTC" }, { start: "2026-07-01", end: "2026-10-01", timezone: "UTC" }];
  const invoices = invoiceRaw.map((record, index) => decimal(record, INVOICES[index], { producer: "saas-cost-analyzer", basis: "observed", unit: "currency", currency: "USD", additivity: "additive", period: invoicePeriods[index] }));
  if (!same(invoices.map(({ value, dimensions }) => [value, dimensions.billing_cadence]), [["8640.0", "annual"], ["1050.0", "quarterly"]]) || view.saas.combined_invoice_total !== null) fail("SaaS invoice boundary mismatch");

  const findingsRaw = array(view.findings, "findings"); exactInventory(findingsRaw, FINDINGS, "finding"); const findings = findingsRaw.map((record, index) => finding(record, FINDINGS[index]));
  const anomalyFindingIds = FINDINGS.slice(0, 2); const anomaliesRaw = array(view.anomalies, "anomalies");
  if (anomaliesRaw.length !== 2) fail("anomaly inventory mismatch");
  const anomalyPeriod = { start: "2026-07-21", end: "2026-07-22", timezone: "UTC" };
  const anomalies = anomaliesRaw.map((anomaly, index) => { const fid = anomalyFindingIds[index]; const suffix = fid.slice(8); if (!same(anomaly.finding, findingsRaw[index])) fail("anomaly finding alias mismatch"); return { ...anomaly, expected: decimal(anomaly.expected, `metric.${suffix}.expected`, { producer: "finops-watchdog", basis: "calculated", unit: "currency", currency: "USD", additivity: "additive", period: anomalyPeriod }), observed: decimal(anomaly.observed, `metric.${suffix}.observed`, { producer: "finops-watchdog", basis: "observed", unit: "currency", currency: "USD", additivity: "additive", period: anomalyPeriod }), impact: decimal(anomaly.impact, `metric.${suffix}.impact`, { producer: "finops-watchdog", basis: "calculated", unit: "currency", currency: "USD", additivity: "additive", period: anomalyPeriod }), percentage_change: decimal(anomaly.percentage_change, `metric.${suffix}.change-percent`, { producer: "finops-watchdog", basis: "calculated", unit: "percent", additivity: "non_additive", period: anomalyPeriod }), score: decimal(anomaly.score, `metric.${suffix}.robust-score`, { producer: "finops-watchdog", basis: "calculated", unit: "score", additivity: "non_additive", period: anomalyPeriod }) }; });
  const resilienceFindingRaw = array(view.resilience?.findings, "resilience findings"); exactInventory(resilienceFindingRaw, RESILIENCE_FINDINGS, "resilience finding"); resilienceFindingRaw.forEach((record, index) => { finding(record, RESILIENCE_FINDINGS[index]); if (!same(record, findingsRaw[index + 2])) fail("resilience finding alias mismatch"); });
  const modeledRaw = array(view.resilience?.modeled_metrics, "modeled resilience"); exactInventory(modeledRaw, MODELED_RESILIENCE, "modeled resilience");
  const modeledResilience = modeledRaw.map((record) => { const suffix = record.id.slice("metric.resilience.orders-db.".length); const unit = suffix === "effective-stored-gb" ? "GB" : suffix.endsWith("-hours") ? "hours" : "currency"; return decimal(record, record.id, { producer: "recovery-economics", basis: "estimated", unit, currency: unit === "currency" ? "USD" : null, additivity: ADDITIVE_MODELED.has(suffix) ? "additive" : "non_additive", period: { start: "2026-07-01", end: "2026-08-01", timezone: "UTC" } }); });
  const observedRaw = array(view.resilience?.observed_restore_metrics, "observed resilience"); exactInventory(observedRaw, OBSERVED_RESILIENCE, "observed resilience");
  const observedResilience = observedRaw.map((record, index) => decimal(record, OBSERVED_RESILIENCE[index], { producer: "recovery-economics", basis: "observed", unit: "hours", additivity: "non_additive", period: { start: "2026-06-15", end: "2026-06-16", timezone: "UTC" } }));
  if (view.resilience.recoverability_classification !== "not_demonstrated") fail("recoverability classification mismatch");
  const allDisplayed = [total, ...scopes, ...cloudDaily, ...cloudServices, ...cloudComparison, ...aiCostMetrics, aiDomainTotal, ...invoices, ...findings, ...anomalies.flatMap((a) => [a.expected, a.observed, a.impact, a.percentage_change, a.score]), ...modeledResilience, ...observedResilience]; unique(allDisplayed);

  const unsupportedRaw = array(view.unsupported, "unsupported registry");
  if (unsupportedRaw.length !== Object.keys(UNSUPPORTED).length) fail("unsupported registry inventory mismatch");
  const unsupported = {};
  unsupportedRaw.forEach((entry) => { if (!entry || !same(Object.keys(entry).sort(), ["concept", "explanation", "reason_code"]) || typeof entry.concept !== "string" || unsupported[entry.concept] || !(entry.concept in UNSUPPORTED) || entry.reason_code !== UNSUPPORTED[entry.concept] || typeof entry.explanation !== "string" || !entry.explanation) fail("unsupported registry mismatch"); unsupported[entry.concept] = entry; });
  if (!same(Object.keys(unsupported), Object.keys(UNSUPPORTED))) fail("unsupported registry order mismatch");

  return { schema: view.schema, identity, sourceMetadata: metadata, producers, total, reconciliation, scopes, scopeById, cloud: { total: scopes[0], daily: cloudDaily, services: cloudServices, comparison: cloudComparison }, ai: { directScope: scopes[1], domainTotal: aiDomainTotal, costMetrics: aiCostMetrics, crossDomainAdditivity: view.ai.cross_domain_additivity }, saas: { scope: scopes[2], invoices }, findings, anomalies, resilience: { classification: view.resilience.recoverability_classification, findings: resilienceFindingRaw, modeled: modeledResilience, observed: observedResilience }, opportunity: view.opportunity, unsupported };
}

function getCcac11PresentationModel(view) { return createCcac11PresentationModel(view); }

export {
  CCAC11_VIEW_SCHEMA,
  SOURCE_REPORT_SHA256,
  FINAL_MANIFEST_SHA256,
  REPORT_PROVENANCE_MANIFEST_SHA256,
  CanonicalViewError,
  createCcac11PresentationModel,
  getCcac11PresentationModel,
};
