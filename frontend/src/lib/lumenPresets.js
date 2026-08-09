import { formatCurrencyString } from "./canonicalExport";
import { buildCanonicalLumenContext } from "./lumenContext";

export const SAMPLE_QUESTIONS = [
  "What's bleeding money right now?",
  "Where should I cut first?",
  "Is my AI spend worth it?",
  "What's my biggest risk this month?",
  "Any SaaS I should cancel?",
  "How's my tagging coverage?",
  "What will I spend next month?",
];

const normalizeQuestion = (value) => String(value || "").trim().replace(/’/g, "'");
const usd = (value, digits = 1) => `USD ${value} (${formatCurrencyString(value, digits)})`;

export function buildPresetLumenResponse(question, view) {
  const normalized = normalizeQuestion(question);
  if (!SAMPLE_QUESTIONS.includes(normalized)) return null;

  const context = buildCanonicalLumenContext(view);
  const anomaly = context.anomalies[0];
  const anomalyFinding = context.findings.find(({ id }) => id === anomaly.finding_id);
  const tagging = context.canonical_unsupported.find(({ concept }) => concept === "tagging_coverage");
  const forecast = context.canonical_unsupported.find(({ concept }) => concept === "next_month_forecast");
  const saasFindings = context.findings.filter(({ id }) => id.startsWith("finding.saas."));
  const [annualInvoice, quarterlyInvoice] = context.saas.invoice_metrics;

  switch (normalized) {
    case SAMPLE_QUESTIONS[0]:
      return `**Highest-priority canonical anomaly:** ${anomalyFinding.title}. Expected cost was **${usd(anomaly.expected.value)}**, observed cost was **${usd(anomaly.observed.value)}**, and diagnostic impact was **${usd(anomaly.impact.value)}**.\n\nThe impact is anomaly evidence—not savings and not a proven root cause. Validate the workload driver and owner before any action; require approval, rollback planning, and post-change verification.`;
    case SAMPLE_QUESTIONS[1]:
      return `**Prioritize review; do not cut automatically.** Start with the critical Amazon EC2 anomaly: observed **${usd(anomaly.observed.value)}** versus expected **${usd(anomaly.expected.value)}**. The report does not publish a verified-savings amount or an automatic-cut recommendation.\n\nConfirm ownership and business purpose, validate the evidence, obtain human approval, plan rollback, and verify cost and service health after any approved change.`;
    case SAMPLE_QUESTIONS[2]:
      return `**AI boundaries:** Direct-vendor AI is **${usd(context.ai.direct_scope.value, 4)}** and is additive. Broader AI is **${usd(context.ai.broader_domain_total.value, 4)}** and is explicitly non-additive because provider-billed AI remains inside Cloud.\n\nROI and business-value evidence are unavailable, so this report cannot determine whether AI spend is worthwhile. Human review of usage, outcomes, and unit economics is required.`;
    case SAMPLE_QUESTIONS[3]:
      return `**Largest current signals:** The critical Amazon EC2 anomaly shows **${usd(anomaly.impact.value)}** of diagnostic impact, not savings. Resilience evidence also shows failed restore targets. Modeled evidence and observed restore-test evidence remain separate.\n\nRecoverability is **not demonstrated**. Validate ownership and evidence, obtain approval, preserve rollback, and verify outcomes before remediation.`;
    case SAMPLE_QUESTIONS[4]:
      return `**No cancellation recommendation is supported.** ${saasFindings.map(({ title }) => title).join("; ")}. Both findings have partial quality, so activity and assignment evidence require owner review.\n\nThe **annual ${usd(annualInvoice.value)}** invoice and **quarterly ${usd(quarterlyInvoice.value)}** invoice cover incompatible periods and must remain separate. Do not combine them. Validate usage, contracts, dependencies, and reactivation plans before an approved change.`;
    case SAMPLE_QUESTIONS[5]:
      return `**Tagging coverage is unavailable.** ${tagging.explanation} Reason: **${tagging.reason_code}**.\n\nThe validated report contains no tagging percentage or untagged-spend value. Do not estimate or substitute one; establish canonical tagging evidence before making allocation claims.`;
    case SAMPLE_QUESTIONS[6]:
      return `**Next-month spend is unavailable.** ${forecast.explanation} Reason: **${forecast.reason_code}**.\n\nLumen will not forecast, extrapolate, annualize, or reuse a legacy projection. A planning answer requires an approved canonical forecast produced outside this read-only report.`;
    default:
      return null;
  }
}

export function getLumenFooterLabel(messages) {
  const lastAssistant = (Array.isArray(messages) ? messages : [])
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistant?.source === "preset"
    ? "Deterministic · Validated CCAC 1.1"
    : "Claude explanation · Validated CCAC 1.1";
}
