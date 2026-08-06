const { expect } = require("@playwright/test");

const PRIMARY_TABS = ["Findings", "Products", "Clouds", "Kubernetes", "Overview", "AI Spend", "SaaS"];

async function openApprovedDashboard(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cloud+ Cost Guard" })).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await expect(page.locator(".recharts-responsive-container")).toHaveCount(2);
  // Recharts performs JavaScript-driven drawing after fonts/layout settle even
  // when CSS animation is disabled. This wait captures the completed chart.
  await page.waitForTimeout(1800);
}

async function expectNoBrokenDisplayValues(page) {
  const body = await page.locator("body").innerText();
  for (const forbidden of ["undefined", "NaN", "Infinity", "[object Object]"]) {
    expect(body).not.toContain(forbidden);
  }
}

module.exports = { PRIMARY_TABS, openApprovedDashboard, expectNoBrokenDisplayValues };
