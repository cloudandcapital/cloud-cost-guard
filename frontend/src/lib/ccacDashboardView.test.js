import fs from "fs";
import path from "path";
import {
  CCAC_DASHBOARD_UNAVAILABLE_MESSAGE,
  CcacDashboardViewUnavailableError,
  getValidatedCcacDashboardView,
  validateCcacDashboardView,
} from "./ccacDashboardView";

const canonicalView = getValidatedCcacDashboardView();
const clone = (value = canonicalView) => JSON.parse(JSON.stringify(value));
const reject = (value) => {
  expect(() => validateCcacDashboardView(value)).toThrow(CcacDashboardViewUnavailableError);
  expect(() => validateCcacDashboardView(value)).toThrow(CCAC_DASHBOARD_UNAVAILABLE_MESSAGE);
};

test("accepts the canonical generated view without mutation", () => {
  const candidate = clone();
  const before = JSON.stringify(candidate);
  expect(validateCcacDashboardView(candidate)).toBe(candidate);
  expect(JSON.stringify(candidate)).toBe(before);
});

test.each([
  ["schema", "wrong"],
  ["schema", undefined],
  ["identity.mode", "real"],
  ["identity.mode", undefined],
  ["identity.contract", "ccac/9.9.9"],
  ["identity.contract", undefined],
  ["identity.status", "partial"],
  ["identity.status", undefined],
  ["identity.command_center_version", "0.2.0"],
  ["identity.source_report_sha256", "0".repeat(64)],
])("rejects invalid required identity %s", (key, value) => {
  const candidate = clone();
  const parts = key.split(".");
  const target = parts.length === 1 ? candidate : candidate[parts[0]];
  const field = parts.at(-1);
  if (value === undefined) delete target[field]; else target[field] = value;
  reject(candidate);
});

test("rejects missing report and run identity fields", () => {
  for (const field of ["report_id", "run_id", "generated_at", "report_period"]) {
    const candidate = clone();
    delete candidate.identity[field];
    reject(candidate);
  }
});

test("rejects missing producer and source-artifact metadata", () => {
  const missingProducer = clone();
  missingProducer.producers.pop();
  reject(missingProducer);

  const missingArtifact = clone();
  delete missingArtifact.producers[0].source.artifact;
  reject(missingArtifact);
});

test("rejects missing required sections", () => {
  for (const section of ["cloud", "ai", "saas", "resilience", "opportunity", "findings", "unsupported"]) {
    const candidate = clone();
    delete candidate[section];
    reject(candidate);
  }
});

test("rejects duplicate canonical IDs", () => {
  const candidate = clone();
  candidate.cloud.services.push(clone(candidate.cloud.services[0]));
  reject(candidate);
});

test("rejects broken trace references and missing trace metadata", () => {
  const brokenReference = clone();
  brokenReference.cloud.comparison[1].trace.input_metric_ids = ["metric.not-present"];
  reject(brokenReference);

  const missingTrace = clone();
  delete missingTrace.cloud.services[0].trace.source_artifact;
  reject(missingTrace);
});

test("preserves decimal strings, nulls, unknown reasons, integers, and canonical order", () => {
  const candidate = clone();
  candidate.cloud.services.reverse();
  candidate.cloud.total.value = null;
  candidate.cloud.total.unknown_reason = "Illustrative value intentionally unavailable";
  expect(validateCcacDashboardView(candidate)).toBe(candidate);
  expect(candidate.cloud.services.map((metric) => metric.id)).toEqual(
    [...canonicalView.cloud.services].reverse().map((metric) => metric.id),
  );
  expect(candidate.cloud.total.value).toBeNull();
  expect(candidate.cloud.total.unknown_reason).toBe("Illustrative value intentionally unavailable");
  expect(typeof candidate.cloud.comparison[0].value).toBe("string");
  expect(Number.isInteger(candidate.source_metadata.catalog_counts.metrics)).toBe(true);
});

test("rejects null without an unknown reason and rejects numeric metric replacements", () => {
  const missingReason = clone();
  missingReason.cloud.total.value = null;
  reject(missingReason);

  const numericReplacement = clone();
  numericReplacement.cloud.total.value = 2194;
  reject(numericReplacement);
});

test("rejects nonfinite JavaScript numbers", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const candidate = clone();
    candidate.source_metadata.catalog_counts.metrics = value;
    reject(candidate);
  }
});

test("rejects invented unsupported values", () => {
  const candidate = clone();
  candidate.unsupported[0].value = 35951.85;
  reject(candidate);
});

test("rejects SaaS quality removal or promotion", () => {
  const removed = clone();
  removed.producers.find((producer) => producer.name === "saas-cost-analyzer").quality.issues = [];
  reject(removed);

  const promoted = clone();
  promoted.producers.find((producer) => producer.name === "saas-cost-analyzer").quality.status = "valid";
  reject(promoted);
});

test("rejected input cannot produce partial data and accessor has no legacy fallback", () => {
  const candidate = clone();
  candidate.schema = "invalid";
  let result;
  try {
    result = validateCcacDashboardView(candidate);
  } catch (error) {
    expect(error).toBeInstanceOf(CcacDashboardViewUnavailableError);
  }
  expect(result).toBeUndefined();

  const first = getValidatedCcacDashboardView();
  first.cloud.total.value = "changed by caller";
  const second = getValidatedCcacDashboardView();
  expect(second.cloud.total.value).toBe(canonicalView.cloud.total.value);
  expect(second).not.toHaveProperty("cost_baseline");
  expect(JSON.stringify(second)).not.toContain("35951.85");
});

test("owns the generated import without crossing the dashboard or Lumen boundaries", () => {
  const sourceRoot = path.resolve(__dirname, "..");
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(js|jsx)$/.test(entry.name)) files.push(fullPath);
    }
  };
  visit(sourceRoot);
  files.push(path.resolve(sourceRoot, "../../api/ask-claude.js"));

  const generatedAssetName = ["ccac-dashboard-view", "generated", "json"].join(".");
  const generatedImporters = files.filter((file) => (
    fs.readFileSync(file, "utf8").includes(generatedAssetName)
  ));
  expect(generatedImporters).toEqual([
    path.resolve(__dirname, "ccacDashboardView.js"),
  ]);

  const adapterSource = fs.readFileSync(path.resolve(__dirname, "ccacDashboardView.js"), "utf8");
  expect(adapterSource).not.toContain("data/report.json");
  for (const relativePath of [
    "../components/AskClaude.jsx",
    "lumenPresets.js",
    "../../../api/ask-claude.js",
  ]) {
    const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
    expect(source).not.toContain("ccacDashboardView");
  }
  expect(fs.readFileSync(path.resolve(__dirname, "../../../api/ask-claude.js"), "utf8"))
    .toContain("frontend/src/data/report.json");
});
