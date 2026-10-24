
// Intl formats decimal strings directly, preserving cent rounding even for large totals.
export const money = (value, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
export const endInclusive = (period) => new Date(Date.parse(`${period.end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export const periodLabel = (period) => `${period.start} to ${endInclusive(period)} · ${period.days} ${period.days === 1 ? 'day' : 'days'} · UTC`;
// The dashboard's unavailable sections and local Lumen share these boundaries.
export const BILLING_EVIDENCE_LIMITS = {
  kubernetes: { title: 'Kubernetes cost and utilization', text: 'Your cloud bill can include compute charges, but it does not allocate them to clusters, namespaces or workloads, or show utilization. Workload allocation and usage data are needed for this section.' },
  'ai-spend': { title: 'AI spending detail', text: 'Provider-billed AI charges may appear under Services. This CSV does not separately identify direct AI vendor invoices, models, tokens or usage. Those records are needed for a complete AI spending view.' },
  saas: { title: 'SaaS invoices and seats', text: 'A cloud billing export does not establish your separate SaaS invoices or seat usage. Those records are needed to show SaaS totals and review unused seats.' },
};
// This is intentionally a deterministic local guide. It never calls the sample API.
export function answerBillingQuestion(report, question) {
  const q = question.trim().toLowerCase();
  const cost = (value) => money(value, report.currency);
  const dailyAverage = () => `The supplied net cost averages ${cost(report.current.dailyAverage)} per reporting day over ${report.current.days} days.${report.previous ? ` The earlier upload averages ${cost(report.previous.dailyAverage)} over ${report.previous.days} days.` : ''} This is period total divided by reporting days, not measured daily usage. Check coverage before using it.`;
  if (/forecast|predict|next month|annualiz|saving|waste|utilization|roi|profit|run.?rate|will\b.*\bcost|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b.*\b(?:cost|spend)\b/.test(q)) return `This upload does not establish forecasts, savings, waste, utilization, or business value. ${dailyAverage()} I cannot tell what a future month will cost.`;
  if (/\b(?:correct|right|accurate|accuracy|verify|verified|valid|reconcil|match)\b/.test(q)) return `I can check the supplied arithmetic and the provider control totals listed in “Does this match your bill?” I cannot verify tax correctness, contract rates, credit eligibility or complete invoice coverage from these rows. Check those against your original bill and agreement.`;
  if (/daily average|per day|per reporting day|daily (?:cost|rate|spend)/.test(q)) return dailyAverage();
  if (/delete|cancel|resize|terminate|shut down/.test(q)) return 'I can help you review these billing records. I cannot access or change your cloud account.';
  if (/privacy|\bprivate\b|where.*(?:stored|kept)|where.*files?.*(?:go|live)|(?:send|sent|share|shared).*(?:data|files?|bills?|questions?|ai)|(?:data|files?|bills?|questions?).*(?:send|sent|stored|shared|leave|go to ai)/.test(q)) return report.privacy;
  if (/anomal|spike|unusual|watchdog/.test(q)) {
    const diagnostic = report.pipeline.watchdog;
    const findings = report.findings.filter(finding => finding.producer === 'finops-watchdog');
    return `${findings.map(finding => finding.text).join('\n\n')}${findings.length ? '\n\n' : ''}Watchdog evaluated ${diagnostic.series_evaluated} eligible daily series and produced ${diagnostic.anomalies_detected} anomaly findings. ${diagnostic.insufficient_history_series.length} series need more history; ${diagnostic.excluded_daily_series.length} lack suitable daily evidence. Missing days and monthly charges are not filled in. No finding is not proof that all costs are normal. This is not a savings or root-cause conclusion.`;
  }
  const matches = report.current.services.filter((row) => row.service.length > 2 && q.includes(row.service.toLowerCase()));
  const service = matches.find(row => q.includes(row.provider.toLowerCase())) || (matches.length === 1 ? matches[0] : null);
  if (matches.length > 1 && !service) return `That service appears in more than one provider group: ${matches.map(row => `${row.service} (${row.provider})`).join(', ')}. Include the provider in your question, or review the separate rows in Services.`;
  if (!service) {
    const missingSection = /\b(saas|seats?|software subscriptions?)\b/.test(q) ? 'saas'
      : /\b(kubernetes|k8s|clusters?|namespaces?|pods?|workloads?)\b/.test(q) ? 'kubernetes'
      : /\b(ai|models?|tokens?|llm|anthropic|openai)\b/.test(q) ? 'ai-spend' : null;
    if (missingSection) return `${BILLING_EVIDENCE_LIMITS[missingSection].text} Your cloud total is not a total for this separate category.`;
  }
  if (service && /why|chang|increase|decrease|compar|movement/.test(q)) {
    const driver = report.comparison?.drivers.find((row) => row.key === service.key);
    return driver ? `${service.service} (${service.provider}) changed by ${cost(driver.delta)}, from ${cost(driver.previous)} to ${cost(driver.current)}. ${driver.coverage}. This compares supplied period totals. Billing amounts alone do not establish the cause.${report.comparison.warnings.length ? ` ${report.comparison.warnings.join(' ')}` : ''}`
      : `${service.service} (${service.provider}) has ${cost(service.net)} net cost. No earlier period was supplied, so I cannot measure its change or establish a cause.`;
  }
  if (/why|chang|grew|grow|increase|decrease|compar|movement/.test(q)) return report.findings.filter((finding) => ['What changed', 'Biggest movement', 'Want to know what changed?', 'Before you act'].includes(finding.title)).map((finding) => finding.text).join('\n\n');
  if (/credit|refund|negative|adjustment/.test(q)) return `Positive charges are ${cost(report.current.charges)}. Credits and negative adjustments are ${cost(report.current.credits)}, leaving ${cost(report.current.net)} net. This negative bucket can include refunds, corrections or negative usage, not just promotional credits. Amounts keep their supplied sign. I cannot tell whether they will recur from these amounts alone.`;
  if (/date|period|cover/.test(q)) return `Current records cover ${periodLabel(report.current)}. ${report.current.dateBasis}.${report.previous ? ` Previous records cover ${periodLabel(report.previous)}. ${report.previous.dateBasis}.` : ' No previous period was supplied.'}`;
  if (service) return `${service.service} (${service.provider}) has ${cost(service.net)} net cost: ${cost(service.charges)} in charges and ${cost(service.credits)} in negative adjustments, across ${service.records.toLocaleString()} ${service.records === 1 ? 'record' : 'records'}. These are supplied amounts, not a utilization or root-cause finding.`;
  if (/total|summar|spend|money|biggest|largest|driver|service|cost/.test(q)) return report.findings.filter((finding) => ['Where your money went', 'Largest source of charges', 'No positive charges'].includes(finding.title)).map((finding) => finding.text).join('\n\n');
  return 'I’m a local report guide with prepared answers from this upload. Ask about the total, biggest service, credits, dates, or what changed. More detailed causes need usage or account evidence beyond this CSV.';
}
