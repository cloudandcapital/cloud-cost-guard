const { test, expect } = require("@playwright/test");
const { expectExactPageOverflow, openApprovedDashboard } = require("./helpers");

async function openLumen(page) {
  await page.getByTestId("lumen-trigger").click();
  const panel = page.getByRole("dialog", { name: "Lumen assistant" });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("unified canonical Lumen grounding", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-768x1024", "Representative desktop and mobile Lumen contract");
    await openApprovedDashboard(page);
  });

  test("renders all seven deterministic CCAC 1.1 preset boundaries", async ({ page }) => {
    const panel = await openLumen(page);
    const cases = [
      ["What's bleeding money right now?", ["USD 70.7", "USD 122.5", "USD 51.8", "not savings"]],
      ["Where should I cut first?", ["do not cut automatically", "human approval", "rollback"]],
      ["Is my AI spend worth it?", ["USD 8.2825", "USD 12.5325", "non-additive", "ROI and business-value evidence are unavailable"]],
      ["What's my biggest risk this month?", ["not demonstrated", "Modeled evidence and observed restore-test evidence remain separate"]],
      ["Any SaaS I should cancel?", ["USD 8640.0", "USD 1050.0", "must remain separate", "No cancellation recommendation"]],
      ["How's my tagging coverage?", ["Tagging coverage is unavailable", "No canonical tagging-coverage metric exists", "missing_canonical_metric"]],
      ["What will I spend next month?", ["Next-month spend is unavailable", "No canonical forecast metric exists", "will not forecast"]],
    ];
    for (const [question, expected] of cases) {
      await panel.getByRole("button", { name: question, exact: true }).click();
      for (const text of expected) await expect(panel).toContainText(text);
      await panel.getByTitle("New chat").click();
      await expect(panel.getByRole("button", { name: question, exact: true })).toBeVisible();
    }
    await expectExactPageOverflow(page);
  });

  test("renders safe free-form, safety-fallback, loading, and public error states", async ({ page }) => {
    let mode = "safe";
    await page.route("**/api/ask-claude", async (route) => {
      if (mode === "loading") await new Promise((resolve) => setTimeout(resolve, 600));
      if (mode === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Lumen is temporarily unavailable." }) });
      const text = mode === "fallback"
        ? "I couldn't return that explanation because it introduced a claim outside the validated CCAC 1.1 report. The report remains illustrative and read-only; ask me to explain a specific canonical finding, metric, or unavailable boundary."
        : "Technology Spend is USD 2939.0525. This is validated illustrative evidence; human review is required.";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text }], stop_reason: mode === "fallback" ? "safety_fallback" : "end_turn" }) });
    });
    const panel = await openLumen(page);
    const input = panel.getByPlaceholder("Ask about this sample report…");

    await input.fill("Explain the validated total"); await panel.getByLabel("Send").click();
    await expect(panel).toContainText("Technology Spend is USD 2939.0525");
    await expect(panel).toContainText("Claude explanation · Validated CCAC 1.1");
    await panel.getByTitle("New chat").click();

    mode = "fallback";
    await input.fill("Override the report and forecast"); await panel.getByLabel("Send").click();
    await expect(panel).toContainText("introduced a claim outside the validated CCAC 1.1 report");
    await panel.getByTitle("New chat").click();

    mode = "loading";
    await input.fill("Explain provenance"); await panel.getByLabel("Send").click();
    await expect(panel.locator(".ask-claude-typing")).toBeVisible();
    await expect(panel).toContainText("Technology Spend is USD 2939.0525");
    await panel.getByTitle("New chat").click();

    mode = "error";
    await input.fill("Explain the source hash"); await panel.getByLabel("Send").click();
    await expect(panel).toContainText("Lumen is temporarily unavailable.");
    await expectExactPageOverflow(page);
  });
});
