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

test.each(['Service total', 'Total USD', 'Monthly total', 'Total for this invoice', 'Total excluding tax', 'Total incl. tax', 'Monthly service total (EUR)', 'Total including VAT'])(
  '%s cannot become a second charge', label => {
    expect(() => normalizeCsv(input([['EC2', '100'], ['S3', '20'], ['Tax', '9.60'], [label, '129.60']]))).toThrow(/looks like a total line/);
  }
);

test.each(['Stripe credit card fee', 'Credit card fee (Stripe)', 'Stripe credit-card transaction fees', 'Total Recall API', 'Total API'])(
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

test.each(["What's November going to cost?", 'Estimate next quarter’s bill', 'What should I budget for next year?', 'Can you estimate my future cloud spend?'])(
  'future question %s gets an explicit forecast limit', question => {
    expect(answerBillingQuestion(example(), question)).toContain('does not establish forecasts');
    expect(answerBillingQuestion(example(), question)).toContain('cannot tell what a future month will cost');
  }
);

test('month lookup reads naturally and does not relabel a partial month as a full one', () => {
  const report = example();
  expect(answerBillingQuestion(report, 'How much did September cost?')).toContain('$1,310.13 net for September 2026');
  expect(periodInWords({start:'2026-09-02', end:'2026-09-03', days:1})).toBe('Sep 2, 2026');
  expect(periodInWords({start:'2026-09-02', end:'2026-09-11', days:9})).toBe('Sep 2, 2026 to Sep 10, 2026');
});
