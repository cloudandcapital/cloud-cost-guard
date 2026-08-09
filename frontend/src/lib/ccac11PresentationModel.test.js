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
});
