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

const staleCutoff = new Date(`${report.window.start}T00:00:00Z`);
const mutatingCommand = /\b(delete|update|create|patch|release|terminate|stop|start|resize)\b/i;
for (const cloud of Object.values(report.clouds)) {
  for (const finding of cloud.findings || []) {
    assert.ok(new Date(finding.last_analyzed) >= staleCutoff, `${finding.finding_id} has a stale analysis date`);
    for (const command of finding.commands || []) {
      assert.equal(mutatingCommand.test(command), false, `${finding.finding_id} exposes a mutating command`);
    }
  }
}

console.log("Cloud Cost Guard report validation passed.");
