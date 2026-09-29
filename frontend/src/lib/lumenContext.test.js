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

  test("HTML export remains approved and JSON authority projection is deterministic", () => {
    const files = buildCanonicalExportFiles();
    expect(Buffer.byteLength(files.html.content, "utf8")).toBe(26623);
    expect(sha256(files.html.content)).toBe("408b03ac3ce5a6a981575bf6e2a28a22033577183cafbcd3bdd90550922a428c");
    expect(Buffer.byteLength(files.json.content, "utf8")).toBe(113184);
    expect(sha256(files.json.content)).toBe("de21282dec52da9c450b2da00c53ab2148f720cae136f31ccdc1fa57f8db24d0");
    expect(files.json.content).not.toContain("Lumen is not grounded in this report");
  });

  test("no Lumen runtime module imports or requires legacy report data", () => {
    const files = [
      "src/components/AskClaude.jsx",
      "src/lib/lumenPresets.js",
      "src/lib/lumenContext.js",
      "src/lib/lumenContextPortable.mjs",
      "../api/ask-claude.js",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/data\/report\.json|getCloudCapitalReport|TRUSTED_REPORT|projected_next_month|untagged_monthly_cost|total_unused_licenses|estimated_waste/);
    }
  });
});
