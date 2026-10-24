const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { expectExactPageOverflow } = require('./helpers');
const file = text => ({ name: 'audit.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const review = page => page.getByRole('button', { name: 'Review my bill', exact: true }).click();
async function google(page, text) {
  await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(file(text));
  await page.getByLabel('Invoice month', { exact: true }).fill('2026-09');
  await page.getByLabel('Billing currency', { exact: true }).fill('USD');
  await page.getByRole('button', { name: 'Use these bill details', exact: true }).click();
}

test.beforeEach(async ({ page }) => { await page.goto('/'); });
test.afterEach(async ({ page }) => { await expectExactPageOverflow(page); });

test('quick example is the actual local bill review, including daily average and downloads', async ({ page }, info) => {
  const outbound = [];
  page.on('request', request => { if (request.method() !== 'GET') outbound.push(request.url()); });
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await expect(page.getByTestId('billing-report')).toBeVisible();
  await expect(page.getByTestId('billing-net-total')).toHaveText('$1,310.13');
  await expect(page.getByRole('region', { name: 'Example data', exact: true })).toContainText('Invented bills');
  await expect(page.locator('.billing-daily-average')).toContainText('$43.67');
  await expect(page.getByTestId('primary-tabs').getByRole('tab')).toHaveCount(4);
  await expect(page.getByTestId('billing-bill-checks')).toContainText('No provider control total was supplied');
  await page.screenshot({ path: info.outputPath('audit-sample-bill.png'), fullPage: true });
  await page.getByTestId('executive-summary').screenshot({ path: info.outputPath('audit-bill-summary.png') });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Evidence JSON', exact: true }).click()]);
  const path = info.outputPath(download.suggestedFilename()); await download.saveAs(path);
  const evidence = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(evidence.example).toBe(true);
  expect(evidence.current.dailyAverage).toBe('43.670833333333333333');
  for (const artifact of Object.values(evidence.pipeline.artifacts)) expect(JSON.parse(artifact).mode).toBe('illustrative');
  await page.getByTestId('lumen-trigger').click();
  const input = page.getByLabel('Ask Lumen about your uploaded report');
  await input.fill('What is my run rate and what will October cost?'); await input.press('Enter');
  await expect(page.getByTestId('lumen-panel')).toContainText('cannot tell what a future month will cost');
  await input.fill('Is my tax amount correct?'); await input.press('Enter');
  await expect(page.getByTestId('lumen-panel')).toContainText('cannot verify tax correctness');
  expect(outbound).toEqual([]);
});

test('Google Count once cannot break its control and header difference stays visible', async ({ page }, info) => {
  await google(page, 'Invoice total,5000\nCurrency,USD\nService description,Cost type,Unrounded cost,Cost\nCompute,Usage,50.004,50\nCompute,Usage,50.004,50\n,Tax,9,9\n,Total,,109.01');
  await page.getByText('Identical rows', { exact: true }).click();
  await page.getByLabel('Identical rows without a RecordId').selectOption('drop');
  await review(page);
  await expect(page.getByRole('alert')).toContainText("Google's Total says 109.01");
  await expect(page.getByTestId('billing-report')).toHaveCount(0);
  await page.getByLabel('Identical rows without a RecordId').selectOption('keep');
  await review(page);
  await expect(page.getByTestId('billing-net-total')).toHaveText('$109.01');
  const checks = page.getByTestId('billing-bill-checks');
  await expect(checks).toContainText('Matches the supplied rows');
  await expect(checks).toContainText('A total needs your attention');
  await expect(checks).toContainText('$5,000.00');
  await page.screenshot({ path: info.outputPath('audit-google-controls.png'), fullPage: true });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Printable report', exact: true }).click()]);
  const path = info.outputPath(download.suggestedFilename()); await download.saveAs(path);
  const html = fs.readFileSync(path, 'utf8');
  expect(html).toContain('A total needs your attention');
  expect(html).toContain('$5,000.00');
  expect(download.suggestedFilename()).toContain('2026-09-01-to-2026-09-30');
});

test('template total lines stop while monthly totals need an explicit date choice', async ({ page }, info) => {
  await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(file('Date,Service,Cost,Currency\n2026-09-01,EC2,100,USD\n2026-09-01,S3,20,USD\n2026-09-01,Tax,9.60,USD\n2026-09-01,Total,129.60,USD'));
  await expect(page.getByRole('alert')).toContainText('looks like a total line');
  await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
  await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(file('Date,Service,Cost,Currency,EndDate\n2026-09-01,Compute,300,USD,'));
  await expect(page.getByRole('heading', { name: 'Are these monthly totals?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'They cover the whole month', exact: true }).click();
  await review(page);
  await expect(page.getByTestId('billing-net-total')).toHaveText('$300.00');
  await expect(page.locator('.billing-daily-average')).toContainText('$10.00');
  await expect(page.getByTestId('executive-summary')).toContainText('30 days');
  await page.screenshot({ path: info.outputPath('audit-monthly-template.png'), fullPage: true });
  await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
});
