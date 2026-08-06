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

const replaceString = (value, original, replacement) => {
  if (Array.isArray(value)) return value.map((child) => replaceString(child, original, replacement));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceString(child, original, replacement)]),
    );
  }
  return value === original ? replacement : value;
};

const swapStrings = (value, first, second) => {
  const marker = "__ccac_identity_swap_marker__";
  return replaceString(replaceString(replaceString(value, first, marker), second, first), marker, second);
};

test("accepts the canonical generated view without mutation", () => {
  const candidate = clone();
  const before = JSON.stringify(candidate);
  const validated = validateCcacDashboardView(candidate);
  expect(validated).toStrictEqual(candidate);
  expect(validated).not.toBe(candidate);
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
  expect(validateCcacDashboardView(candidate)).toStrictEqual(candidate);
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

test("rejects same-count canonical metric, finding, and evidence substitutions", () => {
  reject(replaceString(
    clone(),
    "metric.cloud.service.amazonec2-23d867e0.cost",
    "metric.cloud.service.amazonec2-23d867e0.invented",
  ));
  reject(replaceString(
    clone(),
    "finding.anomaly.provider-aws-scope-cloud-service-amazone-b105271d",
    "finding.anomaly.provider-aws-scope-cloud-service-amazone-invented",
  ));
  reject(replaceString(
    clone(),
    "evidence.finops-lite.cost-summary",
    "evidence.finops-lite.invented-summary",
  ));
});

test("rejects swapped real same-producer evidence relationships", () => {
  reject(swapStrings(
    clone(),
    "evidence.recovery-economics.restore-test",
    "evidence.recovery-economics.scenario-input",
  ));
});

test("rejects missing, additional, and duplicate metric identities", () => {
  const missing = clone();
  missing.cloud.services.pop();
  reject(missing);

  const additional = clone();
  const invented = clone(additional.cloud.services[0]);
  invented.id = "metric.cloud.service.invented-00000000.cost";
  invented.trace.canonical_id = invented.id;
  additional.cloud.services.push(invented);
  reject(additional);

  const duplicate = clone();
  duplicate.cloud.services.push(clone(duplicate.cloud.services[0]));
  reject(duplicate);
});

test("rejects missing, additional, and duplicate finding identities", () => {
  const missing = clone();
  missing.findings.pop();
  reject(missing);

  const additional = clone();
  const invented = clone(additional.findings[0]);
  invented.id = "finding.anomaly.invented-00000000";
  invented.trace.canonical_id = invented.id;
  additional.findings.push(invented);
  reject(additional);

  const duplicate = clone();
  duplicate.findings.push(clone(duplicate.findings[0]));
  reject(duplicate);
});

test("rejects missing, additional, and duplicate evidence identities", () => {
  const missing = clone();
  missing.cloud.total.trace.evidence_ids.pop();
  reject(missing);

  const additional = clone();
  additional.cloud.total.trace.evidence_ids.push("evidence.ai-cost-lens.usage");
  reject(additional);

  const duplicate = clone();
  duplicate.cloud.total.trace.evidence_ids.push(duplicate.cloud.total.trace.evidence_ids[0]);
  reject(duplicate);
});

test("rejects correct metric identity assigned to the wrong producer", () => {
  const candidate = clone();
  candidate.cloud.total.trace.producer = { name: "ai-cost-lens", version: "0.2.0" };
  candidate.cloud.total.trace.source_artifact = "ai-cost-lens.json";
  reject(candidate);
});

test("rejects reversed, swapped, and rotated contractual finding order", () => {
  const reversed = clone();
  reversed.findings.reverse();
  reject(reversed);

  const swapped = clone();
  [swapped.findings[0], swapped.findings[1]] = [swapped.findings[1], swapped.findings[0]];
  reject(swapped);

  const rotated = clone();
  rotated.findings.push(rotated.findings.shift());
  reject(rotated);
});

test("preserves noncontractual catalog order without normalization", () => {
  const candidate = clone();
  candidate.cloud.services.reverse();
  const validated = validateCcacDashboardView(candidate);
  expect(validated.cloud.services.map(({ id }) => id)).toEqual(candidate.cloud.services.map(({ id }) => id));
});

test("isolates caller data, validation results, accessors, and the imported canonical source", () => {
  const candidate = clone();
  const result = validateCcacDashboardView(candidate);
  expect(result).not.toBe(candidate);
  expect(result.cloud).not.toBe(candidate.cloud);
  expect(result.cloud.services).not.toBe(candidate.cloud.services);
  expect(result.cloud.services[0]).not.toBe(candidate.cloud.services[0]);

  const canonicalValue = result.cloud.total.value;
  candidate.cloud.total.value = "caller mutation";
  expect(result.cloud.total.value).toBe(canonicalValue);
  result.cloud.total.value = "result mutation";
  expect(candidate.cloud.total.value).toBe("caller mutation");

  const secondResult = validateCcacDashboardView(clone());
  expect(secondResult.cloud.total.value).toBe(canonicalValue);
  const firstAccessor = getValidatedCcacDashboardView();
  const secondAccessor = getValidatedCcacDashboardView();
  firstAccessor.cloud.services[0].name = "accessor mutation";
  expect(secondAccessor.cloud.services[0].name).not.toBe("accessor mutation");
  expect(getValidatedCcacDashboardView().cloud.services[0].name).not.toBe("accessor mutation");
});

test("rejects non-JSON values and unsupported object types before cloning", () => {
  for (const invalid of [
    NaN,
    Infinity,
    -Infinity,
    undefined,
    () => "not data",
    Symbol("not data"),
    1n,
    new Date(),
    new Map(),
    new Set(),
  ]) {
    const candidate = clone();
    candidate.source_metadata.invalid_value = invalid;
    reject(candidate);
  }

  const cyclic = clone();
  cyclic.source_metadata.cycle = cyclic;
  reject(cyclic);

  const accessor = clone();
  Object.defineProperty(accessor.source_metadata, "computed", {
    enumerable: true,
    get: () => "not plain data",
  });
  reject(accessor);

  const hostileProxy = new Proxy(clone(), {
    getPrototypeOf: () => { throw new Error("hostile trap"); },
  });
  reject(hostileProxy);
});

test("preserves explicit zero separately from null and its unknown reason", () => {
  const zeroCandidate = clone();
  zeroCandidate.ai.metrics[0].value = "0";
  zeroCandidate.ai.metrics[0].unknown_reason = null;
  const zeroResult = validateCcacDashboardView(zeroCandidate);
  expect(zeroResult.ai.metrics[0].value).toBe("0");
  expect(zeroResult.ai.metrics[0].unknown_reason).toBeNull();

  const nullCandidate = clone();
  nullCandidate.ai.metrics[0].value = null;
  nullCandidate.ai.metrics[0].unknown_reason = "Illustrative value intentionally unavailable";
  const nullResult = validateCcacDashboardView(nullCandidate);
  expect(nullResult.ai.metrics[0].value).toBeNull();
  expect(nullResult.ai.metrics[0].unknown_reason).toBe("Illustrative value intentionally unavailable");
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
