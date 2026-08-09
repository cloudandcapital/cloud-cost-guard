const EXPORT_SCHEMA = "cloud-cost-guard/canonical-evidence-package/1.0.0";
const HTML_MIME = "text/html;charset=utf-8";
const JSON_MIME = "application/json;charset=utf-8";

const exactValues = {
  ai: "12.5325",
  cloud: "2194.0",
  directAi: "8.2825",
  reconciliation: "0.0",
  saas: "736.77",
  total: "2939.0525",
};

const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {})
    : value;

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (key !== "displayValue") result[key] = canonical(value[key]);
    return result;
  }, {});
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const money = (value, digits = 2) => `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const period = ({ start, end, timezone }) => `${start} through ${end} · half-open · ${timezone}`;
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const ensureExportModel = (model) => {
  if (!model || model.schema !== "ccg-dashboard-view/1.1.0" || model.identity?.contract !== "ccac/1.1.0" || model.identity?.mode !== "illustrative" || model.identity?.status !== "complete") throw new Error("Canonical export generation failed closed: validated CCAC 1.1 model is unavailable");
  if (model.total?.value !== exactValues.total || model.cloud?.total?.value !== exactValues.cloud || model.ai?.directScope?.value !== exactValues.directAi || model.saas?.scope?.value !== exactValues.saas || model.ai?.domainTotal?.value !== exactValues.ai || model.reconciliation?.difference !== exactValues.reconciliation || model.reconciliation?.status !== "passed") throw new Error("Canonical export generation failed closed: canonical financial boundary mismatch");
  if (model.ai.crossDomainAdditivity !== "non_additive" || model.resilience?.classification !== "not_demonstrated" || model.saas?.invoices?.map(({ value }) => value).join("|") !== "8640.0|1050.0") throw new Error("Canonical export generation failed closed: canonical classification boundary mismatch");
  if (!Array.isArray(model.producers) || model.producers.length !== 5 || !Array.isArray(model.findings) || model.findings.length !== 10 || !model.sourceMetadata || !model.unsupported) throw new Error("Canonical export generation failed closed: canonical provenance inventory mismatch");
};

const unavailableRegistry = (model) => [
  ...Object.values(model.unsupported).map(canonical),
  { concept: "azure_canonical_data", explanation: "No Azure ingestion is represented in this trusted report.", reason_code: "not_represented_in_validated_report" },
  { concept: "gcp_canonical_data", explanation: "No GCP ingestion is represented in this trusted report.", reason_code: "not_represented_in_validated_report" },
  { concept: "combined_invoices", explanation: "Annual and quarterly invoice records cover incompatible periods; no canonical combined invoice metric exists.", reason_code: "missing_canonical_metric" },
];

export function buildCanonicalEvidencePackage(model) {
  ensureExportModel(model);
  return stable({
    schema: EXPORT_SCHEMA,
    identity: canonical(model.identity),
    disclosures: [
      "Illustrative data only; no customer systems, accounts, credentials, or production resources are connected.",
      "This package was generated client-side from the validated CCAC 1.1 presentation model and was not uploaded or transmitted.",
      "Technology Spend contains only the additive Cloud, direct AI, and SaaS canonical scopes.",
      "Lumen remains separately grounded and is not a source for this export.",
    ],
    provenance: {
      view_schema: model.schema,
      contract: model.identity.contract,
      report_id: model.identity.report_id,
      run_id: model.identity.run_id,
      generated_at: model.identity.generated_at,
      source_report_sha256: model.identity.source_report_sha256,
      source_metadata: canonical(model.sourceMetadata),
      producers: canonical(model.producers),
    },
    technology_spend: {
      total: canonical(model.total),
      scopes: canonical(model.scopes),
      reconciliation: canonical(model.reconciliation),
      scope_definitions: [
        { scope: "cloud", definition: "Additive canonical Cloud scope; provider-billed native AI is already included." },
        { scope: "direct_ai", definition: "Additive direct-vendor AI billing only; excludes provider-billed native AI represented in Cloud." },
        { scope: "saas", definition: "Additive same-period allocated SaaS scope." },
      ],
    },
    cloud: { provider: "aws", total: canonical(model.cloud.total), daily: canonical(model.cloud.daily), services: canonical(model.cloud.services), comparison: canonical(model.cloud.comparison) },
    ai: { direct_scope: canonical(model.ai.directScope), broader_domain_total: canonical(model.ai.domainTotal), broader_domain_additivity: model.ai.crossDomainAdditivity, cost_metrics: canonical(model.ai.costMetrics) },
    saas: { canonical_scope: canonical(model.saas.scope), invoice_metrics: canonical(model.saas.invoices), combined_invoice_total: null, boundary: "Annual and quarterly invoices cover incompatible periods and are not added together or added to the canonical SaaS scope." },
    findings: canonical(model.findings),
    anomalies: canonical(model.anomalies),
    resilience: { recoverability: model.resilience.classification, statement: "Recoverability is not demonstrated.", modeled_evidence: canonical(model.resilience.modeled), observed_evidence: canonical(model.resilience.observed), findings: canonical(model.resilience.findings) },
    opportunity: canonical(model.opportunity),
    unavailable: unavailableRegistry(model),
  });
}

export function serializeCanonicalEvidence(model) {
  return `${JSON.stringify(buildCanonicalEvidencePackage(model), null, 2)}\n`;
}

const traceHtml = (record) => {
  const trace = record.trace || {};
  return `<dl class="trace"><div><dt>Canonical ID</dt><dd>${escapeHtml(trace.canonical_id || record.id)}</dd></div><div><dt>Producer</dt><dd>${escapeHtml(trace.producer?.name || record.producer?.name)} ${escapeHtml(trace.producer?.version || record.producer?.version)}</dd></div><div><dt>Quality</dt><dd>${escapeHtml(trace.quality || record.quality)}</dd></div><div><dt>Evidence</dt><dd>${escapeHtml((trace.evidence_ids || record.evidence_ids || []).join(", "))}</dd></div><div><dt>Methodology</dt><dd>${escapeHtml(trace.formula || (trace.metric_ids || record.metric_ids || []).join(", ") || "Canonical producer evidence; no browser-derived calculation.")}</dd></div></dl>`;
};

const metricRows = (records) => records.map((record) => `<tr><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.value)}</td><td>${escapeHtml(record.trace?.unit)}</td><td>${escapeHtml(record.trace?.basis)}</td><td>${escapeHtml(record.trace?.producer?.name)}</td></tr>`).join("");

export function buildCanonicalExecutiveHtml(model) {
  const evidence = buildCanonicalEvidencePackage(model);
  const producerCommits = model.sourceMetadata.approved_release_provenance.producer_commits;
  const producerRows = model.producers.map((producer) => `<tr><td>${escapeHtml(producer.name)}</td><td>${escapeHtml(producer.version)}</td><td>${escapeHtml(producer.quality.status)}</td><td class="hash">${escapeHtml(producerCommits[producer.name])}</td><td>${escapeHtml(producer.source.artifact)}</td><td class="hash">${escapeHtml(producer.source.artifact_sha256)}</td></tr>`).join("");
  const qualityIssues = model.producers.flatMap((producer) => producer.quality.issues.map((issue) => `<li><strong>${escapeHtml(producer.name)} · ${escapeHtml(issue.severity)}</strong><span>${escapeHtml(issue.message)}</span><code>${escapeHtml(issue.code)}</code></li>`)).join("");
  const findingCards = model.findings.map((finding) => `<article><p class="kicker">${escapeHtml(finding.severity)} · ${escapeHtml(finding.type)}</p><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.context)}</p>${traceHtml(finding)}</article>`).join("");
  const anomalyRows = model.anomalies.flatMap((anomaly) => [anomaly.expected, anomaly.observed, anomaly.impact]).map((record) => `<tr><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.value)}</td><td>${escapeHtml(record.trace.unit)}</td><td>${escapeHtml(record.trace.basis)}</td><td>${escapeHtml(record.trace.producer.name)}</td></tr>`).join("");
  const unavailable = evidence.unavailable.map((item) => `<li><strong>${escapeHtml(item.concept.replaceAll("_", " "))}</strong><span>${escapeHtml(item.explanation)}</span><code>${escapeHtml(item.reason_code)}</code></li>`).join("");
  const invoiceCards = model.saas.invoices.map((invoice) => `<article><p class="kicker">${escapeHtml(invoice.dimensions.billing_cadence)} invoice · separate period</p><h3>${escapeHtml(invoice.dimensions.application)}</h3><p class="metric">${money(invoice.value)}</p><p>Exact canonical value: USD ${escapeHtml(invoice.value)}</p><p>${escapeHtml(period(invoice.trace.period))}. This invoice is not added to the canonical SaaS scope or to the other invoice.</p>${traceHtml(invoice)}</article>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Canonical executive report · ${escapeHtml(model.identity.report_id)}</title><style>
