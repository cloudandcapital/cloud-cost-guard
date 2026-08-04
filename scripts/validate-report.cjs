const assert = require("node:assert/strict");
const report = require("../frontend/src/data/report.json");

const round = (value) => Number(Number(value).toFixed(2));
const sum = (values) => round(values.reduce((total, value) => total + Number(value || 0), 0));

assert.equal(report.data_mode, "illustrative_demo", "Public report must declare illustrative demo mode");
assert.equal(report.cost_baseline.period_days, 30, "Demo report must use the fixed 30-day window");
assert.equal(report.cost_baseline.window_start, report.window.start, "Cloud window start must match report window");
assert.equal(report.cost_baseline.window_end, report.window.end, "Cloud window end must match report window");

const cloudScopeTotal = sum(Object.values(report.clouds).map((cloud) => cloud.total_cost));
assert.equal(round(report.cost_baseline.total_cost), cloudScopeTotal, "Cloud total must equal AWS + Azure + GCP");
assert.equal(
  round(report.cost_baseline.daily_average),
  round(report.cost_baseline.total_cost / report.cost_baseline.period_days),
  "Cloud daily average must reconcile",
);

const cloudServiceTotal = sum(report.cost_baseline.top_services.map((service) => service.total_cost));
assert.equal(cloudServiceTotal, cloudScopeTotal, "Cloud service breakdown must reconcile to cloud total");
const priorCloudServiceTotal = sum(report.cost_baseline.top_services.map((service) => service.prior_period_cost));
assert.equal(priorCloudServiceTotal, round(report.cost_baseline.trend.previous_period_cost), "Prior product values must reconcile to prior cloud total");
assert.equal(
  sum(report.cost_baseline.top_services.map((service) => service.total_cost - service.prior_period_cost)),
  round(report.cost_baseline.trend.change_amount),
  "Product changes must reconcile to the cloud-level change",
);

const combinedScopeTotal = sum([
  report.cost_baseline.total_cost,
  report.ai_spend.total_cost,
  report.saas_spend.total_cost,
]);
assert.equal(round(report.combined_spend.total_cost), combinedScopeTotal, "Combined total must equal cloud + AI + SaaS");
assert.deepEqual(
  {
    cloud: round(report.combined_spend.by_scope.cloud),
    ai: round(report.combined_spend.by_scope.ai),
    saas: round(report.combined_spend.by_scope.saas),
  },
  {
    cloud: round(report.cost_baseline.total_cost),
    ai: round(report.ai_spend.total_cost),
    saas: round(report.saas_spend.total_cost),
  },
  "Combined scope values must match their source sections",
);

const combinedPreviousTotal = sum([
  report.cost_baseline.trend.previous_period_cost,
  report.ai_spend.total_cost - report.ai_spend.trend.change_amount,
  report.saas_spend.total_cost - report.saas_spend.trend.change_amount,
]);
assert.equal(round(report.combined_spend.previous_total_cost), combinedPreviousTotal, "Combined prior total must reconcile");
assert.equal(
  round(report.combined_spend.change_amount),
  round(report.combined_spend.total_cost - report.combined_spend.previous_total_cost),
  "Combined change must reconcile",
);
assert.equal(
  round(report.combined_spend.change_percentage),
  round((report.combined_spend.change_amount / report.combined_spend.previous_total_cost) * 100),
  "Combined change percentage must reconcile",
);

const aiModelTotal = sum(report.ai_spend.models.map((model) => model.cost));
assert.equal(aiModelTotal, round(report.ai_spend.total_cost), "AI models must reconcile to AI total");

const saasToolTotal = sum(report.saas_spend.tools.map((tool) => tool.cost));
assert.equal(saasToolTotal, round(report.saas_spend.total_cost), "SaaS tools must reconcile to SaaS total");
const seatedTools = report.saas_spend.tools.filter((tool) => Number(tool.seats_licensed) > 0);
const unusedLicenseAllocations = seatedTools.map((tool) => ({
  tool: tool.tool,
  amount: round((tool.cost * tool.unused) / tool.seats_licensed),
}));
assert.deepEqual(unusedLicenseAllocations, [
  { tool: "Salesforce", amount: 120.00 },
  { tool: "Slack", amount: 70.00 },
  { tool: "GitHub", amount: 35.42 },
  { tool: "Notion", amount: 16.00 },
], "Unused-seat allocations must derive from displayed seated-tool data");
const unusedLicenseOpportunity = sum(unusedLicenseAllocations.map((entry) => entry.amount));
assert.equal(unusedLicenseOpportunity, round(report.saas_spend.estimated_waste), "SaaS opportunity must equal allocated unused-seat costs");
assert.equal(seatedTools.some((tool) => tool.tool === "Snowflake"), false, "Snowflake must be excluded without licensed-seat data");

