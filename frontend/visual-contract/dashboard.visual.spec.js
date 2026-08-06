const { test, expect } = require("@playwright/test");
const { openApprovedDashboard } = require("./helpers");

const TAB_CASES = [
  ["findings", "Findings"],
  ["products", "Products"],
  ["clouds", "Clouds"],
  ["kubernetes", "Kubernetes"],
  ["overview", "Overview"],
  ["ai-spend", "AI Spend"],
  ["saas", "SaaS"],
];

test.describe("approved visual contract", () => {
  test.beforeEach(async ({ page }) => openApprovedDashboard(page));

  for (const [slug, tab] of TAB_CASES) {
    test(`${tab} full-page`, async ({ page }) => {
      await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(1800);
      await expect(page).toHaveScreenshot(`${slug}-full-page.png`, { fullPage: true });
    });
  }

  test("executive summary targeted", async ({ page }) => {
    await expect(page.getByTestId("executive-summary")).toHaveScreenshot("executive-summary.png");
  });

  test("scope donut targeted", async ({ page }) => {
    await expect(page.getByTestId("scope-donut-card")).toHaveScreenshot("scope-donut.png");
  });

  test("expanded triage targeted", async ({ page }) => {
    await page.getByRole("button", { name: "Review plan" }).click();
    await expect(page.getByTestId("triage-card")).toHaveScreenshot("triage-expanded.png");
  });

  test("finding modal targeted", async ({ page }) => {
    await page.getByRole("button", { name: "View Details & Methodology" }).first().click();
    await expect(page.getByTestId("finding-modal")).toHaveScreenshot("finding-modal.png");
  });

  test("Lumen open targeted", async ({ page }) => {
    await page.getByTestId("lumen-trigger").click();
    await expect(page.getByTestId("lumen-panel")).toHaveScreenshot("lumen-open.png");
  });
});
