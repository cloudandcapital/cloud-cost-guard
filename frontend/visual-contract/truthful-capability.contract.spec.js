const { test, expect } = require("@playwright/test");
const {
  expectExactPageOverflow,
  expectNoBrokenDisplayValues,
  expectRenderedSvgGeometry,
  openApprovedDashboard,
} = require("./helpers");

const EXACT_DISCLOSURE =
  "Illustrative sample billing data. No customer accounts, credentials, or production resources are connected.";
const REFRESH_DISCLOSURE =
  "Refresh reloads the tracked sample report; it does not sync cloud accounts.";
const LUMEN_DISCLOSURE =
  "Grounded only in this illustrative report; Lumen cannot access customer accounts or external resources.";

test.describe("truthful public capability claims", () => {
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

  test("shows the exact disclosure without interaction or overflow", async ({ page }) => {
    const disclosure = page.getByTestId("capability-disclosure");
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText(EXACT_DISCLOSURE);
    await expect(disclosure).toContainText(REFRESH_DISCLOSURE);
    await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
    const geometry = await disclosure.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    await expectExactPageOverflow(page);
    await expectNoBrokenDisplayValues(page);
  });

  test("keeps provider views explicitly sample-only with complete chart geometry", async ({ page }) => {
    await page.getByTestId("primary-tabs").getByRole("tab", { name: "Clouds", exact: true }).click();
    await expect(page.getByTestId("capability-disclosure")).toContainText(EXACT_DISCLOSURE);
    for (const [provider, label] of [["AWS", "Amazon Web Services"], ["Azure", "Microsoft Azure"], ["GCP", "Google Cloud"]]) {
      await page.getByRole("tab", { name: provider, exact: true }).click();
      await expect(page.getByText(`${label} — Service Breakdown`, { exact: true })).toBeVisible();
      const chart = page.getByText(`${label} — Service Breakdown`, { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]');
      await expectRenderedSvgGeometry(chart, ".recharts-bar-rectangle path");
      await expectExactPageOverflow(page);
    }
    const copy = await page.locator("body").innerText();
    expect(copy).not.toMatch(/connected (AWS|Azure|GCP|cloud) account/i);
    await expectNoBrokenDisplayValues(page);
  });

  test("states Lumen grounding and preserves refresh behavior", async ({ page }) => {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByTestId("capability-disclosure")).toContainText(REFRESH_DISCLOSURE);
    await page.getByTestId("lumen-trigger").click();
    const lumen = page.getByRole("dialog", { name: "Lumen assistant" });
    await expect(lumen).toBeVisible();
    await expect(lumen).toContainText(LUMEN_DISCLOSURE);
    await expect(lumen.getByPlaceholder("Ask about this sample report…", { exact: true })).toBeVisible();
    await expectExactPageOverflow(page);
    await expectNoBrokenDisplayValues(page);
  });
});
