import { decimalString, decimalUnits, preparePeriod } from './csv';

// Intl formats decimal strings directly, preserving cent rounding even for large totals.
export const money = (value, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
export const endInclusive = (period) => new Date(Date.parse(`${period.end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export const periodLabel = (period) => `${period.start} to ${endInclusive(period)} · ${period.days} ${period.days === 1 ? 'day' : 'days'} · UTC`;
const absolute = (value) => value < 0n ? -value : value;
const compare = (a, b) => a > b ? -1 : a < b ? 1 : 0;
const percent = (part, whole) => {
  if (whole <= 0n) return null;
  const tenths = (absolute(part) * 1000n + whole / 2n) / whole;
  return `${part < 0n ? '-' : ''}${tenths / 10n}.${tenths % 10n}`;
};
export const summarizeBillingPeriod = (period) => {
  let charges = 0n, credits = 0n;
  const services = new Map(), daily = new Map();
  for (const row of period.rows) {
    const units = decimalUnits(row.cost);
    if (units >= 0n) charges += units; else credits += units;
    const key = JSON.stringify([row.provider, row.service]);
    if (!services.has(key)) services.set(key, { key, provider: row.provider, service: row.service, net: 0n, charges: 0n, credits: 0n, records: 0 });
    const service = services.get(key);
    service.net += units; service.records += 1;
    if (units >= 0n) service.charges += units; else service.credits += units;
    const date = row.start.slice(0, 10);
    daily.set(date, (daily.get(date) || 0n) + units);
  }
  if (charges > decimalUnits('1000000000000') || -credits > decimalUnits('1000000000000')) throw new Error('This period exceeds the supported total of one trillion in charges or credits. Export a smaller period.');
  return {
    ...period,
    net: decimalString(charges + credits), charges: decimalString(charges), credits: decimalString(credits),
    services: [...services.values()].sort((a, b) => compare(a.net, b.net) || a.key.localeCompare(b.key)).map((service) => ({
      ...service, net: decimalString(service.net), charges: decimalString(service.charges), credits: decimalString(service.credits),
      chargeShare: percent(service.charges, charges),
    })),
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, units]) => ({ date, cost: decimalString(units) })),
  };
};

export function buildBillingReport(currentFiles, previousFiles = [], options = {}) {
  const current = summarizeBillingPeriod(preparePeriod(currentFiles, options.current));
  let previous = null, comparison = null;
  if (previousFiles.length) {
    previous = summarizeBillingPeriod(preparePeriod(previousFiles, options.previous));
    if (current.currency !== previous.currency) throw new Error(`The periods use ${current.currency} and ${previous.currency}. Choose the same currency for both; no exchange rates are applied.`);
    if (previous.end > current.start) throw new Error('The previous period must end before the current period begins. These dates overlap or are reversed. Choose separate, earlier comparison records.');
    const delta = decimalUnits(current.net) - decimalUnits(previous.net);
    const keys = new Set([...current.services, ...previous.services].map((row) => row.key));
    const currentByKey = new Map(current.services.map((row) => [row.key, row]));
    const previousByKey = new Map(previous.services.map((row) => [row.key, row]));
    const drivers = [...keys].map((key) => {
      const now = currentByKey.get(key), before = previousByKey.get(key);
      const change = decimalUnits(now?.net || '0') - decimalUnits(before?.net || '0');
      return {
        key, service: (now || before).service, provider: (now || before).provider,
        current: now?.net || '0', previous: before?.net || '0', delta: decimalString(change),
        coverage: !before ? 'Not in previous upload' : !now ? 'Not in current upload' : 'In both uploads',
      };
    }).sort((a, b) => compare(absolute(decimalUnits(a.delta)), absolute(decimalUnits(b.delta))) || a.key.localeCompare(b.key));
    const warnings = [];
    if (current.days !== previous.days) warnings.push(`The periods cover ${current.days} and ${previous.days} days. Changes compare period totals, not daily spending rates.`);
    const providers = (period) => [...new Set(period.rows.map((row) => row.provider))].sort().join(', ');
    if (providers(current) !== providers(previous)) warnings.push('Provider coverage differs between uploads. An absent service or provider means no records were supplied, not that it was switched on or off.');
    comparison = { delta: decimalString(delta), percent: percent(delta, decimalUnits(previous.net)), drivers, warnings };
  }
  const currency = current.currency;
  const cost = (value) => money(value, currency);
  const largest = current.services[0];
  const findings = [{
    title: 'Where your money went',
    text: `${cost(current.net)} net cost comes from ${cost(current.charges)} in positive charges and ${cost(current.credits)} in credits or negative adjustments across ${current.rows.length} records.`,
  }];
  if (decimalUnits(current.charges) > 0n) {
    const leader = [...current.services].sort((a, b) => compare(decimalUnits(a.charges), decimalUnits(b.charges)))[0];
    findings.push({ title: 'Largest source of charges', text: `${leader.service} (${leader.provider}) accounts for ${leader.chargeShare}% of positive charges: ${cost(leader.charges)} before credits. Its net cost is ${cost(leader.net)}.` });
  } else findings.push({ title: 'No positive charges', text: 'These records contain only credits, zero costs, or negative adjustments. There is no positive spending share to calculate.' });
  if (comparison) {
    const delta = decimalUnits(comparison.delta);
    const changeText = delta === 0n ? 'Net cost is unchanged from the previous upload' : `Net cost is ${cost(decimalString(absolute(delta)))} ${delta > 0n ? 'higher' : 'lower'} than the previous upload`;
    findings.push({ title: 'What changed', text: `${changeText}${comparison.percent !== null ? ` (${comparison.percent}%)` : '. A percentage is not meaningful when the previous net cost is zero or negative'}.${comparison.warnings.length ? ` ${comparison.warnings.join(' ')}` : ''}` });
    const driver = comparison.drivers.find((row) => row.delta !== '0');
    if (driver) findings.push({ title: 'Biggest movement', text: `${driver.service} (${driver.provider}) changed by ${cost(driver.delta)}, from ${cost(driver.previous)} to ${cost(driver.current)}. ${driver.coverage}. This locates the change; billing amounts alone do not establish its cause.` });
  } else findings.push({ title: 'Want to know what changed?', text: 'Add an earlier billing CSV to compare totals and service costs. With one upload, there is no measured increase, decrease, or anomaly baseline.' });
  findings.push({ title: 'Before you act', text: 'These are the records you supplied, not a verified invoice or a savings estimate. Check the period, account coverage, and billed-cost basis against your provider bill. Utilization, pricing changes, and business activity are needed to explain why costs moved.' });
  return {
    schema: 'cloud-cost-guard.billing-upload.v1', source: 'uploaded', currency, current, previous, comparison, findings,
    largestService: largest?.service || null,
    privacy: 'Calculated in this browser. Billing files and Lumen questions are not sent to a server or AI service. Data is kept in memory until you clear it, switch to the example, reload, or close this tab.',
    costBasis: 'Sum of supplied signed Cost or FOCUS BilledCost values. Negative amounts reduce the total. No conversion, amortization, tax, or credit is inferred or added. This is not a full FOCUS conformance check.',
  };
}

// This is intentionally a deterministic local guide. It never calls the sample API.
export function answerBillingQuestion(report, question) {
  const q = question.trim().toLowerCase();
  const cost = (value) => money(value, report.currency);
  if (/forecast|predict|next month|annualiz|saving|waste|utilization|roi|profit/.test(q)) return 'This upload does not establish forecasts, savings, waste, utilization, or business value. I can explain the recorded costs, credits, service breakdown, and comparison you supplied.';
  if (/delete|cancel|resize|terminate|shut down/.test(q)) return 'I can help you review these billing records. I cannot access or change your cloud account.';
  if (/privacy|send|upload|store|ai service/.test(q)) return report.privacy;
  if (/why|chang|grew|grow|increase|decrease|compar|movement/.test(q)) return report.findings.filter((finding) => ['What changed', 'Biggest movement', 'Want to know what changed?', 'Before you act'].includes(finding.title)).map((finding) => finding.text).join('\n\n');
  if (/credit|refund|negative|adjustment/.test(q)) return `Positive charges are ${cost(report.current.charges)}. Credits and negative adjustments are ${cost(report.current.credits)}, leaving ${cost(report.current.net)} net. Credits keep their supplied sign. I cannot tell whether a credit will recur from these amounts alone.`;
  if (/date|period|cover/.test(q)) return `Current records cover ${periodLabel(report.current)}. ${report.current.dateBasis}.${report.previous ? ` Previous records cover ${periodLabel(report.previous)}. ${report.previous.dateBasis}.` : ' No previous period was supplied.'}`;
  const service = report.current.services.find((row) => row.service.length > 2 && q.includes(row.service.toLowerCase()));
  if (service) return `${service.service} (${service.provider}) has ${cost(service.net)} net cost: ${cost(service.charges)} in charges and ${cost(service.credits)} in negative adjustments, across ${service.records} records. These are supplied amounts, not a utilization or root-cause finding.`;
  if (/total|summar|spend|money|biggest|largest|driver|service|cost/.test(q)) return report.findings.filter((finding) => ['Where your money went', 'Largest source of charges', 'No positive charges'].includes(finding.title)).map((finding) => finding.text).join('\n\n');
  return 'I’m a local report guide with prepared answers from this upload. Ask about the total, biggest service, credits, dates, or what changed. More detailed causes need usage or account evidence beyond this CSV.';
}
