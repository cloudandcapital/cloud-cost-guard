import { getCcac11PresentationModel } from "./ccac11PresentationModel";
import {
  buildCanonicalEvidencePackage,
  buildCanonicalExecutiveHtml,
  buildCanonicalExportFiles,
  downloadCanonicalExport,
  escapeHtml,
  formatCurrencyString,
  HTML_MIME,
  JSON_MIME,
  serializeCanonicalEvidence,
} from "./canonicalExport";

describe("canonical CCAC 1.1 exports", () => {
  const model = getCcac11PresentationModel();

  test("builds deterministic files from a freshly selected validated presentation model", () => {
    const first = buildCanonicalExportFiles(model);
    const second = buildCanonicalExportFiles();
    expect(first).toEqual(second);
    expect(first.html.filename).toBe("cloud-cost-guard-report-tech-spend-trusted-2026-07-01-to-2026-07-22.html");
    expect(first.json.filename).toBe("cloud-cost-guard-report-tech-spend-trusted-2026-07-01-to-2026-07-22-evidence.json");
    expect(first.html.mimeType).toBe(HTML_MIME);
    expect(first.json.mimeType).toBe(JSON_MIME);
    expect(first.html.content).toBe(buildCanonicalExecutiveHtml());
    expect(first.json.content).toBe(serializeCanonicalEvidence());
  });

  test("preserves exact decimals, provenance, classifications, and distinct unavailable states in JSON", () => {
    const evidence = JSON.parse(serializeCanonicalEvidence());
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
    expect(evidence.canonical_unsupported.map(({ concept }) => concept)).toEqual(expect.arrayContaining(["kubernetes_cost_or_utilization", "next_month_forecast", "tagging_coverage", "combined_daily_technology_spend"]));
    expect(evidence.presentation_unavailable.map(({ concept }) => concept)).toEqual(["azure_canonical_data", "gcp_canonical_data", "combined_invoices"]);
    expect(evidence).not.toHaveProperty("unavailable");
    expect(JSON.stringify(evidence)).not.toContain("displayValue");
    expect(JSON.stringify(evidence)).not.toContain("33479.45");
  });

  test("creates readable, inert, self-contained HTML from the fresh canonical model", () => {
    const html = buildCanonicalExecutiveHtml();
    expect(html).toContain("$2,939.05");
    expect(html).toContain("Exact canonical value: USD 2939.0525");
    expect(html).toContain("$12.5325");
    expect(html).toContain("Non-additive.");
    expect(html).toContain("$8,640.00");
    expect(html).toContain("$1,050.00");
    expect(html).toContain("Recoverability is not demonstrated.");
    expect(html).toContain("Canonical unsupported");
    expect(html).toContain("Presentation unavailable");
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<(?:img|link|iframe|object|embed)\b/i);
    expect(html).not.toMatch(/(?:href|src)\s*=\s*["']https?:/i);
    expect(html).not.toContain("33479.45");
  });

  test.each([
    ["finding title", (candidate) => { candidate.findings[0].title = "Tampered title"; }],
    ["finding context", (candidate) => { candidate.findings[0].context = "Tampered context"; }],
    ["finding evidence", (candidate) => { candidate.findings[0].evidence_ids[0] = "evidence.tampered"; }],
    ["finding producer", (candidate) => { candidate.findings[0].producer.name = "tampered-producer"; }],
    ["producer artifact hash", (candidate) => { candidate.producers[0].source.artifact_sha256 = "0".repeat(64); }],
    ["producer commit", (candidate) => { candidate.sourceMetadata.approved_release_provenance.producer_commits["ai-cost-lens"] = "0".repeat(40); }],
    ["unsupported explanation", (candidate) => { candidate.unsupported.tagging_coverage.explanation = "Tampered explanation"; }],
    ["opportunity evidence", (candidate) => { candidate.opportunity.source.evidence_ids[0] = "evidence.tampered"; }],
    ["resilience classification", (candidate) => { candidate.resilience.classification = "demonstrated"; }],
    ["resilience trace", (candidate) => { candidate.resilience.modeled[0].trace.basis = "observed"; }],
    ["report identity", (candidate) => { candidate.identity.report_id = "report.tampered"; }],
    ["generation time", (candidate) => { candidate.identity.generated_at = "2099-01-01T00:00:00Z"; }],
  ])("fails closed for tampered %s before creating a file or starting a download", (_label, mutate) => {
    const tampered = JSON.parse(JSON.stringify(model));
    mutate(tampered);
    const download = jest.fn();
    expect(() => {
      const files = buildCanonicalExportFiles(tampered);
      download(files.json);
    }).toThrow("presentation model integrity mismatch");
    expect(download).not.toHaveBeenCalled();
    expect(() => buildCanonicalEvidencePackage(tampered)).toThrow("presentation model integrity mismatch");
    expect(() => buildCanonicalExecutiveHtml(tampered)).toThrow("presentation model integrity mismatch");
  });

  test("fails closed when a non-canonical model is supplied", () => {
    expect(() => buildCanonicalExportFiles(null)).toThrow("presentation model integrity mismatch");
  });

  test("formats canonical decimal strings without binary floating-point conversion", () => {
    expect(formatCurrencyString("2939.0525")).toBe("$2,939.05");
    expect(formatCurrencyString("2194.0")).toBe("$2,194.00");
    expect(formatCurrencyString("8.2825", 4)).toBe("$8.2825");
    expect(formatCurrencyString("736.77")).toBe("$736.77");
    expect(formatCurrencyString("12.5325", 4)).toBe("$12.5325");
    expect(formatCurrencyString("8640.0")).toBe("$8,640.00");
    expect(formatCurrencyString("1050.0")).toBe("$1,050.00");
    expect(formatCurrencyString("1.005")).toBe("$1.01");
    expect(formatCurrencyString("9007199254740993.995")).toBe("$9,007,199,254,740,994.00");
    expect(() => formatCurrencyString(2939.0525)).toThrow("invalid decimal formatting input");
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
    const file = buildCanonicalExportFiles().json;
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

  test("escapes every HTML-significant character in isolation", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
    expect(escapeHtml('<img src=x onerror="alert(1)"><script>alert(2)</script>')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;");
  });
});
