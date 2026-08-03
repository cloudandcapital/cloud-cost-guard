import { buildDeterministicSeries } from "./demoSeries";

describe("buildDeterministicSeries", () => {
  test("creates a fixed date range whose values reconcile to the supplied total", () => {
    const rows = buildDeterministicSeries({
      total: 33479.45,
      days: 30,
      endDate: "2026-07-31",
    });

    expect(rows).toHaveLength(30);
    expect(rows[0].dateISO).toBe("2026-07-02");
    expect(rows[29].dateISO).toBe("2026-07-31");
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(33479.45, 2);
  });

  test("returns identical data for identical inputs", () => {
    const input = { total: 892.4, days: 30, endDate: "2026-07-31", phase: 4 };
    expect(buildDeterministicSeries(input)).toEqual(buildDeterministicSeries(input));
  });

  test("rejects an invalid end date", () => {
    expect(() => buildDeterministicSeries({ total: 10, days: 3, endDate: "not-a-date" })).toThrow();
  });
});
