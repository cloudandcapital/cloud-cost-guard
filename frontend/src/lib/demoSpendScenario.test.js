import {
  getIllustrativeSpendScenario,
  ILLUSTRATIVE_SPEND_TOTALS,
  SAAS_NORMALIZATION_NOTE,
} from "./demoSpendScenario";
import report from "../data/report.json";

const sum = (rows, key) => Number(rows.reduce((total, row) => total + row[key], 0).toFixed(2));

describe("illustrative daily spend scenario", () => {
  test("each scope and the combined series reconcile to displayed totals", () => {
    const rows = getIllustrativeSpendScenario();
    expect(sum(rows, "cloud")).toBe(ILLUSTRATIVE_SPEND_TOTALS.cloud);
    expect(sum(rows, "ai")).toBe(ILLUSTRATIVE_SPEND_TOTALS.ai);
    expect(sum(rows, "saas")).toBe(ILLUSTRATIVE_SPEND_TOTALS.saas);
    expect(sum(rows, "total")).toBe(ILLUSTRATIVE_SPEND_TOTALS.total);
    expect(ILLUSTRATIVE_SPEND_TOTALS).toEqual({
      cloud: report.cost_baseline.total_cost,
      ai: report.ai_spend.total_cost,
      saas: report.saas_spend.total_cost,
      total: report.combined_spend.total_cost,
    });
  });

  test("July 28 carries the documented EC2 spike and a partial recovery", () => {
    const rows = getIllustrativeSpendScenario();
    const spikeIndex = rows.findIndex((row) => row.dateISO === "2026-07-28");
    const spike = rows[spikeIndex];
    expect(spike.amazonEc2).toEqual({
      baseline: 482.35,
      current: 1226.48,
      increase: 744.13,
      changePercentage: 154.3,
    });
    expect(spike.amazonEc2).toEqual({
      baseline: report.anomalies.recent[0].baseline,
      current: report.anomalies.recent[0].current,
      increase: report.anomalies.recent[0].delta,
      changePercentage: report.anomalies.recent[0].delta_pct,
    });
    expect(spike.cloud).toBeGreaterThan(rows[spikeIndex - 1].cloud);
    expect(rows[spikeIndex + 1].cloud).toBeLessThan(spike.cloud);
    expect(rows[spikeIndex + 1].cloud).toBeGreaterThan(rows[spikeIndex - 1].cloud);
  });

  test("dates are complete, ordered, and unique", () => {
    const dates = getIllustrativeSpendScenario().map((row) => row.dateISO);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-07-02");
    expect(dates[29]).toBe("2026-07-31");
    expect(new Set(dates).size).toBe(30);
    expect([...dates].sort()).toEqual(dates);
  });

  test("contains no negative or invalid values", () => {
    for (const row of getIllustrativeSpendScenario()) {
      for (const key of ["cloud", "ai", "saas", "total"]) {
        expect(Number.isFinite(row[key])).toBe(true);
        expect(row[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("is deterministic and documents normalized SaaS allocation", () => {
    expect(getIllustrativeSpendScenario()).toEqual(getIllustrativeSpendScenario());
    expect(SAAS_NORMALIZATION_NOTE).toMatch(/normalized/i);
  });
});
