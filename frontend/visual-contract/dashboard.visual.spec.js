const { test, expect } = require("@playwright/test");
const { openApprovedDashboard, waitForChartsStable } = require("./helpers");

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
      if (page.viewportSize().width < 768) await page.getByTestId("mobile-section-select").selectOption({ label: tab });
      else await page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();
      await waitForChartsStable(page);
      await expect(page).toHaveScreenshot(`${slug}-full-page.png`, { fullPage: true });
    });
  }

  test("executive summary targeted", async ({ page }) => {
    await expect(page.getByTestId("executive-summary")).toHaveScreenshot("executive-summary.png");
  });

  test("scope donut targeted", async ({ page }) => {
    await expect(page.getByTestId("scope-donut-card")).toHaveScreenshot("scope-donut.png");
  });

  test("canonical export menu open", async ({ page }) => {
    await page.getByTestId("canonical-export-trigger").click();
    await expect(page.getByTestId("canonical-export-menu")).toBeVisible();
    await expect(page).toHaveScreenshot("canonical-export-menu-open.png");
  });

  test("expanded triage targeted", async ({ page }) => {
    await page.getByRole("button", { name: "Review plan" }).click();
    await expect(page.getByTestId("triage-card")).toHaveScreenshot("triage-expanded.png");
  });

  test("finding modal targeted", async ({ page }) => {
    const methodologyButtons = page.getByRole("button", { name: "Methodology" });
    expect(await methodologyButtons.count()).toBe(10);
    await methodologyButtons.first().click();
    await expect(page.getByTestId("finding-modal")).toHaveScreenshot("finding-modal.png");
  });

  test("Lumen open targeted", async ({ page }) => {
    await page.getByTestId("lumen-trigger").click();
    const panel = page.getByTestId("lumen-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".ask-claude-footer")).toHaveText("Validated CCAC 1.1 illustrative report");
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  });
});
