const CLOUD_TOTAL = 33479.45;
const AI_TOTAL = 892.40;
const SAAS_TOTAL = 1580.00;

export const SAAS_NORMALIZATION_NOTE =
  "SaaS subscription charges are normalized evenly across the completed 30-day window for comparison.";

// A deterministic sample-company narrative, not a generated wave: weekdays follow
// workload volume, weekends retain imperfect baseline usage, deployments/batches add
// modest increases, and July 28 includes the documented Amazon EC2 anomaly followed
// by a partial return toward baseline.
const CLOUD_DAILY_SHAPE = [
  1035, 1018, 820, 785, 1025, 1048, 1120, 1060, 1040, 835,
  805, 1068, 1150, 1085, 1075, 1060, 850, 820, 1090, 1110,
  1180, 1125, 1105, 875, 850, 1130, 1879.13, 1420, 1210, 1155,
];

const AI_DAILY_SHAPE = [
  31, 29, 17, 15, 32, 34, 39, 36, 33, 19,
  16, 35, 42, 38, 34, 32, 18, 16, 37, 40,
  45, 36, 34, 20, 17, 39, 48, 43, 37, 33,
];

const SAAS_DAILY_SHAPE = [
  52.5, 52.6, 52.5, 52.5, 52.6, 52.7, 52.6, 52.7, 52.6, 52.5,
  52.5, 52.6, 52.7, 52.6, 52.7, 52.6, 52.5, 52.5, 52.7, 52.6,
  52.7, 52.6, 52.7, 52.5, 52.5, 52.7, 52.8, 52.7, 52.6, 52.7,
];

const round = (value) => Number(value.toFixed(2));

function reconcile(values, total, locked = null) {
  const lockedIndex = locked?.index ?? -1;
  const lockedValue = locked?.value ?? 0;
  const sourceTotal = values.reduce((sum, value, index) => (
    index === lockedIndex ? sum : sum + value
  ), 0);
  const target = total - lockedValue;
  const result = values.map((value, index) => (
    index === lockedIndex ? lockedValue : round((value / sourceTotal) * target)
  ));
  const adjustmentIndex = result.length - 1 === lockedIndex ? result.length - 2 : result.length - 1;
  const difference = round(total - result.reduce((sum, value) => sum + value, 0));
  result[adjustmentIndex] = round(result[adjustmentIndex] + difference);
  return result;
}

function buildDates() {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, 2 + index));
    return date.toISOString().slice(0, 10);
  });
}

export function getIllustrativeSpendScenario() {
  const dates = buildDates();
  const cloud = reconcile(CLOUD_DAILY_SHAPE, CLOUD_TOTAL, { index: 26, value: 1879.13 });
  const ai = reconcile(AI_DAILY_SHAPE, AI_TOTAL);
  const saas = reconcile(SAAS_DAILY_SHAPE, SAAS_TOTAL);

  return dates.map((dateISO, index) => {
    const row = {
      dateISO,
      cloud: cloud[index],
      ai: ai[index],
      saas: saas[index],
      total: round(cloud[index] + ai[index] + saas[index]),
    };

    if (dateISO === "2026-07-28") {
      row.event = "Amazon EC2 spend spike";
      row.amazonEc2 = {
        baseline: 482.35,
        current: 1226.48,
        increase: 744.13,
        changePercentage: 154.3,
      };
    }
    return row;
  });
}

export const ILLUSTRATIVE_SPEND_TOTALS = {
  cloud: CLOUD_TOTAL,
  ai: AI_TOTAL,
  saas: SAAS_TOTAL,
  total: 35951.85,
};
