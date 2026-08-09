const { test, expect } = require("@playwright/test");
const { PRIMARY_TABS, expectExactPageOverflow, expectNoBrokenDisplayValues, expectRenderedSvgGeometry, openApprovedDashboard } = require("./helpers");

const TAB_CASES = [
  ["Findings", "Canonical Findings"], ["Products", "Cloud Services"], ["Clouds", "AWS Cloud scope"],
  ["Kubernetes", "Kubernetes cost and utilization"], ["Overview", "Reconciliation"],
  ["AI Spend", "Canonical direct-AI scope"], ["SaaS", "Canonical SaaS scope"],
];
const modelFindingCount = 10;
const openTab = async (page, tab) => page.viewportSize().width < 768
  ? page.getByTestId("mobile-section-select").selectOption({ label: tab })
  : page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true }).click();

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
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
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
    const navigationLabels = page.viewportSize().width < 768
      ? await page.getByTestId("mobile-section-select").locator("option").allTextContents()
      : await page.getByTestId("primary-tabs").getByRole("tab").allTextContents();
    expect(navigationLabels).toEqual(PRIMARY_TABS);
    await expectNoBrokenDisplayValues(page);
  });

  for (const [tab, text] of TAB_CASES) test(`opens the ${tab} tab`, async ({ page }) => {
    await openTab(page, tab);
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    await expectNoBrokenDisplayValues(page);
  });

  test("preserves zero overflow for every primary tab", async ({ page }) => {
    for (const [tab] of TAB_CASES) {
      await openTab(page, tab);
      await expectExactPageOverflow(page, 0);
    }
  });

  test("pins desktop and tablet navigation to the viewport top without obscuring content", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-390x844", "Desktop and tablet sticky-navigation contract");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const shell = page.locator(".tab-shell");
    await shell.evaluate((element) => window.scrollTo({ top: element.offsetTop + 1, behavior: "auto" }));
    await expect.poll(async () => shell.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0);
    const shellBox = await shell.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { bottom: box.bottom, top: box.top };
    });
    const activePanelBox = await page.getByRole("tabpanel", { name: "Findings" }).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top };
    });
    expect(shellBox.top).toBe(0);
    expect(activePanelBox.top).toBeGreaterThanOrEqual(shellBox.bottom);

    for (const [tab, expectedText] of TAB_CASES) {
      if (tab !== "Findings") {
        const trigger = page.getByTestId("primary-tabs").getByRole("tab", { name: tab, exact: true });
        await trigger.evaluate((element) => element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
        await expect(trigger).toHaveAttribute("data-state", "active");
      }
      await expect(page.getByText(expectedText, { exact: true }).first()).toBeVisible();
      await expectExactPageOverflow(page, 0);
    }
  });

  test("keeps all mobile destinations discoverable in a labeled selector", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390x844", "Approved mobile-only behavior");
    const selector = page.getByTestId("mobile-section-select");
    await expect(selector).toBeVisible();
    expect(await selector.locator("option").allTextContents()).toEqual(PRIMARY_TABS);
    for (const [tab] of TAB_CASES) {
      await selector.selectOption({ label: tab });
      await expect(selector).toHaveValue(tab.toLowerCase().replace(" ", "-"));
    }
  });

  test("shows AWS canonical charts and honest Azure/GCP unavailable states", async ({ page }) => {
    await openTab(page, "Clouds");
    await expectRenderedSvgGeometry(page.getByText("Canonical daily Cloud spend").locator('xpath=ancestor::div[contains(@class,"kpi-card")][1]'), "path.recharts-line-curve");
    for (const provider of ["AZURE", "GCP"]) {
      await page.getByRole("button", { name: provider, exact: true }).click();
      await expect(page.getByText(`No ${provider} ingestion is represented in this trusted report.`, { exact: true })).toBeVisible();
      await expectExactPageOverflow(page);
    }
  });

  test("keeps Kubernetes unavailable and AI/SaaS boundaries explicit", async ({ page }) => {
    await openTab(page, "Kubernetes");
    await expect(page.getByText("No canonical Kubernetes metric exists.", { exact: true })).toBeVisible();
    await openTab(page, "AI Spend");
    await expect(page.getByText("Non-additive; includes provider-billed AI already represented in Cloud", { exact: true })).toBeVisible();
    await openTab(page, "SaaS");
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
    const methodologyButtons = page.getByRole("button", { name: "Methodology" });
    expect(await methodologyButtons.count()).toBe(modelFindingCount);
    await methodologyButtons.first().click();
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
