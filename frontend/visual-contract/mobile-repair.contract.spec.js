const { test, expect } = require("@playwright/test");
const { expectExactPageOverflow, expectNoBrokenDisplayValues, openApprovedDashboard } = require("./helpers");

test.describe("mobile canonical cutover", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Mobile-only contract");
    await openApprovedDashboard(page);
  });

  test("keeps direct and broader AI boundaries readable without overflow", async ({ page }) => {
    await page.getByTestId("mobile-section-select").selectOption({ label: "AI Spend" });
    const aiPanel = page.getByRole("tabpanel", { name: "AI Spend" });
    await expect(aiPanel.getByText("$8.2825", { exact: true })).toBeVisible();
    await expect(aiPanel.getByText("$12.5325", { exact: true })).toBeVisible();
    await expect(page.getByText("Supported model/provider cost metrics", { exact: true })).toBeVisible();
    await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
  });

  test("keeps provider navigation usable with honest unavailable states", async ({ page }) => {
    await page.getByTestId("mobile-section-select").selectOption({ label: "Clouds" });
    for (const provider of ["AWS", "AZURE", "GCP"]) {
      await page.getByRole("button", { name: provider, exact: true }).click();
      if (provider !== "AWS") await expect(page.getByText(`No ${provider} ingestion is represented in this trusted report.`, { exact: true })).toBeVisible();
      await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
    }
  });

  test("keeps Lumen clear of sticky navigation and critical review controls", async ({ page }) => {
    const lumen = page.getByTestId("lumen-trigger");
    const selector = page.getByTestId("mobile-section-select");
    const reviewPlan = page.getByRole("button", { name: "Review plan" });
    const methodologyButtons = page.getByRole("button", { name: "Methodology" });
    expect(await methodologyButtons.count()).toBe(10);

    for (const control of [selector, reviewPlan, methodologyButtons.first()]) {
      await control.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const overlaps = await page.evaluate(() => {
        const trigger = document.querySelector('[data-testid="lumen-trigger"]')?.getBoundingClientRect();
        const candidates = [
          document.querySelector('[data-testid="mobile-section-select"]'),
          [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Review plan"),
          [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Methodology")),
        ].filter(Boolean).map((element) => element.getBoundingClientRect());
        if (!trigger) return true;
        return candidates.some((box) => trigger.left < box.right && trigger.right > box.left && trigger.top < box.bottom && trigger.bottom > box.top);
      });
      expect(overlaps).toBe(false);
      await expectExactPageOverflow(page);
    }
  });
});
