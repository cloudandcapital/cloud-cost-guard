const { expect } = require("@playwright/test");

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
      jostAvailable: document.fonts.check("400 16px Jost"),
      cormorantAvailable: document.fonts.check('400 16px "Cormorant Garamond"'),
      bodyFamily: getComputedStyle(document.body).fontFamily,
      brandFamily: getComputedStyle(document.querySelector(".brand-title")).fontFamily,
      totalFamily: getComputedStyle(document.querySelector(".hero-total")).fontFamily,
      exactFamily: getComputedStyle(document.querySelector(".exact-value")).fontFamily,
      displayFamilies: [...document.querySelectorAll(".font-brand-serif")].map((element) => getComputedStyle(element).fontFamily),
    };
  });
  expect(fonts.loadedFaces).toContain("Jost");
  expect(fonts.loadedFaces).toContain("Cormorant Garamond");
  expect(fonts.jostAvailable).toBe(true);
  expect(fonts.cormorantAvailable).toBe(true);
  expect(fonts.bodyFamily.split(",")[0].trim()).toBe("Jost");
  expect(fonts.brandFamily.split(",")[0].trim().replaceAll('"', "")).toBe("Cormorant Garamond");
  expect(fonts.totalFamily.split(",")[0].trim().replaceAll('"', "")).toBe("Cormorant Garamond");
  expect(fonts.exactFamily.split(",")[0].trim()).toBe("Jost");
  for (const family of fonts.displayFamilies) {
    expect(family.split(",")[0].trim().replaceAll('"', "")).toBe("Cormorant Garamond");
  }
}

async function waitForChartsStable(page) {
  let previousSignature = "";
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const sample = await page.locator("svg.recharts-surface").evaluateAll((surfaces) => ({
      signature: surfaces.map((surface) => surface.outerHTML).join("\n"),
      barsReady: surfaces.every((surface) => [...surface.querySelectorAll(".recharts-bar")].every((bar) =>
        [...bar.querySelectorAll(".recharts-bar-rectangle path, .recharts-bar-rectangle rect")].some((shape) => {
          const box = shape.getBBox();
          return box.width > 0 && box.height > 0;
        }))),
    }));
    const { signature } = sample;
    if (sample.barsReady && signature && signature === previousSignature) {
      stableSamples += 1;
      if (stableSamples >= 5) return;
    } else {
      stableSamples = 0;
      previousSignature = signature;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Recharts SVG geometry did not stabilize before capture");
}

async function openApprovedDashboard(page) {
  await page.goto("/");
  await page.getByText("What can I upload?", {exact:true}).click();
  await page.getByRole("button", { name: "See the full technology spend demo", exact: true }).click();
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
  // Recharts finishes drawing after fonts/layout settle. Require nonzero bars
  // and five identical SVG samples before approving a baseline.
  await waitForChartsStable(page);
  await expectRenderedSvgGeometry(page.getByTestId("top-signal-card"), ".recharts-bar-rectangle path", 3);
}

async function expectNoBrokenDisplayValues(page) {
  const body = await page.locator("body").innerText();
  for (const forbidden of ["undefined", "NaN", "Infinity", "[object Object]"]) {
    expect(body).not.toContain(forbidden);
  }
}

module.exports = {
  PRIMARY_TABS,
  expectDashboardFonts,
  expectExactPageOverflow,
  expectNoBrokenDisplayValues,
  expectRenderedSvgGeometry,
  openApprovedDashboard,
  waitForChartsStable,
};
