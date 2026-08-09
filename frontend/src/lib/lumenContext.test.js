import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { buildCanonicalExportFiles } from "./canonicalExport";
import { getCcac11PresentationModel } from "./ccac11PresentationModel";
import { buildCanonicalLumenContext, serializeCanonicalLumenContext } from "./lumenContext";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

describe("unified canonical Lumen grounding", () => {
  test("React, exports, and Lumen resolve to one canonical identity and source hash", () => {
    const model = getCcac11PresentationModel();
    const context = buildCanonicalLumenContext();
    const evidence = JSON.parse(buildCanonicalExportFiles().json.content);
    expect(context.identity.report_id).toBe(model.identity.report_id);
    expect(context.identity.report_id).toBe(evidence.identity.report_id);
    expect(context.identity.source_report_sha256).toBe(model.identity.source_report_sha256);
    expect(context.identity.source_report_sha256).toBe(evidence.identity.source_report_sha256);
  });

  test("context is deterministic, exact-string based, and carries compact trust boundaries", () => {
    expect(serializeCanonicalLumenContext()).toBe(serializeCanonicalLumenContext());
    const context = buildCanonicalLumenContext();
    expect(context.technology_spend.total.value).toBe("2939.0525");
    expect(context.technology_spend.scopes.map(({ value }) => value)).toEqual(["2194.0", "8.2825", "736.77"]);
    expect(context.technology_spend.reconciliation).toMatchObject({ status: "passed", difference: "0.0" });
    expect(context.ai).toMatchObject({ broader_domain_additivity: "non_additive" });
    expect(context.resilience.recoverability).toBe("not_demonstrated");
    expect(context.human_review.automatic_actions).toBe(false);
    expect(JSON.stringify(context)).not.toContain("displayValue");
  });

  test("PR #15 export bytes remain exactly approved", () => {
    const files = buildCanonicalExportFiles();
    expect(Buffer.byteLength(files.html.content, "utf8")).toBe(26623);
    expect(sha256(files.html.content)).toBe("408b03ac3ce5a6a981575bf6e2a28a22033577183cafbcd3bdd90550922a428c");
    expect(Buffer.byteLength(files.json.content, "utf8")).toBe(113115);
    expect(sha256(files.json.content)).toBe("46c9b1b6a41960a479159ce111ee034d81ead4174c65341349fd0dd12e74f0f7");
  });

  test("no Lumen runtime module imports or requires legacy report data", () => {
    const files = [
      "src/components/AskClaude.jsx",
      "src/lib/lumenPresets.js",
      "src/lib/lumenContext.js",
      "src/lib/lumenContextPortable.js",
      "../api/ask-claude.js",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/data\/report\.json|getCloudCapitalReport|TRUSTED_REPORT|projected_next_month|untagged_monthly_cost|total_unused_licenses|estimated_waste/);
    }
  });
});
