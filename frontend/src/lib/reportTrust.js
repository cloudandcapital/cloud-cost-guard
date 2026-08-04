const round = (value) => Number(Number(value).toFixed(2));

const DISPLAY_TERMS = {
  very_high: "Very high",
  high: "High",
  medium: "Medium",
  low: "Low",
  critical: "Critical",
  AmazonEC2: "Amazon EC2",
};

export function normalizeLumenDisplayTerm(value) {
  const text = String(value || "");
  return DISPLAY_TERMS[text] || text;
}

export function normalizeLumenDisplayText(value) {
  return String(value || "")
    .replace(/\bvery_high\b/g, "Very high")
    .replace(/\bAmazonEC2\b/g, "Amazon EC2");
}

export function formatTopSignalLabel(serviceName) {
  return `${normalizeLumenDisplayTerm(serviceName)} spend anomaly`;
}

export function buildProductComparisons(services) {
  return (Array.isArray(services) ? services : []).map((service) => {
    const current = Number(service?.total_cost);
    const prior = Number(service?.prior_period_cost);
    const hasComparison = Number.isFinite(current) && Number.isFinite(prior) && prior > 0;
    return {
      product: service?.service_name || "—",
      amount_usd: Number.isFinite(current) ? current : 0,
      prior_period_cost: hasComparison ? prior : null,
      change_percentage: hasComparison ? round(((current - prior) / prior) * 100) : null,
      percent_of_total: Number(service?.percentage_of_total) || 0,
    };
  });
}

export function formatProductChange(value) {
  if (!Number.isFinite(value)) return "Not available";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function getOpportunity(report, opportunityId) {
  return (report?.opportunity_catalog || []).find((entry) => entry.id === opportunityId) || null;
}

export function getOpportunityAggregate(report, aggregateId) {
  return (report?.opportunity_aggregates || []).find((entry) => entry.id === aggregateId) || null;
}

export function formatUtcReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatUtcTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  return `${datePart} · ${timePart} UTC`;
}

export function calculateUnusedLicenseAllocations(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => Number(tool?.seats_licensed) > 0)
    .map((tool) => ({
      tool: tool.tool,
      allocated_unused_cost: round(
        (Number(tool.cost) * Number(tool.unused || 0)) / Number(tool.seats_licensed),
      ),
    }));
}

export function calculateUnusedLicenseOpportunity(tools) {
  return round(calculateUnusedLicenseAllocations(tools)
    .reduce((total, tool) => total + tool.allocated_unused_cost, 0));
}
