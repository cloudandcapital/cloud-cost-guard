const { test, expect } = require("@playwright/test");
const { PRIMARY_TABS, expectExactPageOverflow, expectNoBrokenDisplayValues, expectRenderedSvgGeometry, openApprovedDashboard } = require("./helpers");

const TAB_CASES = [
  ["Findings", "Canonical Findings"], ["Products", "Cloud Services"], ["Clouds", "AWS Cloud scope"],
  ["Kubernetes", "Kubernetes cost and utilization"], ["Overview", "Reconciliation"],
  ["AI Spend", "Canonical direct-AI scope"], ["SaaS", "Canonical SaaS scope"],
];

test.describe("canonical CCAC 1.1 dashboard structure and interactions", () => {
  let consoleProblems;
  test.beforeEach(async ({ page }) => {
    consoleProblems = [];
    page.on("console", (message) => { if (["warning", "error"].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`); });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    await openApprovedDashboard(page);
  });
  test.afterEach(async () => expect(consoleProblems).toEqual([]));

  test("uses canonical values, preserves navigation, and renders the trusted donut", async ({ page }) => {
    await expect(page.getByTestId("dashboard-header")).toContainText("Canonical technology spend decision support");
    await expect(page.getByTestId("canonical-export-disabled")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    const summary = page.getByTestId("executive-summary");
    await expect(summary).toContainText("$2,939.0525");
    await expect(summary).toContainText("$2,194.00");
    await expect(summary).toContainText("$8.2825");
    await expect(summary).toContainText("$736.77");
    await expect(summary).toContainText("Not available in this illustrative report");
    const donut = page.getByTestId("scope-donut-card");
    await expect(donut.locator(".recharts-pie-sector")).toHaveCount(3);
    await expectRenderedSvgGeometry(donut, ".recharts-pie-sector path", 3);
    expect(await page.getByTestId("primary-tabs").getByRole("tab").allTextContents()).toEqual(PRIMARY_TABS);
    await expectNoBrokenDisplayValues(page);
  });

  for (const [tab, text] of TAB_CASES) test(`opens the ${tab} tab`, async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    await expectNoBrokenDisplayValues(page);
  });

  test("preserves zero overflow for every primary tab", async ({ page }) => {
    for (const [tab] of TAB_CASES) {
      await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await expectExactPageOverflow(page, 0);
    }
  });

  test("preserves the constrained mobile five-plus-two tab grid", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Approved mobile-only behavior");
    const layout = await page.getByTestId("primary-tabs").evaluate((list) => ({
      height: list.getBoundingClientRect().height,
      columns: getComputedStyle(list).gridTemplateColumns.split(" ").length,
      tops: [...list.querySelectorAll('[role="tab"]')].map((tab) => tab.getBoundingClientRect().top),
    }));
    expect(layout.height).toBe(38); expect(layout.columns).toBe(5);
    expect(new Set(layout.tops.slice(0, 5)).size).toBe(1); expect(new Set(layout.tops.slice(5)).size).toBe(1);
  });

  test("shows AWS canonical charts and honest Azure/GCP unavailable states", async ({ page }) => {
    await page.getByRole("tab", { name: "Clouds", exact: true }).click();
    await expectRenderedSvgGeometry(page.getByText("Canonical daily Cloud spend").locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]'), "path.recharts-line-curve");
    for (const provider of ["AZURE", "GCP"]) {
      await page.getByRole("button", { name: provider, exact: true }).click();
      await expect(page.getByText(`No ${provider} ingestion is represented in this trusted report.`, { exact: true })).toBeVisible();
      await expectExactPageOverflow(page);
    }
  });

  test("keeps Kubernetes unavailable and AI/SaaS boundaries explicit", async ({ page }) => {
    await page.getByRole("tab", { name: "Kubernetes", exact: true }).click();
    await expect(page.getByText("No canonical Kubernetes metric exists.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "AI Spend", exact: true }).click();
    await expect(page.getByText("Non-additive; includes provider-billed AI already represented in Cloud", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "SaaS", exact: true }).click();
    await expect(page.getByText("$8,640.00", { exact: true })).toBeVisible();
    await expect(page.getByText("$1,050.00", { exact: true })).toBeVisible();
  });

  test("prevents legacy export", async ({ page }) => {
    await expect(page.getByTestId("canonical-export-disabled")).toBeDisabled();
    await expect(page.getByTestId("canonical-export-disabled")).toHaveAttribute("title", "Canonical export support is a separate roadmap phase");
  });

  test("refresh reloads only the canonical view", async ({ page }) => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("approved-dashboard")).toHaveAttribute("data-view-schema", "ccg-dashboard-view/1.1.0");
    await expect(page.getByTestId("executive-summary")).toContainText("$2,939.0525");
  });

  test("opens and closes canonical finding methodology", async ({ page }) => {
    await page.getByRole("button", { name: "View Details & Methodology" }).first().click();
    const dialog = page.getByTestId("finding-modal"); await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Canonical context"); await expect(dialog).toContainText("Evidence");
    await dialog.getByLabel("Close").click(); await expect(dialog).toBeHidden();
  });

  test("expands and collapses the truthful review plan", async ({ page }) => {
    await page.getByRole("button", { name: "Review plan" }).click();
    await expect(page.getByText("Validate the observed condition without treating anomaly impact as savings.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hide review plan" }).click();
  });

  test("keeps Lumen visibly isolated on its existing grounding", async ({ page }) => {
    await page.getByTestId("lumen-trigger").click();
    const lumen = page.getByRole("dialog", { name: "Lumen assistant" }); await expect(lumen).toBeVisible();
    await expect(lumen).toContainText("Grounded only in this illustrative report");
    await lumen.getByTitle("Close").click();
  });
});
