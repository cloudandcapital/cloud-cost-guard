import report from "../data/report.json";
import {
  buildProductComparisons,
  formatProductChange,
  getOpportunity,
  getOpportunityAggregate,
  formatUtcReportDate,
} from "./reportTrust";

const sum = (values) => Number(values.reduce((total, value) => total + value, 0).toFixed(2));

describe("product comparisons", () => {
  const products = buildProductComparisons(report.cost_baseline.top_services);

  test("current and prior products reconcile to canonical cloud totals", () => {
    expect(sum(products.map((product) => product.amount_usd))).toBe(report.cost_baseline.total_cost);
    expect(sum(products.map((product) => product.prior_period_cost))).toBe(report.cost_baseline.trend.previous_period_cost);
    expect(sum(products.map((product) => product.amount_usd - product.prior_period_cost))).toBe(report.cost_baseline.trend.change_amount);
    expect(Number((((report.cost_baseline.total_cost / report.cost_baseline.trend.previous_period_cost) - 1) * 100).toFixed(2)))
      .toBe(report.cost_baseline.trend.change_percentage);
  });

  test("contains increases, decreases, and stable categories with matching labels", () => {
    expect(products.some((product) => product.change_percentage > 5)).toBe(true);
    expect(products.some((product) => product.change_percentage < 0)).toBe(true);
    expect(products.some((product) => Math.abs(product.change_percentage) <= 2)).toBe(true);
    expect(formatProductChange(12)).toBe("+12.0%");
    expect(formatProductChange(-3)).toBe("-3.0%");
    expect(formatProductChange(null)).toBe("Not available");
  });
});

test("formats a daily anomaly as a date without an artificial time", () => {
  expect(formatUtcReportDate("2026-07-28T00:00:00Z")).toBe("Jul 28, 2026");
  expect(formatUtcReportDate("invalid")).toBe("Unknown date");
});

describe("canonical opportunity taxonomy", () => {
  test.each(report.opportunity_aggregates)("$id reconciles without implicit additions", (aggregate) => {
    const entries = aggregate.opportunity_ids.map((id) => getOpportunity(report, id));
    expect(entries.every(Boolean)).toBe(true);
    expect(sum(entries.map((entry) => entry.estimated_monthly_amount))).toBe(aggregate.estimated_monthly_amount);
    expect(entries.every((entry) => entry.included_in_aggregates.includes(aggregate.id))).toBe(true);
  });

  test("displayed source objects point to catalog entries", () => {
    const cloudFindings = Object.values(report.clouds).flatMap((cloud) => cloud.findings);
    expect(cloudFindings.every((finding) => getOpportunity(report, finding.opportunity_id)?.estimated_monthly_amount === finding.monthly_savings_usd_est)).toBe(true);
    expect(getOpportunity(report, report.kubernetes.opportunity_id)?.estimated_monthly_amount).toBe(report.kubernetes.overprovisioning_waste_est);
    expect(getOpportunity(report, report.saas_spend.opportunity_id)?.estimated_monthly_amount).toBe(report.saas_spend.estimated_waste);
    expect(getOpportunityAggregate(report, "agg-resilience-modeled")?.estimated_monthly_amount).toBe(281.60);
    expect(getOpportunityAggregate(report, "agg-resilience-modeled")).toMatchObject({
      label: "Modeled Resilience Opportunity",
      opportunity_ids: ["opp-resilience-billing-db", "opp-resilience-orders-api"],
    });
    expect(getOpportunityAggregate(report, "agg-aws-estimated")).toMatchObject({
      label: "Estimated AWS Opportunity",
      estimated_monthly_amount: 474.00,
    });
    expect(getOpportunity(report, report.kubernetes.opportunity_id)?.label).toBe("Estimated Over-provisioning Opportunity");
    expect(report.tagging.savings_eligible).toBe(false);
    expect(report.tagging.amount_type).toBe("unattributed_cost");
  });
});
