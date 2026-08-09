import generatedView from "../data/ccac-dashboard-view-v1.1.generated.json";
import { buildCanonicalLumenContext } from "./lumenContext";
import { buildPresetLumenResponse, getLumenFooterLabel, SAMPLE_QUESTIONS } from "./lumenPresets";

describe("validated CCAC 1.1 Lumen preset responses", () => {
  const context = buildCanonicalLumenContext();
  const responses = Object.fromEntries(SAMPLE_QUESTIONS.map((question) => [question, buildPresetLumenResponse(question)]));

  test("covers all seven exact built-in questions deterministically and leaves free-form questions to Claude", () => {
    expect(SAMPLE_QUESTIONS).toHaveLength(7);
    expect(Object.values(responses).every(Boolean)).toBe(true);
    expect(buildPresetLumenResponse("Explain the EC2 evidence")).toBeNull();
    expect(buildPresetLumenResponse("What’s bleeding money right now?")).toBe(responses[SAMPLE_QUESTIONS[0]]);
  });

  test("labels deterministic and Claude responses accurately", () => {
    expect(getLumenFooterLabel([{ role: "assistant", source: "preset" }])).toBe("Deterministic · Validated CCAC 1.1");
    expect(getLumenFooterLabel([{ role: "assistant", source: "claude" }])).toBe("Claude explanation · Validated CCAC 1.1");
  });

  test.each(SAMPLE_QUESTIONS)("%s contains no legacy or unsafe capability language", (question) => {
    expect(responses[question]).not.toMatch(/33,479|33479|1,210|2790|tagged spend|untagged spend|unused licenses|confirmed waste|realized savings|very_high|2026-07-28/i);
    expect(responses[question]).not.toMatch(/\|.*\|/);
  });

  test("bleeding-money answer uses exact canonical anomaly evidence and classification", () => {
    const response = responses[SAMPLE_QUESTIONS[0]];
    expect(response).toContain("USD 70.7");
    expect(response).toContain("USD 122.5");
    expect(response).toContain("USD 51.8");
    expect(response).toMatch(/not savings/i);
    expect(response).toMatch(/not a proven root cause/i);
  });

  test("cut-first answer prioritizes review without inventing a cut", () => {
    const response = responses[SAMPLE_QUESTIONS[1]];
    expect(response).toMatch(/do not cut automatically/i);
    expect(response).toMatch(/does not publish a verified-savings amount/i);
    expect(response).toMatch(/ownership|human approval|rollback|verify/i);
  });

  test("AI answer keeps direct and broader non-additive AI distinct", () => {
    const response = responses[SAMPLE_QUESTIONS[2]];
    expect(response).toContain("USD 8.2825");
    expect(response).toContain("USD 12.5325");
    expect(response).toMatch(/explicitly non-additive/i);
    expect(response).toMatch(/ROI and business-value evidence are unavailable/i);
  });

  test("risk answer does not claim demonstrated recoverability", () => {
    const response = responses[SAMPLE_QUESTIONS[3]];
    expect(response).toMatch(/modeled evidence and observed restore-test evidence remain separate/i);
    expect(response).toMatch(/Recoverability is \*\*not demonstrated\*\*/i);
  });

  test("SaaS answer keeps partial evidence and incompatible invoice periods separate", () => {
    const response = responses[SAMPLE_QUESTIONS[4]];
    expect(response).toContain("USD 8640.0");
    expect(response).toContain("USD 1050.0");
    expect(response).toMatch(/incompatible periods|must remain separate|Do not combine/i);
    expect(response).toMatch(/partial quality/i);
    expect(response).toMatch(/No cancellation recommendation/i);
  });

  test("tagging and forecast answers use validated unsupported declarations", () => {
    expect(responses[SAMPLE_QUESTIONS[5]]).toContain(context.canonical_unsupported.find(({ concept }) => concept === "tagging_coverage").explanation);
    expect(responses[SAMPLE_QUESTIONS[5]]).toContain("missing_canonical_metric");
    expect(responses[SAMPLE_QUESTIONS[6]]).toContain(context.canonical_unsupported.find(({ concept }) => concept === "next_month_forecast").explanation);
    expect(responses[SAMPLE_QUESTIONS[6]]).toMatch(/will not forecast, extrapolate, annualize/i);
  });

  test("tampered CCAC input fails before preset generation", () => {
    const tampered = JSON.parse(JSON.stringify(generatedView));
    tampered.identity.report_id = "report.tampered";
    expect(() => buildPresetLumenResponse(SAMPLE_QUESTIONS[0], tampered)).toThrow(/report identity mismatch/i);
  });
});
