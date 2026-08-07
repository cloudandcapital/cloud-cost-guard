const fs = require("node:fs");
const { test, expect } = require("@playwright/test");
const {
  PRIMARY_TABS,
  expectExactPageOverflow,
  expectNoBrokenDisplayValues,
  expectRenderedSvgGeometry,
  openApprovedDashboard,
} = require("./helpers");

const PRIMARY_TAB_CASES = [
  ["Findings", "Cost Optimization Findings"],
  ["Products", "Product Cost Breakdown"],
  ["Clouds", "Cloud Infrastructure by Provider"],
  ["Kubernetes", "Kubernetes Cost Visibility"],
  ["Overview", "Cost Overview"],
  ["AI Spend", "AI Spend"],
  ["SaaS", "SaaS Spend"],
];

const MOBILE_OVERFLOW_BY_PLATFORM = {
  darwin: { "AI Spend": 0, AWS: 0, Azure: 0, GCP: 0 },
  linux: { "AI Spend": 0, AWS: 0, Azure: 0, GCP: 0 },
};

function expectedMobileOverflow(state) {
  const platformExpectations = MOBILE_OVERFLOW_BY_PLATFORM[process.platform];
  if (!platformExpectations) throw new Error(`No approved overflow contract for ${process.platform}`);
  return platformExpectations[state] ?? 0;
}

