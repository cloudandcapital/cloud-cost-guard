import {
  buildAwsCostExplorerDailyCommand,
  getAwsCostExplorerDailyRange,
} from "./awsCostExplorer";

describe("AWS Cost Explorer daily ranges", () => {
  test("uses an exclusive end date for the finding day", () => {
    expect(getAwsCostExplorerDailyRange("2026-07-31T16:00:00Z")).toEqual({
      start: "2026-07-31",
      end: "2026-08-01",
    });
    expect(buildAwsCostExplorerDailyCommand("2026-07-31T16:00:00Z")).toContain(
      "Start=2026-07-31,End=2026-08-01",
    );
  });

  test.each([
    ["2026-01-31T23:59:59Z", { start: "2026-01-31", end: "2026-02-01" }],
    ["2026-12-31T23:59:59Z", { start: "2026-12-31", end: "2027-01-01" }],
  ])("handles UTC month and year rollover for %s", (timestamp, expected) => {
    expect(getAwsCostExplorerDailyRange(timestamp)).toEqual(expected);
  });

  test.each([undefined, null, "", "not-a-timestamp"])(
    "does not generate a command for invalid input %p",
    (timestamp) => {
      expect(getAwsCostExplorerDailyRange(timestamp)).toBeNull();
      expect(buildAwsCostExplorerDailyCommand(timestamp)).toBeNull();
    },
  );
});
