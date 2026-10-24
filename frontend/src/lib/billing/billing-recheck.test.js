import fs from 'fs';
import path from 'path';
import { TextEncoder, TextDecoder } from 'util';
import { normalizeCsv } from './csv';
import { answerBillingQuestion, periodInWords, summaryRowWarning } from './report';
import { buildBillingExports } from './export';
import { nativeBillingReport } from './nativePipelineTestHelper';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const input = rows => 'Date,Service,Cost,Currency\n' + rows.map(([name, amount]) => `2026-09-02,${name},${amount},USD`).join('\n');
const example = () => nativeBillingReport([normalizeCsv(fs.readFileSync(path.join(__dirname, '../../../public/billing/current-example.csv'), 'utf8'), 'current.csv')]);

test.each(['Service total', 'Total USD', 'Monthly total', 'Total for this invoice', 'Total excluding tax', 'Total incl. tax', 'Monthly service total (EUR)', 'Total including VAT', 'Total after credits'])(
  '%s cannot become a second charge', label => {
    expect(() => normalizeCsv(input([['EC2', '100'], ['S3', '20'], ['Tax', '9.60'], [label, '129.60']]))).toThrow(/looks like a total line/);
  }
);

test.each(['Stripe credit card fee', 'Credit card fee (Stripe)', 'Stripe credit-card transaction fees', 'Total Recall API', 'Total API', 'Total tax', 'Total VAT', 'Total tax amount'])(
  'real charge %s keeps its positive amount', label => {
    const report = nativeBillingReport([normalizeCsv(input([[label, '3']]))]);
    expect(report.current.net).toBe('3');
    expect(report.current.rows[0].cost).toBe('3');
  }
);

test('an unfamiliar possible summary stays visible in Lumen, HTML and exact evidence', () => {
  const report = nativeBillingReport([normalizeCsv(input([['EC2', '100'], ['S3', '20'], ['Tax', '9.60'], ['All items combined', '129.60']]), 'bill.csv')]);
  expect(report.current.net).toBe('259.2');
  expect(report.current.rows).toHaveLength(4);
  expect(report.current.potentialSummaryRows).toEqual([{source:'bill.csv', line:5, service:'All items combined'}]);
  expect(summaryRowWarning(report.current)).toContain('All rows are still included');
  expect(answerBillingQuestion(report, 'Does this match my bill?')).toContain('possible total row needs review');
  expect(answerBillingQuestion(report, 'How much did September cost?')).toContain('possible total row needs review');
  const exports = buildBillingExports(report);
  expect(exports.html.content).toContain('Check a possible total row');
  expect(exports.html.content).toContain('All items combined');
  expect(JSON.parse(exports.json.content).current.rows).toHaveLength(4);
});

test('a legitimate half-total charge is warned about without silently changing the bill', () => {
  const report = nativeBillingReport([normalizeCsv(input([['Compute', '100'], ['Storage', '50'], ['Support', '50']]))]);
  expect(report.current.net).toBe('200');
  expect(report.current.rows).toHaveLength(3);
  expect(summaryRowWarning(report.current)).toContain('Real charges can also match');
});

test.each(["What's November going to cost?", 'Estimate next quarter’s bill', 'What should I budget for next year?', 'Can you estimate my future cloud spend?', 'What will my budget be?', 'What will my bill be?', 'Will you explain what November will cost?'])(
  'future question %s gets an explicit forecast limit', question => {
    expect(answerBillingQuestion(example(), question)).toContain('does not establish forecasts');
    expect(answerBillingQuestion(example(), question)).toContain('cannot tell what a future month will cost');
  }
);

test.each(['Will you explain my bill?', 'Will you explain my spending?', 'Could you please explain my bill?', 'Will you summarize my costs?'])(
  'a polite request to explain supplied spending is not a forecast: %s', question => {
    const answer = answerBillingQuestion(example(), question);
    expect(answer).toContain('$1,310.13');
    expect(answer).not.toContain('does not establish forecasts');
  }
);

test('different dates keep the possible-total warning in the dashboard, local answers and print', () => {
  const text = 'Date,EndDate,Service,Cost,Currency\n2026-09-01,2026-10-01,EC2,100,USD\n2026-09-01,2026-10-01,S3,20,USD\n2026-09-30,2026-10-01,Tax,9.60,USD\n2026-09-01,2026-10-01,Amazon Web Services,129.60,USD';
  const report = nativeBillingReport([normalizeCsv(text, 'mixed-dates.csv')]);
  expect(report.current.net).toBe('259.2');
  expect(report.current.rows).toHaveLength(4);
  expect(report.current.potentialSummaryRowCount).toBe(1);
  expect(summaryRowWarning(report.current)).toContain('It matches');
  expect(summaryRowWarning(report.current)).not.toContain('Each matches');
  expect(answerBillingQuestion(report, 'Does this match my bill?')).toContain('Amazon Web Services');
  expect(buildBillingExports(report).html.content).toContain('Amazon Web Services');
});

test('month lookup reads naturally and does not relabel a partial month as a full one', () => {
  const report = example();
  expect(answerBillingQuestion(report, 'How much did September cost?')).toContain('$1,310.13 net for September 2026');
  expect(periodInWords({start:'2026-09-02', end:'2026-09-03', days:1})).toBe('Sep 2, 2026');
  expect(periodInWords({start:'2026-09-02', end:'2026-09-11', days:9})).toBe('Sep 2, 2026 to Sep 10, 2026');
});

test('the local anomaly answer keeps the producer-owned new-spending title', () => {
  const header='ChargePeriodStart,ChargePeriodEnd,ServiceName,BilledCost,BillingCurrency,ProviderName,BillingPeriodStart,BillingPeriodEnd\n';
  const rows=Array.from({length:30},(_,i)=>`${new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10)},${new Date(Date.UTC(2026,8,i+2)).toISOString().slice(0,10)},S3,${i===20?50:0},USD,AWS,2026-09-01,2026-10-01`).join('\n');
  const report=nativeBillingReport([normalizeCsv(header+rows)]);
  const answer=answerBillingQuestion(report,'Did Watchdog find a spike?');
  expect(answer).toContain('New S3 spending on Sep 21, 2026');
  expect(answer).toContain('cost $50.00');
  expect(answer).toContain('median was $0.00');
  expect(answer).not.toContain('spending drop');
});
