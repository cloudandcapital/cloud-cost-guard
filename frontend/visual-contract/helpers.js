const { expect, test } = require("@playwright/test");
const crypto = require('node:crypto');
const path = require('node:path');

// Preserve a reviewable image when a CI-only browser has no approved baseline.
// The assertion still fails; no baseline is accepted or changed automatically.
async function captureVisual(locator, name, options = {}) {
  try { await expect(locator).toHaveScreenshot(name, options); }
  catch (error) {
    if (process.env.CCG_EXPORT_VISUAL_EVIDENCE === 'true') {
      const bytes = await locator.screenshot({ animations: 'disabled', caret: 'hide', ...options });
      const info = test.info();
      const target = path.relative(process.cwd(), info.snapshotPath(name)).replaceAll(path.sep, '/');
      const data = bytes.toString('base64');
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');
      console.log(`CCG_VISUAL_META ${JSON.stringify({ target, sha, parts: Math.ceil(data.length / 12000) })}`);
      for (let part = 0; part * 12000 < data.length; part += 1) console.log(`CCG_VISUAL_CHUNK ${JSON.stringify({ target, sha, part, data: data.slice(part * 12000, (part + 1) * 12000) })}`);
    }
    throw error;
  }
}

const PRIMARY_TABS = ["Findings", "Products", "Clouds", "Kubernetes", "Overview", "AI Spend", "SaaS"];

async function expectExactPageOverflow(page, expectedOverflow = 0) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBe(metrics.clientWidth + expectedOverflow);
  return metrics;
}

async function expectRenderedSvgGeometry(container, pathSelector, minimumPathCount = 1) {
  const svg = container.locator("svg.recharts-surface");
  await expect(svg).toBeVisible();
  const svgBox = await svg.boundingBox();
  expect(svgBox).not.toBeNull();
  expect(svgBox.width).toBeGreaterThan(0);
  expect(svgBox.height).toBeGreaterThan(0);

  const paths = container.locator(pathSelector);
  await expect(paths.first()).toBeVisible();
  expect(await paths.count()).toBeGreaterThanOrEqual(minimumPathCount);
  await expect.poll(async () => paths.evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBBox();
    const d = element.getAttribute("d") || "";
    return d.trim() !== "" && box.width > 0 && box.height > 0;
  }).length)).toBeGreaterThanOrEqual(minimumPathCount);
}

async function expectDashboardFonts(page) {
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loadedFaces = [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replaceAll('"', ""));
    return {
      loadedFaces,
      interAvailable: document.fonts.check("400 16px Inter"),
      playfairAvailable: document.fonts.check('700 16px "Playfair Display"'),
      bodyFamily: getComputedStyle(document.body).fontFamily,
      brandFamily: getComputedStyle(document.querySelector(".brand-title")).fontFamily,
    };
  });
  expect(fonts.loadedFaces).toContain("Inter");
  expect(fonts.loadedFaces).toContain("Playfair Display");
  expect(fonts.interAvailable).toBe(true);
  expect(fonts.playfairAvailable).toBe(true);
  expect(fonts.bodyFamily.split(",")[0].trim()).toBe("Inter");
  expect(fonts.brandFamily.split(",")[0].trim().replaceAll('"', "")).toBe("Playfair Display");
}

async function waitForChartsStable(page) {
  let previousSignature = "";
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const signature = await page.locator("svg.recharts-surface path[d]")
      .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") || "").join("\n"));
    if (signature && signature === previousSignature) {
      stableSamples += 1;
      if (stableSamples >= 3) return;
    } else {
      stableSamples = 0;
      previousSignature = signature;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Recharts path geometry did not stabilize before capture");
}

async function openApprovedDashboard(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try an example", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cloud+ Cost Guard" })).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await expectDashboardFonts(page);
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
  // when CSS animation is disabled. Require three identical path samples so a
  // partial animation frame cannot become an approved baseline.
  await waitForChartsStable(page);
}

async function expectNoBrokenDisplayValues(page) {
  const body = await page.locator("body").innerText();
  for (const forbidden of ["undefined", "NaN", "Infinity", "[object Object]"]) {
    expect(body).not.toContain(forbidden);
  }
}

module.exports = {
  captureVisual,
  PRIMARY_TABS,
  expectDashboardFonts,
  expectExactPageOverflow,
  expectNoBrokenDisplayValues,
  expectRenderedSvgGeometry,
  openApprovedDashboard,
  waitForChartsStable,
};
