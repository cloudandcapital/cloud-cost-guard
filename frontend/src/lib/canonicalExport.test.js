import { getCcac11PresentationModel } from "./ccac11PresentationModel";
import {
  buildCanonicalEvidencePackage,
  buildCanonicalExecutiveHtml,
  buildCanonicalExportFiles,
  downloadCanonicalExport,
  escapeHtml,
  HTML_MIME,
  JSON_MIME,
  serializeCanonicalEvidence,
} from "./canonicalExport";

describe("canonical CCAC 1.1 exports", () => {
  const model = getCcac11PresentationModel();

  test("builds deterministic files from validated presentation-model values", () => {
    const first = buildCanonicalExportFiles(model);
    const second = buildCanonicalExportFiles(model);
    expect(first).toEqual(second);
    expect(first.html.filename).toBe("cloud-cost-guard-report-tech-spend-trusted-2026-07-01-to-2026-07-22.html");
    expect(first.json.filename).toBe("cloud-cost-guard-report-tech-spend-trusted-2026-07-01-to-2026-07-22-evidence.json");
    expect(first.html.mimeType).toBe(HTML_MIME);
    expect(first.json.mimeType).toBe(JSON_MIME);
    expect(first.html.content).toBe(buildCanonicalExecutiveHtml(model));
    expect(first.json.content).toBe(serializeCanonicalEvidence(model));
  });

  test("preserves exact decimals, provenance, classifications, and unavailable states in JSON", () => {
    const evidence = JSON.parse(serializeCanonicalEvidence(model));
    expect(evidence.technology_spend.total.value).toBe("2939.0525");
    expect(evidence.technology_spend.scopes.map(({ value }) => value)).toEqual(["2194.0", "8.2825", "736.77"]);
    expect(evidence.technology_spend.reconciliation.difference).toBe("0.0");
    expect(evidence.ai.broader_domain_total.value).toBe("12.5325");
    expect(evidence.ai.broader_domain_additivity).toBe("non_additive");
    expect(evidence.saas.invoice_metrics.map(({ value }) => value)).toEqual(["8640.0", "1050.0"]);
    expect(evidence.saas.combined_invoice_total).toBeNull();
    expect(evidence.resilience.recoverability).toBe("not_demonstrated");
    expect(evidence.resilience.modeled_evidence.every(({ trace }) => trace.basis === "estimated")).toBe(true);
    expect(evidence.resilience.observed_evidence.every(({ trace }) => trace.basis === "observed")).toBe(true);
    expect(evidence.provenance.producers).toHaveLength(5);
    expect(evidence.provenance.source_metadata.approved_release_provenance.ccac.version).toBe("v0.2.0");
    expect(evidence.unavailable.map(({ concept }) => concept)).toEqual(expect.arrayContaining(["azure_canonical_data", "gcp_canonical_data", "kubernetes_cost_or_utilization", "next_month_forecast", "tagging_coverage", "combined_daily_technology_spend", "combined_invoices"]));
    expect(JSON.stringify(evidence)).not.toContain("displayValue");
    expect(JSON.stringify(evidence)).not.toContain("33479.45");
  });

  test("creates readable, escaped, inert, self-contained HTML", () => {
    const hostile = JSON.parse(JSON.stringify(getCcac11PresentationModel()));
    hostile.findings[0].title = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const html = buildCanonicalExecutiveHtml(hostile);
    expect(html).toContain("$2,939.05");
    expect(html).toContain("Exact canonical value: USD 2939.0525");
    expect(html).toContain("$12.5325");
    expect(html).toContain("Non-additive.");
    expect(html).toContain("$8,640.00");
    expect(html).toContain("$1,050.00");
    expect(html).toContain("Recoverability is not demonstrated.");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<(?:img|link|iframe|object|embed)\b/i);
    expect(html).not.toMatch(/(?:href|src)\s*=\s*["']https?:/i);
    expect(html).not.toContain("33479.45");
  });

  test("fails closed for tampered model values and produces no file", () => {
    const tampered = JSON.parse(JSON.stringify(getCcac11PresentationModel()));
    tampered.total.value = "33479.45";
    expect(() => buildCanonicalEvidencePackage(tampered)).toThrow("canonical financial boundary mismatch");
    expect(() => buildCanonicalExportFiles(null)).toThrow("validated CCAC 1.1 model is unavailable");
  });

  test("downloads complete files and revokes temporary object URLs", () => {
    jest.useFakeTimers();
    const clicked = jest.fn();
    const removed = jest.fn();
    const appended = jest.fn();
    const link = { click: clicked, remove: removed };
    const browser = {
      URL: { createObjectURL: jest.fn(() => "blob:canonical"), revokeObjectURL: jest.fn() },
      document: { createElement: jest.fn(() => link), body: { appendChild: appended } },
      setTimeout,
    };
    const file = buildCanonicalExportFiles(model).json;
    downloadCanonicalExport(file, browser);
    expect(browser.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(link.download).toBe(file.filename);
    expect(link.rel).toBe("noopener");
    expect(appended).toHaveBeenCalledWith(link);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(browser.URL.revokeObjectURL).toHaveBeenCalledWith("blob:canonical");
    jest.useRealTimers();
  });

  test("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
