const fs = require("node:fs");
const crypto = require("node:crypto");
const { test, expect } = require("@playwright/test");
const { expectExactPageOverflow, openApprovedDashboard } = require("./helpers");

const base = "cloud-cost-guard-report-tech-spend-trusted-2026-07-01-to-2026-07-22";
const expected = {
  html: { filename: `${base}.html`, testId: "canonical-export-html" },
  json: { filename: `${base}-evidence.json`, testId: "canonical-export-json" },
};

async function downloadExport(page, testInfo, kind, suffix = "") {
  await page.getByTestId("canonical-export-trigger").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(expected[kind].testId).click(),
  ]);
  expect(download.suggestedFilename()).toBe(expected[kind].filename);
  const path = testInfo.outputPath(`${kind}${suffix}-${expected[kind].filename}`);
  await download.saveAs(path);
  return { bytes: fs.readFileSync(path), filename: expected[kind].filename };
}

test.describe("canonical CCAC 1.1 client-side downloads", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-768x1024", "Representative desktop and mobile download contract");
    await openApprovedDashboard(page);
  });

  test("downloads and inspects deterministic HTML and JSON evidence", async ({ page }, testInfo) => {
    const html = await downloadExport(page, testInfo, "html");
    const json = await downloadExport(page, testInfo, "json");
    const repeatedJson = await downloadExport(page, testInfo, "json", "-repeat");
    expect(Buffer.compare(json.bytes, repeatedJson.bytes)).toBe(0);

    const htmlText = html.bytes.toString("utf8");
    expect(htmlText).toContain("Exact canonical value: USD 2939.0525");
    expect(htmlText).toContain("$2,194.00");
    expect(htmlText).toContain("$8.2825");
    expect(htmlText).toContain("$736.77");
    expect(htmlText).toContain("$12.5325");
    expect(htmlText).toContain("Recoverability is not demonstrated.");
    expect(htmlText).toContain("$8,640.00");
    expect(htmlText).toContain("$1,050.00");
    expect(htmlText).not.toMatch(/<script\b/i);
    expect(htmlText).not.toMatch(/<(?:img|link|iframe|object|embed)\b/i);
    expect(htmlText).not.toMatch(/(?:href|src)\s*=\s*["']https?:/i);

    const evidence = JSON.parse(json.bytes.toString("utf8"));
    expect(evidence.technology_spend.total.value).toBe("2939.0525");
    expect(evidence.technology_spend.scopes.map(({ value }) => value)).toEqual(["2194.0", "8.2825", "736.77"]);
    expect(evidence.ai.broader_domain_additivity).toBe("non_additive");
    expect(evidence.ai.broader_domain_total.value).toBe("12.5325");
    expect(evidence.saas.invoice_metrics.map(({ value }) => value)).toEqual(["8640.0", "1050.0"]);
    expect(evidence.saas.combined_invoice_total).toBeNull();
    expect(evidence.resilience.recoverability).toBe("not_demonstrated");
    expect(evidence.provenance.producers).toHaveLength(5);
    expect(evidence.canonical_unsupported.map(({ concept }) => concept)).toEqual(expect.arrayContaining(["kubernetes_cost_or_utilization", "next_month_forecast", "tagging_coverage", "combined_daily_technology_spend"]));
    expect(evidence.presentation_unavailable.map(({ concept }) => concept)).toEqual(["azure_canonical_data", "gcp_canonical_data", "combined_invoices"]);
    expect(evidence).not.toHaveProperty("unavailable");
    expect(json.bytes.toString("utf8")).not.toContain("33479.45");
    expect(await expectExactPageOverflow(page)).toEqual(expect.objectContaining({ scrollWidth: expect.any(Number) }));

    testInfo.annotations.push(
      { type: "export", description: `${html.filename} · ${html.bytes.length} bytes · sha256:${crypto.createHash("sha256").update(html.bytes).digest("hex")}` },
      { type: "export", description: `${json.filename} · ${json.bytes.length} bytes · sha256:${crypto.createHash("sha256").update(json.bytes).digest("hex")}` },
    );
  });

  test("supports keyboard opening and focus navigation", async ({ page }) => {
    const trigger = page.getByTestId("canonical-export-trigger");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("canonical-export-menu")).toBeVisible();
    await expect(page.getByTestId("canonical-export-html")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("canonical-export-json")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});