:root{color:#201b17;background:#f5efe9;font-family:Arial,Helvetica,sans-serif;line-height:1.5}*{box-sizing:border-box}body{margin:0}main{max-width:1080px;margin:auto;padding:40px 28px 72px}.masthead{border-bottom:4px solid #8b6f47;padding-bottom:24px;margin-bottom:28px}.brand{font-family:Georgia,serif;font-size:18px;font-weight:700;color:#6e563b}.eyebrow,.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700;color:#806b56}h1,h2,h3{font-family:Georgia,serif;line-height:1.15}h1{font-size:44px;margin:.2em 0}.disclosure{padding:16px;border-left:4px solid #8b6f47;background:#fffaf6}.hero,.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.hero{margin:24px 0}.card,article{background:#fff;border:1px solid #ded3ca;border-radius:14px;padding:20px;break-inside:avoid}.metric{font-family:Georgia,serif;font-size:34px;font-weight:700;margin:.2em 0}.exact{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#6c5c50}.wide{grid-column:1/-1}section{margin-top:34px}table{width:100%;border-collapse:collapse;background:#fff;font-size:13px}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e7dfd8}.hash,code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}.trace{font-size:12px}.trace div{display:grid;grid-template-columns:110px 1fr;gap:8px}.trace dt{font-weight:700}.trace dd{margin:0;overflow-wrap:anywhere}.unavailable{list-style:none;padding:0}.unavailable li{display:grid;grid-template-columns:1fr 2fr 1fr;gap:14px;padding:12px 0;border-bottom:1px solid #ded3ca}.unavailable span{color:#665a50}.footer{margin-top:42px;padding-top:18px;border-top:1px solid #cfc2b8;font-size:12px;color:#665a50}@media(max-width:720px){main{padding:24px 16px}.hero,.grid{grid-template-columns:1fr}h1{font-size:34px}.unavailable li{grid-template-columns:1fr}.wide{grid-column:auto}}@media print{:root{background:#fff}main{max-width:none;padding:0}.card,article{box-shadow:none}section{break-before:auto}a{color:inherit}}
</style></head><body><main><header class="masthead"><div class="brand">Cloud &amp; Capital · Cloud+ Cost Guard</div><p class="eyebrow">Canonical executive report · Illustrative</p><h1>Technology Spend decision support</h1><p>${escapeHtml(period(model.identity.report_period))}</p><p class="exact">Report ${escapeHtml(model.identity.report_id)} · ${escapeHtml(model.identity.contract)} · view ${escapeHtml(model.schema)} · generated ${escapeHtml(model.identity.generated_at)}</p></header>
<div class="disclosure"><strong>Illustrative data only.</strong> No customer systems, accounts, credentials, or production resources are connected. This self-contained report was generated client-side from the validated CCAC 1.1 presentation model. Lumen is separately grounded and is not an export source.</div>
<section><p class="eyebrow">Published canonical total</p><div class="hero"><div class="card wide"><h2>Technology Spend</h2><p class="metric">${money(model.total.value)}</p><p class="exact">Exact canonical value: USD ${escapeHtml(model.total.value)}</p><p>Reconciliation ${escapeHtml(model.reconciliation.status)} · exact difference USD ${escapeHtml(model.reconciliation.difference)}</p>${traceHtml(model.total)}</div><div class="card"><h3>Cloud</h3><p class="metric">${money(model.cloud.total.value)}</p><p class="exact">Exact USD ${escapeHtml(model.cloud.total.value)}</p><p>Additive; provider-billed native AI included.</p></div><div class="card"><h3>Direct AI</h3><p class="metric">${money(model.ai.directScope.value,4)}</p><p class="exact">Exact USD ${escapeHtml(model.ai.directScope.value)}</p><p>Additive; direct-vendor billing only.</p></div><div class="card"><h3>SaaS</h3><p class="metric">${money(model.saas.scope.value)}</p><p class="exact">Exact USD ${escapeHtml(model.saas.scope.value)}</p><p>Additive; same-period allocated scope.</p></div></div></section>
<section><h2>Broader AI analysis</h2><div class="card"><p class="metric">${money(model.ai.domainTotal.value,4)}</p><p class="exact">Exact canonical value: USD ${escapeHtml(model.ai.domainTotal.value)}</p><p><strong>Non-additive.</strong> Includes provider-billed AI already represented in Cloud and must not be added to Technology Spend.</p>${traceHtml(model.ai.domainTotal)}</div></section>
<section><h2>AWS canonical evidence</h2><table><thead><tr><th>Metric</th><th>Exact value</th><th>Unit</th><th>Basis</th><th>Producer</th></tr></thead><tbody>${metricRows([model.cloud.total,...model.cloud.comparison,...model.cloud.services,...model.cloud.daily])}</tbody></table></section>
<section><h2>Canonical anomalies</h2><p>Expected, observed, and impact values are diagnostic and do not create savings or remediation values.</p><table><thead><tr><th>Metric</th><th>Exact value</th><th>Unit</th><th>Basis</th><th>Producer</th></tr></thead><tbody>${anomalyRows}</tbody></table></section>
<section><h2>Canonical findings</h2><p>All ten validated findings retain their producer, quality, evidence, and methodology trace.</p><div class="grid">${findingCards}</div></section>
<section><h2>Resilience evidence</h2><div class="disclosure"><strong>Recoverability is not demonstrated.</strong> Modeled and observed evidence remain separate.</div><h3>Modeled evidence</h3><table><thead><tr><th>Metric</th><th>Exact value</th><th>Unit</th><th>Basis</th><th>Producer</th></tr></thead><tbody>${metricRows(model.resilience.modeled)}</tbody></table><h3>Observed restore-test evidence</h3><table><thead><tr><th>Metric</th><th>Exact value</th><th>Unit</th><th>Basis</th><th>Producer</th></tr></thead><tbody>${metricRows(model.resilience.observed)}</tbody></table></section>
<section><h2>SaaS invoice evidence</h2><div class="grid">${invoiceCards}</div><p class="disclosure"><strong>No combined invoice total.</strong> Annual and quarterly records cover incompatible periods and remain separate.</p></section>
<section><h2>Opportunity boundary</h2><div class="card"><p><strong>No canonical annual aggregate was published.</strong> The single source opportunity remains review-only and is not presented as realized savings.</p><p>${escapeHtml(model.opportunity.source.title)}</p><p class="exact">Source estimate range USD ${escapeHtml(model.opportunity.source.estimate.low)}–${escapeHtml(model.opportunity.source.estimate.high)} · ${escapeHtml(model.opportunity.source.estimate.period)} · ${escapeHtml(model.opportunity.source.confidence)} confidence</p>${traceHtml(model.opportunity.source)}</div></section>
<section><h2>Unavailable registry</h2><p>Unsupported measures remain explicit and visually secondary; missing values are never substituted or invented.</p><ul class="unavailable">${unavailable}</ul></section>
<section><h2>Provenance</h2><table><thead><tr><th>Producer</th><th>Version</th><th>Quality</th><th>Commit</th><th>Artifact</th><th>Artifact SHA-256</th></tr></thead><tbody>${producerRows}</tbody></table>${qualityIssues ? `<h3>Producer quality issues</h3><ul class="unavailable">${qualityIssues}</ul>` : ""}<div class="card"><p><strong>Source report SHA-256</strong><br><span class="hash">${escapeHtml(model.identity.source_report_sha256)}</span></p><p><strong>Final manifest SHA-256</strong><br><span class="hash">${escapeHtml(model.sourceMetadata.final_manifest_sha256)}</span></p><p><strong>Report provenance manifest SHA-256</strong><br><span class="hash">${escapeHtml(model.sourceMetadata.report_provenance_manifest_sha256)}</span></p><p><strong>CCAC release</strong> ${escapeHtml(model.sourceMetadata.approved_release_provenance.ccac.version)} · wheel <span class="hash">${escapeHtml(model.sourceMetadata.approved_release_provenance.ccac.wheel_sha256)}</span></p><p><strong>Command Center commit</strong> <span class="hash">${escapeHtml(model.sourceMetadata.approved_release_provenance.command_center_commit)}</span></p></div></section>
<p class="footer">Deterministic canonical export for ${escapeHtml(model.identity.report_id)}. Content generation uses canonical report time ${escapeHtml(model.identity.generated_at)}; no current timestamp, external resource, tracking, script, or network dependency is included.</p></main></body></html>`;
}

export function buildCanonicalExportFiles(model) {
  ensureExportModel(model);
  const base = `cloud-cost-guard-${slug(model.identity.report_id)}-${model.identity.report_period.start}-to-${model.identity.report_period.end}`;
  return {
    html: { kind: "html", filename: `${base}.html`, mimeType: HTML_MIME, content: buildCanonicalExecutiveHtml(model) },
    json: { kind: "json", filename: `${base}-evidence.json`, mimeType: JSON_MIME, content: serializeCanonicalEvidence(model) },
  };
}

export function downloadCanonicalExport(file, browser = window) {
  if (!file?.filename || !file?.mimeType || typeof file.content !== "string") throw new Error("Canonical export generation failed closed: complete file is unavailable");
  const url = browser.URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  try {
    const link = browser.document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.rel = "noopener";
    browser.document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 0);
  }
}

export { EXPORT_SCHEMA, HTML_MIME, JSON_MIME, escapeHtml };
