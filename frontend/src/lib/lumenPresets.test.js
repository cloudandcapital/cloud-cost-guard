import report from "../data/report.json";
import { buildPresetLumenResponse, getLumenFooterLabel, SAMPLE_QUESTIONS } from "./lumenPresets";

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value));

describe("grounded Lumen preset responses", () => {
  const responses = Object.fromEntries(SAMPLE_QUESTIONS.map((question) => [
    question,
    buildPresetLumenResponse(question, report),
  ]));

  test("covers all seven exact built-in questions and leaves free-form questions to Claude", () => {
    expect(SAMPLE_QUESTIONS).toHaveLength(7);
    expect(Object.values(responses).every(Boolean)).toBe(true);
    expect(buildPresetLumenResponse("Explain the EC2 command", report)).toBeNull();
    expect(buildPresetLumenResponse("What’s bleeding money right now?", report)).toBe(responses[SAMPLE_QUESTIONS[0]]);
  });

  test("labels preset and Claude responses accurately", () => {
    expect(getLumenFooterLabel([{ role: "assistant", source: "preset" }])).toBe("Grounded in illustrative report");
    expect(getLumenFooterLabel([{ role: "assistant", source: "claude" }])).toBe("Illustrative analysis · Powered by Claude");
  });

  test.each(SAMPLE_QUESTIONS)("%s uses safe user-facing language", (question) => {
    const response = responses[question];
    expect(response).not.toMatch(/confirmed waste|realized savings|very_high|AmazonEC2|2026-07-28|\$1,210/i);
    expect(response).not.toMatch(/\|.*\|/);
  });

  test("bleeding-money and risk answers use the canonical anomaly", () => {
    for (const question of [SAMPLE_QUESTIONS[0], SAMPLE_QUESTIONS[3]]) {
      expect(responses[question]).toContain("Amazon EC2");
      expect(responses[question]).toContain(money(report.anomalies.recent[0].current));
      expect(responses[question]).toContain("July 28, 2026");
    }
  });

  test("cut-first answer uses the canonical EBS amount and display confidence", () => {
    const ebs = report.opportunity_catalog.find((entry) => entry.id === "opp-aws-ebs-unattached");
    expect(responses[SAMPLE_QUESTIONS[1]]).toContain(money(ebs.estimated_monthly_amount));
    expect(responses[SAMPLE_QUESTIONS[1]]).toContain("Very high confidence");
  });

  test("AI answer states that ROI and business-value data are unavailable", () => {
    expect(responses[SAMPLE_QUESTIONS[2]]).toContain(money(report.ai_spend.total_cost));
    expect(responses[SAMPLE_QUESTIONS[2]]).toMatch(/ROI and business-value data are unavailable/i);
  });

  test("SaaS answer uses canonical seats and allocated license opportunity", () => {
    const opportunity = report.opportunity_catalog.find((entry) => entry.id === report.saas_spend.opportunity_id);
    expect(responses[SAMPLE_QUESTIONS[4]]).toContain(`${report.saas_spend.total_unused_licenses} seats`);
    expect(responses[SAMPLE_QUESTIONS[4]]).toContain(`${money(opportunity.estimated_monthly_amount)} per month`);
    expect(responses[SAMPLE_QUESTIONS[4]]).toMatch(/does not support canceling an entire tool/i);
  });

  test("tagging answer treats canonical untagged spend as unattributed cost", () => {
    expect(responses[SAMPLE_QUESTIONS[5]]).toContain(money(report.tagging.untagged_monthly_cost));
    expect(responses[SAMPLE_QUESTIONS[5]]).toMatch(/unattributed cost/i);
  });

  test("forecast answer uses only canonical combined-spend values", () => {
    expect(responses[SAMPLE_QUESTIONS[6]]).toContain(money(report.combined_spend.projected_next_month));
    expect(responses[SAMPLE_QUESTIONS[6]]).toContain(money(report.combined_spend.total_cost));
  });
});