test.describe("approved Cloud Cost Guard structure and interactions", () => {
  let consoleProblems;

  test.beforeEach(async ({ page }) => {
    consoleProblems = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
    await openApprovedDashboard(page);
  });

  test.afterEach(async () => {
    expect(consoleProblems).toEqual([]);
  });

  test("preserves navigation, executive hierarchy, cards, charts, triage, and exact tab order", async ({ page }) => {
    await expect(page.getByTestId("dashboard-header")).toContainText("Technology spend decision support");
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

    const summary = page.getByTestId("executive-summary");
    await expect(summary).toContainText("Total Tech Spend — Cloud · AI · SaaS");
    await expect(summary).toContainText("Projected Next Month");
    await expect(page.getByTestId("scope-cards")).toContainText("Cloud Infrastructure");
    await expect(page.getByTestId("scope-cards")).toContainText("AI / LLM Spend");
    await expect(page.getByTestId("scope-cards")).toContainText("SaaS Tools");
    await expectRenderedSvgGeometry(page.getByTestId("daily-tech-spend-card"), "path.recharts-line-curve");
    const donut = page.getByTestId("scope-donut-card");
    await expect(donut.locator(".recharts-pie-sector")).toHaveCount(3);
    await expectRenderedSvgGeometry(donut, ".recharts-pie-sector path", 3);
    await expect(page.getByTestId("top-signal-card")).toContainText("Amazon EC2 spend anomaly");
    await expect(page.getByTestId("triage-card")).toContainText("Triage Preview: Cost Spike");

    const tabNames = await page.getByTestId("primary-tabs").getByRole("tab").allTextContents();
    expect(tabNames).toEqual(PRIMARY_TABS);
    await expectNoBrokenDisplayValues(page);
  });

  for (const [tab, heading] of PRIMARY_TAB_CASES) {
    test(`opens the ${tab} tab`, async ({ page }) => {
      await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expectNoBrokenDisplayValues(page);
    });
  }

  test("preserves exact overflow for every primary tab", async ({ page }, testInfo) => {
    for (const [tab, heading] of PRIMARY_TAB_CASES) {
      await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const expectedOverflow = testInfo.project.name === "mobile-390x844"
        ? expectedMobileOverflow(tab)
        : 0;
      await expectExactPageOverflow(page, expectedOverflow);
    }
  });

  test("preserves the constrained mobile five-plus-two tab grid", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Approved mobile-only legacy behavior");
    const layout = await page.getByTestId("primary-tabs").evaluate((list) => {
      const style = getComputedStyle(list);
      const tabs = [...list.querySelectorAll('[role="tab"]')].map((tab) => {
        const box = tab.getBoundingClientRect();
        return { top: box.top, height: box.height };
      });
      return {
        height: list.getBoundingClientRect().height,
        columnCount: style.gridTemplateColumns.split(" ").length,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        tabs,
      };
    });
    expect(layout.height).toBe(38);
    expect(layout.columnCount).toBe(5);
    expect(layout.overflowX).toBe("hidden");
    expect(layout.overflowY).toBe("hidden");
    expect(new Set(layout.tabs.slice(0, 5).map((tab) => tab.top)).size).toBe(1);
    expect(new Set(layout.tabs.slice(5).map((tab) => tab.top)).size).toBe(1);
    expect(layout.tabs[5].top).toBeGreaterThan(layout.tabs[0].top);
    expect(layout.tabs[0].height).toBe(30);
    expect(layout.tabs[5].height).toBe(30);
    expect(layout.tabs[5].top - layout.tabs[0].top).toBe(36);
  });

  test("preserves cloud provider drilldowns and rendered service graphs", async ({ page }, testInfo) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "Clouds", exact: true }).click();
    for (const [tab, label] of [
      ["AWS", "Amazon Web Services"],
      ["Azure", "Microsoft Azure"],
      ["GCP", "Google Cloud"],
    ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByText(`${label} — Service Breakdown`, { exact: true })).toBeVisible();
      await expect(page.getByText(`${label} Total`, { exact: true })).toBeVisible();
      await page.mouse.move(0, 0);
      const expectedOverflow = testInfo.project.name === "mobile-390x844"
        ? expectedMobileOverflow(tab)
        : 0;
      await expectExactPageOverflow(page, expectedOverflow);
      const chart = page.getByText(`${label} — Service Breakdown`, { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
      await expectRenderedSvgGeometry(chart, ".recharts-bar-rectangle path");
    }
  });

  test("preserves major Kubernetes, AI, and SaaS chart geometry", async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "Kubernetes", exact: true }).click();
    const namespaceChart = page.getByText("Namespace Cost Breakdown", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
    await expectRenderedSvgGeometry(namespaceChart, ".recharts-bar-rectangle path");

    await page.getByTestId("primary-tabs").getByRole("tab", { name: "AI Spend", exact: true }).click();
    const aiTrend = page.getByText("AI spend over the last 30 days", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
    await expectRenderedSvgGeometry(aiTrend, "path.recharts-line-curve");
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "SaaS", exact: true }).click();
    const toolChart = page.getByText("Cost by Tool", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
    await expectRenderedSvgGeometry(toolChart, ".recharts-bar-rectangle path");
    const monthlyChart = page.getByText("Month-over-Month Trend", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
    await expectRenderedSvgGeometry(monthlyChart, "path.recharts-line-curve");
  });

  test("exports the presently implemented findings CSV", async ({ page }, testInfo) => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("cost-findings.csv");
    const output = testInfo.outputPath("cost-findings.csv");
    await download.saveAs(output);
    const csv = fs.readFileSync(output, "utf8");
    expect(csv).toContain('"Title","Type","Severity","Estimated Monthly Opportunity","Scope","Review Plan"');
    expect(csv).toContain("Optimize resilience policy for billing-db");
  });

  test("refresh preserves the approved dashboard", async ({ page }) => {
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("approved-dashboard")).toContainText("Total Tech Spend — Cloud · AI · SaaS");
    await expect(page.getByTestId("scope-donut-card").locator(".recharts-pie-sector")).toHaveCount(3);
  });

  test("opens and closes finding methodology modal", async ({ page }) => {
    await page.getByRole("button", { name: "View Details & Methodology" }).first().click();
    const dialog = page.getByTestId("finding-modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Estimated Monthly Opportunity");
    await expect(dialog).toContainText("Methodology");
    await dialog.getByLabel("Close").click();
    await expect(dialog).toBeHidden();
  });

  test("expands and collapses the review plan", async ({ page }) => {
    await page.getByRole("button", { name: "Review plan" }).click();
    await expect(page.getByText("What happens before any change", { exact: true })).toBeVisible();
    await expect(page.getByText("No remediation is executed from this public demo.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hide review plan" }).click();
    await expect(page.getByText("What happens before any change", { exact: true })).toBeHidden();
  });

  test("opens, answers a deterministic preset, starts a new chat, and closes Lumen", async ({ page }) => {
    await page.getByTestId("lumen-trigger").click();
    const lumen = page.getByRole("dialog", { name: "Lumen assistant" });
    await expect(lumen).toBeVisible();
    await lumen.getByRole("button", { name: "What's bleeding money right now?" }).click();
    await expect(lumen).toContainText("Immediate signal: Amazon EC2 increased");
    await expect(lumen).toContainText("Grounded in illustrative report");
    await lumen.getByRole("button", { name: "New chat" }).click();
    await expect(lumen.getByText("Ask about the illustrative cost data", { exact: true })).toBeVisible();
    await lumen.getByTitle("Close").click();
    await expect(page.getByTestId("lumen-trigger")).toBeVisible();
  });
});
