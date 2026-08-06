const fs = require("node:fs");
const { test, expect } = require("@playwright/test");
const { PRIMARY_TABS, openApprovedDashboard, expectNoBrokenDisplayValues } = require("./helpers");

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
    await expect(page.getByTestId("daily-tech-spend-card").locator("svg.recharts-surface")).toHaveCount(1);
    await expect(page.getByTestId("scope-donut-card").locator("svg.recharts-surface")).toHaveCount(1);
    await expect(page.getByTestId("scope-donut-card").locator(".recharts-pie-sector")).toHaveCount(3);
    await expect(page.getByTestId("top-signal-card")).toContainText("Amazon EC2 spend anomaly");
    await expect(page.getByTestId("triage-card")).toContainText("Triage Preview: Cost Spike");

    const tabNames = await page.getByTestId("primary-tabs").getByRole("tab").allTextContents();
    expect(tabNames).toEqual(PRIMARY_TABS);
    const viewportMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(viewportMetrics.clientWidth);
    await expectNoBrokenDisplayValues(page);
  });

  for (const [tab, heading] of [
    ["Findings", "Cost Optimization Findings"],
    ["Products", "Product Cost Breakdown"],
    ["Clouds", "Cloud Infrastructure by Provider"],
    ["Kubernetes", "Kubernetes Cost Visibility"],
    ["Overview", "Cost Overview"],
    ["AI Spend", "AI Spend"],
    ["SaaS", "SaaS Spend"],
  ]) {
    test(`opens the ${tab} tab`, async ({ page }) => {
      await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expectNoBrokenDisplayValues(page);
    });
  }

  test("preserves cloud provider drilldowns and rendered service graphs", async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "Clouds", exact: true }).click();
    for (const [tab, label] of [["AWS", "Amazon Web Services"], ["Azure", "Microsoft Azure"], ["GCP", "Google Cloud"]]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByText(`${label} — Service Breakdown`, { exact: true })).toBeVisible();
      await expect(page.getByText(`${label} Total`, { exact: true })).toBeVisible();
    }
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
