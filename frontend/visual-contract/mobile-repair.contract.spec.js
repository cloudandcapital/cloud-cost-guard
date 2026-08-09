const { test, expect } = require("@playwright/test");
const { expectExactPageOverflow, expectNoBrokenDisplayValues, openApprovedDashboard } = require("./helpers");

test.describe("mobile canonical cutover", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Mobile-only contract");
    await openApprovedDashboard(page);
  });

  test("keeps direct and broader AI boundaries readable without overflow", async ({ page }) => {
    await page.getByRole("tab", { name: "AI Spend", exact: true }).click();
    const aiPanel = page.getByRole("tabpanel", { name: "AI Spend" });
    await expect(aiPanel.getByText("$8.2825", { exact: true })).toBeVisible();
    await expect(aiPanel.getByText("$12.5325", { exact: true })).toBeVisible();
    await expect(page.getByText("Supported model/provider cost metrics", { exact: true })).toBeVisible();
    await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
  });

  test("keeps provider navigation usable with honest unavailable states", async ({ page }) => {
    await page.getByRole("tab", { name: "Clouds", exact: true }).click();
    for (const provider of ["AWS", "AZURE", "GCP"]) {
      await page.getByRole("button", { name: provider, exact: true }).click();
      if (provider !== "AWS") await expect(page.getByText(`No ${provider} ingestion is represented in this trusted report.`, { exact: true })).toBeVisible();
      await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
    }
  });
});
