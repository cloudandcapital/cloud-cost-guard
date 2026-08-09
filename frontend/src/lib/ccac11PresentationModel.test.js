import generatedView from "../data/ccac-dashboard-view-v1.1.generated.json";
import fs from "fs";
import path from "path";
import {
  CanonicalViewError,
  createCcac11PresentationModel,
  getCcac11PresentationModel,
} from "./ccac11PresentationModel";

const clone = () => JSON.parse(JSON.stringify(generatedView));

describe("CCAC 1.1 React presentation model", () => {
  test("keeps the visible dashboard on the canonical view without legacy financial imports", () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, "../App.js"), "utf8");
    expect(appSource).toContain('from "./lib/ccac11PresentationModel"');
    expect(appSource).not.toMatch(/getCloudCapitalReport|getIllustrativeSpendScenario|ccac-dashboard-view\.generated\.json/);
    expect(appSource).not.toMatch(/73%|27%|avoidable run rate|monthly opportunity/i);
  });

  test("uses the published total and exact reconciliation scope identities", () => {
    const model = getCcac11PresentationModel();
    expect(model.total).toMatchObject({ id: "metric.tech-spend.total", value: "2939.0525" });
    expect(model.scopes.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "metric.tech-spend.scope.cloud", value: "2194.0" },
      { id: "metric.tech-spend.scope.direct_ai", value: "8.2825" },
      { id: "metric.tech-spend.scope.saas", value: "736.77" },
    ]);
    expect(model.reconciliation.input_metric_ids).toEqual(model.scopes.map(({ id }) => id));
    expect(model.reconciliation).toMatchObject({ status: "passed", difference: "0.0" });
  });

  test("keeps provider-billed AI non-additive and separate from direct AI", () => {
    const model = getCcac11PresentationModel();
    expect(model.ai.directScope.value).toBe("8.2825");
    expect(model.ai.domainTotal.value).toBe("12.5325");
    expect(model.ai.domainTotal.trace.additivity).toBe("non_additive");
    expect(model.ai.costMetrics.some((metric) => metric.dimensions.billing_channel === "cloud_provider_billing")).toBe(true);
  });

  test("keeps incompatible SaaS invoices separate from the canonical scope", () => {
    const model = getCcac11PresentationModel();
    expect(model.saas.scope.value).toBe("736.77");
    expect(model.saas.invoices.map(({ value }) => value)).toEqual(["8640.0", "1050.0"]);
    expect(generatedView.saas.combined_invoice_total).toBeNull();
  });

  test("preserves canonical finding identity, evidence, and resilience classification", () => {
    const model = getCcac11PresentationModel();
    expect(model.findings).toHaveLength(10);
    expect(model.findings.every((finding) => finding.id === finding.trace.canonical_id)).toBe(true);
    expect(model.findings.every((finding) => finding.evidence_ids.length > 0)).toBe(true);
    expect(model.resilience.classification).toBe("not_demonstrated");
    expect(model.resilience.modeled.every((metric) => metric.trace.basis === "estimated")).toBe(true);
    expect(model.resilience.observed.every((metric) => metric.trace.basis === "observed")).toBe(true);
  });

  test("exposes unsupported areas without substituting zero", () => {
    const model = getCcac11PresentationModel();
    expect(model.unsupported.next_month_forecast.reason_code).toBe("missing_canonical_metric");
    expect(model.unsupported.tagging_coverage.reason_code).toBe("missing_canonical_metric");
    expect(model.unsupported.kubernetes_cost_or_utilization.reason_code).toBe("missing_canonical_metric");
    expect(model.opportunity.annual_aggregate).toBeNull();
  });

  test.each([
    ["schema", (view) => { view.schema = "legacy"; }],
    ["mode", (view) => { view.identity.mode = "live"; }],
    ["status", (view) => { view.identity.status = "partial"; }],
    ["report hash", (view) => { view.identity.source_report_sha256 = "0".repeat(64); }],
    ["manifest hash", (view) => { view.source_metadata.final_manifest_sha256 = "0".repeat(64); }],
    ["reconciliation", (view) => { view.technology_spend.reconciliation.status = "failed"; }],
    ["missing scope", (view) => { view.technology_spend.scopes.pop(); }],
    ["scope identity", (view) => { view.technology_spend.scopes[0].id = "metric.fake"; }],
    ["malformed value", (view) => { view.technology_spend.total.value = "NaN"; }],
    ["negative value", (view) => { view.technology_spend.total.value = "-1"; }],
    ["invoice sum", (view) => { view.saas.combined_invoice_total = "9690.0"; }],
  ])("fails closed for invalid %s without legacy fallback", (_label, mutate) => {
    const view = clone();
    mutate(view);
    expect(() => createCcac11PresentationModel(view)).toThrow(CanonicalViewError);
  });

  const producerNames = ["ai-cost-lens", "finops-lite", "finops-watchdog", "recovery-economics", "saas-cost-analyzer"];
  test.each([
    ...producerNames.map((name) => [`${name} commit`, (view) => { view.source_metadata.approved_release_provenance.producer_commits[name] = "0".repeat(40); }]),
    ...producerNames.map((name) => [`${name} artifact hash`, (view) => { view.source_metadata.artifact_sha256s[name] = "0".repeat(64); }]),
    ["producer name", (view) => { view.producers[0].name = "substituted-producer"; }],
    ["producer version", (view) => { view.producers[0].version = "9.9.9"; }],
    ["contract identity", (view) => { view.identity.contract = "ccac/1.0.0"; }],
    ["report identity", (view) => { view.identity.report_id = "report.substituted"; }],
    ["reporting period", (view) => { view.identity.report_period.end = "2026-07-23"; }],
    ["catalog count", (view) => { view.source_metadata.catalog_counts.metrics += 1; }],
    ["cloud daily ID", (view) => { view.cloud.daily[0].id = "metric.cloud.day.substituted.cost"; view.cloud.daily[0].trace.canonical_id = view.cloud.daily[0].id; }],
    ["cloud service ID", (view) => { view.cloud.services[0].id = "metric.cloud.service.substituted.cost"; view.cloud.services[0].trace.canonical_id = view.cloud.services[0].id; }],
    ["cloud comparison ID", (view) => { view.cloud.comparison[0].id = "metric.cloud.substituted"; view.cloud.comparison[0].trace.canonical_id = view.cloud.comparison[0].id; }],
    ["AI metric ID", (view) => { view.ai.metrics[0].id = "metric.ai.substituted"; view.ai.metrics[0].trace.canonical_id = view.ai.metrics[0].id; }],
    ["SaaS invoice ID", (view) => { view.saas.invoice_metrics[0].id = "metric.saas.substituted.invoice-cost"; view.saas.invoice_metrics[0].trace.canonical_id = view.saas.invoice_metrics[0].id; }],
    ["SaaS invoice period", (view) => { view.saas.invoice_metrics[0].trace.period.end = "2026-12-02"; }],
    ["finding ID", (view) => { view.findings[7].id = "finding.allocation.substituted"; view.findings[7].trace.canonical_id = view.findings[7].id; }],
    ["anomaly finding ID", (view) => { view.anomalies[0].finding.id = "finding.anomaly.substituted"; view.anomalies[0].finding.trace.canonical_id = view.anomalies[0].finding.id; }],
    ["anomaly metric ID", (view) => { view.anomalies[0].impact.id = "metric.anomaly.substituted.impact"; view.anomalies[0].impact.trace.canonical_id = view.anomalies[0].impact.id; }],
    ["resilience finding ID", (view) => { view.resilience.findings[0].id = "finding.resilience-gap.substituted"; view.resilience.findings[0].trace.canonical_id = view.resilience.findings[0].id; }],
    ["resilience metric ID", (view) => { view.resilience.modeled_metrics[0].id = "metric.resilience.substituted"; view.resilience.modeled_metrics[0].trace.canonical_id = view.resilience.modeled_metrics[0].id; }],
    ["duplicate ID across collections", (view) => { view.cloud.services[0].id = view.cloud.daily[0].id; view.cloud.services[0].trace.canonical_id = view.cloud.daily[0].id; }],
    ["Cloud alias value", (view) => { view.cloud.total.value = "1.0"; }],
    ["Cloud alias trace", (view) => { view.cloud.total.trace.basis = "estimated"; }],
    ["SaaS alias value", (view) => { view.saas.canonical_scope_total.value = "1.0"; }],
    ["SaaS alias trace", (view) => { view.saas.canonical_scope_total.trace.source_artifact = "substituted.json"; }],
    ["missing unsupported concept", (view) => { view.unsupported.pop(); }],
    ["duplicate unsupported concept", (view) => { view.unsupported[1].concept = view.unsupported[0].concept; }],
    ["extra unsupported concept", (view) => { view.unsupported.push({ concept: "extra", reason_code: "missing_canonical_metric", explanation: "extra" }); }],
    ["unsupported reason code", (view) => { view.unsupported[0].reason_code = "changed"; }],
  ])("fails closed for integrity mutation: %s", (_label, mutate) => {
    const view = clone();
    mutate(view);
    expect(() => createCcac11PresentationModel(view)).toThrow(CanonicalViewError);
  });
});
