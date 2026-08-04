import { getOpportunity, normalizeLumenDisplayTerm } from "./reportTrust";

export const SAMPLE_QUESTIONS = [
  "What's bleeding money right now?",
  "Where should I cut first?",
  "Is my AI spend worth it?",
  "What's my biggest risk this month?",
  "Any SaaS I should cancel?",
  "How's my tagging coverage?",
  "What will I spend next month?",
];

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value));

const percent = (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`;

const longDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unavailable date";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const normalizeQuestion = (value) => String(value || "").trim().replace(/’/g, "'");

export function buildPresetLumenResponse(question, report) {
  const normalized = normalizeQuestion(question);
  if (!SAMPLE_QUESTIONS.includes(normalized)) return null;

  const anomaly = report?.anomalies?.recent?.[0] || {};
  const service = normalizeLumenDisplayTerm(anomaly.group || "Amazon EC2");
  const saasOpportunity = getOpportunity(report, report?.saas_spend?.opportunity_id);
  const ebsFinding = (report?.clouds?.aws?.findings || [])
    .find((finding) => finding.opportunity_id === "opp-aws-ebs-unattached");
  const ebsOpportunity = getOpportunity(report, ebsFinding?.opportunity_id);

  switch (normalized) {
    case SAMPLE_QUESTIONS[0]:
      return `**Immediate signal:** ${service} increased from **${money(anomaly.baseline)}** to **${money(anomaly.current)}** on **${longDate(anomaly.timestamp)}** (${percent(anomaly.delta_pct)}).\n\nThis is a potential optimization signal that still requires investigation. Validate the workload driver and owner before any approved change, preserve a rollback path, and verify cost and service health afterward.`;
    case SAMPLE_QUESTIONS[1]:
      return `**First review:** Validate the unattached EBS finding first. Its estimated opportunity is **${money(ebsOpportunity?.estimated_monthly_amount)} per month** with **${normalizeLumenDisplayTerm(ebsOpportunity?.confidence)} confidence** and relatively low operational complexity.\n\nConfirm ownership and retention, prepare recoverable snapshots, obtain approval, document rollback or restore steps, and verify the result. Do not combine this estimate with overlapping scopes.`;
    case SAMPLE_QUESTIONS[2]:
      return `**AI spend:** **${money(report?.ai_spend?.total_cost)}** for the completed window, ${percent(report?.ai_spend?.trend?.change_percentage)} versus the prior period.\n\nROI and business-value data are unavailable, so this report cannot determine whether that spend is worthwhile. Review model usage, output quality, unit economics, and product-owner evidence before approving changes; verify both cost and service outcomes afterward.`;
    case SAMPLE_QUESTIONS[3]:
      return `**Largest observed risk:** The ${service} anomaly reached **${money(anomaly.current)}** on **${longDate(anomaly.timestamp)}**, ${percent(anomaly.delta_pct)} above its baseline.\n\nTreat it as an unverified anomaly and investigation priority. Confirm whether it matches a deployment or batch job, identify the owner, require approval for remediation, preserve rollback, and verify service health and cost afterward.`;
    case SAMPLE_QUESTIONS[4]:
      return `**SaaS review:** The report supports reviewing or reclaiming **${Number(report?.saas_spend?.total_unused_licenses)} seats** with an estimated opportunity of **${money(saasOpportunity?.estimated_monthly_amount)} per month**.\n\nIt does not support canceling an entire tool. Validate user activity, owners, contract terms, renewal dates, and operational dependencies before an approved seat change; preserve a reactivation path and verify access afterward.`;
    case SAMPLE_QUESTIONS[5]:
      return `**Tag coverage:** **${Number(report?.tagging?.coverage_pct)}%** is tagged, leaving **${money(report?.tagging?.untagged_monthly_cost)}** as untagged spend.\n\nThat amount is unattributed cost and an allocation problem, not savings. Review ownership and tagging policy with accountable teams, approve any enforcement change, keep a rollback path, and verify allocation coverage afterward.`;
    case SAMPLE_QUESTIONS[6]:
      return `**Next-month forecast:** **${money(report?.combined_spend?.projected_next_month)}** across cloud, AI, and SaaS, compared with **${money(report?.combined_spend?.total_cost)}** in the completed sample window.\n\nThis is a deterministic illustrative forecast, not realized spend or a live billing-period balance. Validate planning assumptions before using it for approvals or commitments.`;
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
    ? "Grounded in illustrative report"
    : "Illustrative analysis · Powered by Claude";
}