const namespaceTotal = sum(report.kubernetes.namespaces.map((namespace) => namespace.cost));
const nodePoolTotal = sum(report.kubernetes.node_pools.map((pool) => pool.cost));
assert.equal(namespaceTotal, round(report.kubernetes.total_cost), "Kubernetes namespaces must reconcile");
assert.equal(nodePoolTotal, round(report.kubernetes.total_cost), "Kubernetes node pools must reconcile");
assert.equal(
  report.kubernetes.cost_treatment,
  "allocated_view_of_cloud_spend",
  "Kubernetes must be marked as a non-additive view of cloud spend",
);

assert.equal(
  sum([report.budgets.cloud, report.budgets.ai, report.budgets.saas]),
  round(report.budgets.total),
  "Scope budgets must reconcile to the total budget",
);

const opportunityIds = report.opportunity_catalog.map((entry) => entry.id);
assert.equal(new Set(opportunityIds).size, opportunityIds.length, "Opportunity IDs must be unique");
const opportunityById = new Map(report.opportunity_catalog.map((entry) => [entry.id, entry]));
for (const opportunity of report.opportunity_catalog) {
  for (const field of ["id", "label", "scope", "category", "estimated_monthly_amount", "confidence", "source_methodology", "may_overlap", "included_in_aggregates"]) {
    assert.notEqual(opportunity[field], undefined, `${opportunity.id} is missing ${field}`);
  }
}
for (const aggregate of report.opportunity_aggregates) {
  const entries = aggregate.opportunity_ids.map((id) => opportunityById.get(id));
  assert.equal(entries.every(Boolean), true, `${aggregate.id} references an unknown opportunity`);
  assert.equal(sum(entries.map((entry) => entry.estimated_monthly_amount)), round(aggregate.estimated_monthly_amount), `${aggregate.id} must reconcile`);
  assert.equal(entries.every((entry) => entry.included_in_aggregates.includes(aggregate.id)), true, `${aggregate.id} membership must be explicit`);
}
for (const workload of report.resilience.top_workloads) {
  assert.ok(opportunityById.has(workload.opportunity_id), `${workload.workload} must reference a canonical opportunity`);
}
assert.equal(opportunityById.get(report.kubernetes.opportunity_id).estimated_monthly_amount, report.kubernetes.overprovisioning_waste_est, "Kubernetes opportunity must use the catalog amount");
assert.equal(opportunityById.get(report.saas_spend.opportunity_id).estimated_monthly_amount, report.saas_spend.estimated_waste, "SaaS opportunity must use the catalog amount");
assert.equal(opportunityById.get(report.saas_spend.opportunity_id).estimated_monthly_amount, unusedLicenseOpportunity, "SaaS catalog opportunity must reconcile to unused-seat allocations");
assert.equal(report.tagging.amount_type, "unattributed_cost", "Untagged spend must be classified as unattributed cost");
assert.equal(report.tagging.savings_eligible, false, "Untagged spend must not be classified as savings");

const staleCutoff = new Date(`${report.window.start}T00:00:00Z`);
const mutatingCommand = /\b(delete|update|create|patch|release|terminate|stop|start|resize)\b/i;
for (const cloud of Object.values(report.clouds)) {
  for (const finding of cloud.findings || []) {
    const opportunity = opportunityById.get(finding.opportunity_id);
    assert.ok(opportunity, `${finding.finding_id} must reference a canonical opportunity`);
    assert.equal(opportunity.estimated_monthly_amount, finding.monthly_savings_usd_est, `${finding.finding_id} amount must match its catalog entry`);
    assert.ok(new Date(finding.last_analyzed) >= staleCutoff, `${finding.finding_id} has a stale analysis date`);
    for (const command of finding.commands || []) {
      assert.equal(mutatingCommand.test(command), false, `${finding.finding_id} exposes a mutating command`);
    }
  }
}

console.log("Cloud Cost Guard report validation passed.");
