const round = (value) => Number(Number(value).toFixed(2));

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
