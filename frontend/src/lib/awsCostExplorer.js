export function getAwsCostExplorerDailyRange(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;

  const instant = timestamp instanceof Date
    ? new Date(timestamp.getTime())
    : new Date(timestamp);

  if (Number.isNaN(instant.getTime())) return null;

  const start = instant.toISOString().slice(0, 10);
  const endInstant = new Date(Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate() + 1,
  ));

  return { start, end: endInstant.toISOString().slice(0, 10) };
}

export function buildAwsCostExplorerDailyCommand(timestamp) {
  const range = getAwsCostExplorerDailyRange(timestamp);
  if (!range) return null;

  return `aws ce get-cost-and-usage --time-period Start=${range.start},End=${range.end} --granularity DAILY --metrics BlendedCost --group-by Type=DIMENSION,Key=SERVICE`;
}
