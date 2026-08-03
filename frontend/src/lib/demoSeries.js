export function buildDeterministicSeries({ total, days, endDate, phase = 0 }) {
  const safeDays = Math.max(1, Number(days) || 1);
  const safeTotal = Math.max(0, Number(total) || 0);
  const end = new Date(`${endDate}T12:00:00Z`);

  if (Number.isNaN(end.getTime())) {
    throw new Error(`Invalid demo series end date: ${endDate}`);
  }

  const weights = Array.from({ length: safeDays }, (_, index) => {
    const weeklyPattern = [0.91, 0.97, 1.04, 1.08, 1.02, 0.99, 0.86][index % 7];
    const wave = 1 + (0.045 * Math.sin((index + phase) / 3.2));
    return weeklyPattern * wave;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  const rows = weights.map((weight, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (safeDays - 1 - index));
    return {
      dateISO: date.toISOString().slice(0, 10),
      amount: Number(((safeTotal * weight) / weightTotal).toFixed(2)),
    };
  });

  const roundedTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  rows[rows.length - 1].amount = Number((rows[rows.length - 1].amount + safeTotal - roundedTotal).toFixed(2));
  return rows;
}
