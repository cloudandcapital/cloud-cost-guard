const { test, expect } = require("@playwright/test");
const { expectExactPageOverflow, expectNoBrokenDisplayValues, openApprovedDashboard } = require("./helpers");

const DISCLOSURE = "Validated CCAC 1.1 illustrative report. No customer accounts, credentials, or production resources are connected.";
const REFRESH = "Refresh reloads the tracked canonical view; it does not sync cloud accounts.";

test.describe("truthful canonical capability claims", () => {
  let consoleProblems;
  test.beforeEach(async ({ page }) => {
    consoleProblems = []; page.on("console", (m) => { if (["warning","error"].includes(m.type())) consoleProblems.push(m.text()); }); page.on("pageerror", (e) => consoleProblems.push(e.message));
    await openApprovedDashboard(page);
  });
  test.afterEach(async () => expect(consoleProblems).toEqual([]));

  test("states the exact source and refresh boundary without overflow", async ({ page }) => {
    const disclosure = page.getByTestId("capability-disclosure");
    await expect(disclosure).toContainText(DISCLOSURE); await expect(disclosure).toContainText(REFRESH);
    await expect(disclosure).toContainText("Lumen explains this same validated CCAC 1.1 illustrative report");
    await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
  });

  test("does not fabricate provider data", async ({ page }) => {
    if (page.viewportSize().width < 768) await page.getByTestId("mobile-section-select").selectOption({ label: "Clouds" });
    else await page.getByRole("tab", { name: "Clouds", exact: true }).click();
    for (const provider of ["AZURE", "GCP"]) {
      await page.getByRole("button", { name: provider, exact: true }).click();
      await expect(page.getByText(`No ${provider} ingestion is represented in this trusted report.`, { exact: true })).toBeVisible();
    }
    await expectNoBrokenDisplayValues(page); await expectExactPageOverflow(page);
  });

  test("preserves Refresh and the unified canonical Lumen boundary", async ({ page }) => {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByTestId("capability-disclosure")).toContainText(REFRESH);
    await page.getByTestId("lumen-trigger").click();
    await expect(page.getByRole("dialog", { name: "Lumen assistant" })).toContainText("Lumen explains the validated CCAC 1.1 illustrative report");
    await expectExactPageOverflow(page); await expectNoBrokenDisplayValues(page);
  });
});
