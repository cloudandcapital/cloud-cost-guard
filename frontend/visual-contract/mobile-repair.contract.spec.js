const { test, expect } = require("@playwright/test");
const {
  expectExactPageOverflow,
  expectNoBrokenDisplayValues,
  expectRenderedSvgGeometry,
  openApprovedDashboard,
  waitForChartsStable,
} = require("./helpers");

test.describe("mobile overflow repair", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Mobile-only repair contract");
    await openApprovedDashboard(page);
  });

  test("repairs AI model layout without removing chart, legend, values, or table", async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "AI Spend", exact: true }).click();
    await waitForChartsStable(page);
    await expectExactPageOverflow(page);
    const breakdown = page.locator(".ai-model-breakdown");
    await breakdown.scrollIntoViewIfNeeded();
    await expect(breakdown).toContainText("Cost by Model");
    await expect(breakdown).toContainText("gpt-4o");
    await expect(breakdown).toContainText("$512.30");
    await expectRenderedSvgGeometry(breakdown, ".recharts-pie-sector path", 5);
    await expect(page.getByText("Top Models by Cost", { exact: true })).toBeVisible();
  });

  test("wraps Azure and GCP investigation commands without losing provider content", async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "Clouds", exact: true }).click();
    for (const [provider, label] of [["AWS", "Amazon Web Services"], ["Azure", "Microsoft Azure"], ["GCP", "Google Cloud"]]) {
      await page.getByRole("tab", { name: provider, exact: true }).click();
      await expect(page.getByText(`${label} — Service Breakdown`, { exact: true })).toBeVisible();
      await expect(page.locator(".finding-command").first()).toBeVisible();
      await expectExactPageOverflow(page);
      const chart = page.getByText(`${label} — Service Breakdown`, { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
      await expectRenderedSvgGeometry(chart, ".recharts-bar-rectangle path");
      await expectNoBrokenDisplayValues(page);
    }
  });
});
