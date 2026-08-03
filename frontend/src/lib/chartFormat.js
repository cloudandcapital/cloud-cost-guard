export function formatCompactCurrencyTick(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "$0";
  if (Math.abs(amount) < 1000) return `$${Math.round(amount)}`;
  const thousands = amount / 1000;
  return `$${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
}
