const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { expectExactPageOverflow, expectNoBrokenDisplayValues } = require('./helpers');

const csv = (name) => path.resolve(__dirname, `../public/billing/${name}-example.csv`);
const payload = (text, name = 'billing.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
const one = (amount = '7.25', currency = 'USD', service = 'Only my service') => `Date,Service,Cost,Currency\n2026-10-01,${service},${amount},${currency}`;
async function analyze(page, comparison = false) {
  await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(csv('current'));
  if (comparison) await page.getByLabel('Previous billing CSV files', { exact: true }).setInputFiles(csv('previous'));
  await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
  await expect(page.getByTestId('billing-report')).toBeVisible();
}
async function checkNoSample(page) {
  const body = await page.locator('body').innerText();
  for (const value of ['2939.0525', '2,939.05', '2,194.00', '736.77', '8.2825', 'Top canonical anomaly']) expect(body).not.toContain(value);
}
async function openSection(page, value, label) {
  await expect(page.getByTestId('billing-report')).toBeVisible();
  const mobile = page.getByTestId('mobile-section-select');
  if (await mobile.isVisible()) await mobile.selectOption(value);
  else await page.getByRole('tab', { name: label, exact: true }).click();
}

test.describe('browser-local billing upload experience', () => {
  let problems;
  test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
    await page.goto('/');
  });
  test.afterEach(async ({ page }) => {
    await expectNoBrokenDisplayValues(page);
    await expectExactPageOverflow(page);
    expect(problems).toEqual([]);
  });

  test('Gzip provider data asks for UTC then reconciles exact totals and exports', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(path.resolve(__dirname, '../../tests/fixtures/provider-inputs/focus-sample-1000.csv.gz'));
    await expect(page.getByRole('alert')).toContainText('has no timezone');
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Yes, these timestamps are UTC', exact: true }).click();
    await expect(page.getByText('You confirmed UTC for timestamps without a timezone. Choose the files again to change this.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-report')).toBeVisible();
    await expect(page.getByText('Exact: USD 20.52022672899', { exact: true })).toBeVisible();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$20.52');
    await checkNoSample(page);
    await page.getByRole('button', { name: 'Export uploaded report', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('canonical-export-json').click()]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(evidence.current.net).toBe('20.52022672899');
    expect(evidence.current.timestampBasis).toBe('UTC');
    const source = JSON.parse(evidence.pipeline.artifacts['finops-lite.json']);
    expect(source.inputs[0].content_sha256).toBe('e91e5ac7edf01ed2c9d926f37ef7dc1ae2aae97956fea8da6c9ee488b1c2839e');
    expect(source.inputs[0].mapping_notes.join(' ')).toContain('confirmed UTC');
    await openSection(page, 'clouds', 'Clouds');
    await expect(page.getByText('AWS', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Microsoft', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Oracle', { exact: true }).first()).toBeVisible();
  });

  test('Google Cost table confirms invoice context and preserves exact evidence without a daily chart', async ({ page }, testInfo) => {
    const sourcePath = path.resolve(__dirname, '../../tests/fixtures/provider-inputs/google-cost-table-document.csv');
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles({name:'Invented billing account_Cost table, 2026-09-01 — 2026-09-30.csv',mimeType:'text/csv',buffer:fs.readFileSync(sourcePath)});
    await expect(page.getByRole('heading', { name: 'A quick check for your Google bill', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
    await page.getByLabel('Invoice month', { exact: true }).fill('2026-09');
    await page.getByLabel('Billing currency', { exact: true }).fill('USD');
    await expectExactPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('google-bill-details.png'), fullPage: true });
    await page.getByRole('button', { name: 'Use these bill details', exact: true }).click();
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-report')).toBeVisible();
    await expect(page.getByText('Exact: USD 108.830007', { exact: true })).toBeVisible();
    await checkNoSample(page);
    await openSection(page, 'clouds', 'Clouds');
    await expect(page.getByTestId('billing-invoice-month-view')).toBeVisible();
    await expect(page.getByTestId('billing-date-chart')).toHaveCount(0);
    await expectExactPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('google-invoice-month.png'), fullPage: true });
    await page.getByRole('button', { name: 'Export uploaded report', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('canonical-export-json').click()]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(evidence.current.rows).toHaveLength(6);
    expect(evidence.current.sourceRowCount).toBe(7);
    expect(evidence.current.net).toBe('108.830007');
    const source = JSON.parse(evidence.pipeline.artifacts['finops-lite.json']);
    expect(source.inputs[0].content_sha256).toBe(require('node:crypto').createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'));
    expect(source.inputs[0].mapping_notes.join(' ')).toContain('confirmed invoice month 2026-09 and billing currency USD');
    expect(source.inputs[0].mapping_notes.join(' ')).toContain('4 invoice/statement header rows');
    await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
  });

  test('provider-published Microsoft file opens with minute-precision UTC and exact credits', async ({ page }, testInfo) => {
    const sourcePath = path.resolve(__dirname, '../../tests/fixtures/provider-inputs/microsoft-ea-focus-1000.csv.gz');
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(sourcePath);
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-report')).toBeVisible();
    await expect(page.getByText('Exact: USD 83.346183636400141', { exact: true })).toBeVisible();
    await expectExactPageOverflow(page);
    await page.screenshot({path:testInfo.outputPath('azure-published-report.png'),fullPage:true});
    await checkNoSample(page);
    await page.getByRole('button', { name: 'Export uploaded report', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('canonical-export-json').click()]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(evidence.current.rows).toHaveLength(1000);
    expect(evidence.current.net).toBe('83.346183636400141');
    const source = JSON.parse(evidence.pipeline.artifacts['finops-lite.json']);
    expect(source.inputs[0].content_sha256).toBe('5766878f44ac4a143a6c45c401ab2bd736876ca2ff70a290a82d25dd2344d6ed');
    await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
  });

  test('starts with upload instructions, working templates and an optional example', async ({ page }, testInfo) => {
    await expect(page.getByTestId('billing-upload')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
    await checkNoSample(page);
    const template = await page.request.get('/billing/template.csv');
    expect(template.status()).toBe(200);
    expect(await template.text()).toContain('Date,Service,Cost,Currency');
    await page.getByText('What can I upload? Export instructions & CSV format', { exact: true }).click();
    await expect(page.getByText('Get your billing records', { exact: true })).toBeVisible();
    await page.getByText('What can I upload? Export instructions & CSV format', { exact: true }).click();
    if (testInfo.project.name !== 'tablet-768x1024') await expect(page).toHaveScreenshot('billing-upload.png', { fullPage: true });
  });

  test('reconciles current spending, negative adjustments, services, charts and missing baseline', async ({ page }, testInfo) => {
    await analyze(page);
    await expect(page.getByTestId('billing-net-total')).toHaveText('$1,310.13');
    await expect(page.getByTestId('billing-charges')).toHaveText('$1,362.38');
    await expect(page.getByTestId('billing-credits')).toHaveText('-$52.25');
    await expect(page.getByTestId('billing-comparison')).toContainText('Add an earlier bill');
    await expect(page.getByTestId('approved-dashboard')).toHaveAttribute('data-source', 'uploaded');
    await expect(page.getByRole('heading', { name: 'Cloud+ Cost Guard', exact: true })).toBeVisible();
    await checkNoSample(page);
    // Collect every affected view when disclosure copy changes. Soft image
    // assertions still fail the test while preserving the remaining evidence.
    if (testInfo.project.name !== 'tablet-768x1024') await expect.soft(page).toHaveScreenshot('billing-current-report.png', { fullPage: true });
    await openSection(page, 'products', 'Services');
    await expect(page.getByRole('region', { name: 'Uploaded service costs' })).toContainText('API compute');
    if (testInfo.project.name !== 'tablet-768x1024') await expect.soft(page).toHaveScreenshot('billing-services.png', { fullPage: true });
    await openSection(page, 'clouds', 'Clouds');
    await expect(page.getByTestId('billing-service-chart').locator('svg.recharts-surface')).toBeVisible();
    await expect(page.getByTestId('billing-date-chart').locator('svg.recharts-surface')).toBeVisible();
    await checkNoSample(page);
    if (testInfo.project.name !== 'tablet-768x1024') await expect.soft(page).toHaveScreenshot('billing-clouds.png', { fullPage: true });
  });

  test('compares earlier totals and services while disclosing different duration', async ({ page }, testInfo) => {
    await analyze(page, true);
    await expect(page.getByTestId('billing-comparison')).toContainText('$313.53 total change');
    await expect(page.getByTestId('billing-comparison')).toContainText('31.5%');
    await expect(page.getByTestId('billing-comparison')).toContainText('30 and 31 days');
    const changes = page.getByRole('region', { name: 'Uploaded service comparisons' });
    await expect(changes).toContainText('$240.03');
    await checkNoSample(page);
    if (testInfo.project.name !== 'tablet-768x1024') await expect(page).toHaveScreenshot('billing-comparison-report.png', { fullPage: true });
  });

  test('Lumen answers locally without any data requests or example facts', async ({ page }, testInfo) => {
    const requests = [];
    page.on('request', (request) => { if (request.method() !== 'GET' || /api\/ask-claude|posthog|anthropic/.test(request.url())) requests.push(request.url()); });
    await analyze(page, true);
    await page.getByTestId('lumen-trigger').click();
    const panel = page.getByTestId('lumen-panel');
    await expect(panel).toContainText('Local report guide');
    await expect(panel).toContainText('not sent to an AI service');
    await page.getByRole('button', { name: 'Summarize my spending', exact: true }).click();
    await expect(panel).toContainText('$1,310.13');
    const input = page.getByLabel('Ask Lumen about your uploaded report');
    await input.fill('What changed?'); await input.press('Enter');
    await expect(panel).toContainText('$313.53');
    await input.fill('Forecast next month'); await input.press('Enter');
    await expect(panel).toContainText('does not establish forecasts');
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    await checkNoSample(page);
    if (testInfo.project.name !== 'tablet-768x1024') await expect(panel).toHaveScreenshot('billing-lumen.png');
    await input.fill('What are my SaaS costs?'); await input.press('Enter');
    await expect(panel).toContainText('does not establish your separate SaaS invoices');
    await input.fill('Why did Managed database increase?'); await input.press('Enter');
    await expect(panel).toContainText('changed by $40.00, from $300.00 to $340.00');
    expect(requests).toEqual([]);
    await input.press('Escape');
    await expect(page.getByTestId('lumen-trigger')).toBeFocused();
  });

  test('downloads exact report, evidence and both normalized CSV periods', async ({ page }, testInfo) => {
    await analyze(page, true);
    const files = {};
    for (const label of ['Printable report', 'Evidence JSON', 'Current records CSV', 'Previous records CSV']) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
      const destination = testInfo.outputPath(download.suggestedFilename());
      await download.saveAs(destination);
      files[label] = fs.readFileSync(destination, 'utf8');
      expect(files[label]).not.toMatch(/2939\.0525|2194\.0|736\.77|EC2 anomaly/);
    }
    expect(files['Printable report']).toContain('USD 1310.125');
    const evidence = JSON.parse(files['Evidence JSON']);
    expect(evidence.pipeline.validator).toBe('cloudandcapital-ccac/0.2.0');
    expect(evidence.pipeline.included_producers.map(item => item.name)).toEqual(['finops-lite', 'finops-watchdog']);
    expect(evidence.pipeline.omitted_producers).toHaveLength(3);
    const trusted = JSON.parse(evidence.pipeline.artifacts['report.json']);
    expect(trusted.status).toBe('partial');
    expect(trusted.metric_catalog.find(item => item.id === evidence.current.metric_ids.net).value).toBe(1310.125);
    expect(evidence.current.net).toBe('1310.125');
    expect(evidence.previous.net).toBe('996.6');
    expect(evidence.comparison.delta).toBe('313.525');
    expect(files['Current records CSV']).toContain('720.125');
    expect(files['Previous records CSV']).toContain('480.1');
  });

  test('replacing a bill drops prior comparison and Lumen history, clearing and reload remove all data', async ({ page }) => {
    await analyze(page, true);
    await page.getByTestId('lumen-trigger').click();
    await page.getByRole('button', { name: 'Summarize my spending', exact: true }).click();
    await page.getByLabel('Ask Lumen about your uploaded report').press('Escape');
    await page.getByRole('button', { name: 'Upload another bill', exact: true }).click();
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload(one()));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$7.25');
    await expect(page.getByTestId('billing-comparison')).toContainText('Add an earlier bill');
    await page.getByTestId('lumen-trigger').click();
    await expect(page.getByTestId('lumen-panel')).not.toContainText('$1,310');
    await page.getByLabel('Ask Lumen about your uploaded report').press('Escape');
    await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
    await expect(page.getByTestId('billing-upload')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('Only my service');
    await analyze(page);
    await page.reload();
    await expect(page.getByTestId('billing-upload')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('API compute');
  });

  test('switches sample and own data without retaining sample totals or export context', async ({ page }) => {
    await analyze(page);
    await page.getByRole('button', { name: 'Try an example', exact: true }).click();
    await expect(page.getByTestId('approved-dashboard')).toBeVisible();
    await expect(page.locator('body')).toContainText('Exact canonical value: USD 2939.0525');
    await expect(page.locator('body')).not.toContainText('API compute');
    await page.getByRole('button', { name: 'Review my own cloud bill', exact: false }).click();
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload(one('25', 'EUR')));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('€25.00');
    await checkNoSample(page);
  });

  test('invalid replacement is transactional and duplicate ambiguity needs a visible choice', async ({ page }) => {
    await analyze(page);
    await page.getByRole('button', { name: 'Upload another bill', exact: true }).click();
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload('Service,Amount\nCompute,999'));
    await expect(page.getByRole('alert')).toContainText('could not find');
    await expect(page.getByRole('button', { name: 'Review my bill', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to report', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$1,310.13');
    await page.getByRole('button', { name: 'Upload another bill', exact: true }).click();
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload(`${one()}\n2026-10-01,Only my service,7.25,USD`));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('need your review');
    await page.getByText('Period dates & identical rows', { exact: true }).click();
    await page.getByLabel('Identical rows without a RecordId').selectOption('drop');
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$7.25');
    await page.getByText('Data checks, coverage & exact cost basis', { exact: true }).click();
    await expect(page.getByTestId('billing-data-checks')).toContainText('counted once');
  });

  test('FOCUS currency and negative costs render with the correct report basis', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(csv('focus'));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('€48.61');
    await expect(page.getByTestId('billing-credits')).toHaveText('-€5.00');
    await expect(page.locator('body')).toContainText('Exact: EUR 48.6125');
    await checkNoSample(page);
  });

  test('multipart IDs count once and comparison errors explain mismatches', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles([csv('current'), csv('current')]);
    await page.getByLabel('Previous billing CSV files', { exact: true }).setInputFiles(payload(one('3', 'EUR')));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('same currency');
    await page.getByRole('button', { name: 'Remove previous period', exact: true }).click();
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$1,310.13');
    await page.getByText('Data checks, coverage & exact cost basis', { exact: true }).click();
    await expect(page.getByTestId('billing-data-checks')).toContainText('7 repeated record IDs counted once');
  });

  test('many service groups paginate while totals and downloads still cover every record', async ({ page }) => {
    const rows = Array.from({ length: 32 }, (_, index) => `2026-10-01,Service ${index.toString().padStart(2, '0')},1,USD`).join('\n');
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload(`Date,Service,Cost,Currency\n${rows}`));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$32.00');
    await openSection(page, 'products', 'Services');
    await expect(page.getByRole('region', { name: 'Uploaded service costs' }).locator('tbody tr')).toHaveCount(25);
    await page.getByRole('button', { name: 'Next services page', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Uploaded service costs' }).locator('tbody tr')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Next services page', exact: true })).toBeDisabled();
  });

  test('all original dashboard sections use the upload, with honest boundaries for missing evidence', async ({ page }) => {
    await analyze(page, true);
    for (const [value, label] of [['products', 'Services'], ['clouds', 'Clouds'], ['kubernetes', 'Kubernetes'], ['overview', 'Overview'], ['ai-spend', 'AI Spend'], ['saas', 'SaaS'], ['findings', 'Findings']]) {
      await openSection(page, value, label);
      await expect(page.getByTestId('billing-net-total')).toHaveText('$1,310.13');
      if (['kubernetes', 'ai-spend', 'saas'].includes(value)) {
        await expect(page.getByTestId(`billing-unavailable-${value}`)).toContainText('Additional data needed');
        await expect(page.getByTestId(`billing-unavailable-${value}`)).toContainText('Only your supplied cloud costs');
      }
      if (value === 'overview') await expect(page.getByRole('tabpanel')).toContainText('does not reconcile your upload against a provider invoice');
      await checkNoSample(page);
      await expectNoBrokenDisplayValues(page);
      await expectExactPageOverflow(page);
    }
    await expect(page.getByRole('region', { name: 'Uploaded service comparisons' })).toContainText('$240.03');
  });

  test('provider chart filters calculate signed subtotals from the upload and leave the overall report grounded', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload('Date,Service,Cost,Currency,Provider\n2026-10-01,My compute,10.125,USD,AWS\n2026-10-02,My credit,-2.1,USD,AWS\n2026-10-03,My database,20,USD,Azure'));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await openSection(page, 'clouds', 'Clouds');
    await page.getByRole('button', { name: 'AWS', exact: true }).click();
    await expect(page.getByTestId('billing-provider-total')).toContainText('AWS: $8.03 net');
    await expect(page.getByTestId('billing-service-chart')).toContainText('My compute');
    await expect(page.getByTestId('billing-service-chart')).not.toContainText('My database');
    await page.getByRole('button', { name: 'Azure', exact: true }).click();
    await expect(page.getByTestId('billing-provider-total')).toContainText('Azure: $20.00 net');
    await expect(page.getByTestId('billing-service-chart')).toContainText('My database');
    await expect(page.getByTestId('billing-net-total')).toHaveText('$28.03');
    await page.getByRole('button', { name: 'All providers', exact: true }).click();
    await expect(page.getByTestId('billing-provider-total')).toContainText('$28.03 net');
    await checkNoSample(page);
  });

  test('credit-only bills and very large totals stay readable in the original dashboard', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(payload(one('-999999999999.99499999', 'USD', 'Refund')));
    await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('-$999,999,999,999.99');
    await expect(page.getByTestId('scope-donut-card')).toContainText('There are no positive charges to chart');
    const headline = page.getByTestId('billing-net-total');
    expect(await headline.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await openSection(page, 'products', 'Services');
    await expect(page.getByRole('region', { name: 'Uploaded service costs' })).toContainText('Not applicable');
    await checkNoSample(page);
  });

  test('the real Watchdog detects supplied daily history and Lumen uses that finding', async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
    const rows = Array.from({length:21}, (_,i) => `2026-09-${String(i+1).padStart(2,'0')},Shop compute,${i===20?250:100},USD,AWS,day${i}`).join('\n');
    await page.getByLabel('Current billing CSV files', {exact:true}).setInputFiles(payload('Date,Service,Cost,Currency,Provider,RecordId\n'+rows));
    await page.getByRole('button', {name:'Review my bill',exact:true}).click();
    await expect(page.getByTestId('billing-net-total')).toHaveText('$2,250.00');
    await expect(page.getByRole('heading', {name:/detected for/})).toBeVisible();
    await openSection(page, 'overview', 'Overview');
    await expect(page.getByTestId('billing-pipeline-status')).toContainText('CCAC validated');
    await expect(page.locator('body')).toContainText('reported 1 unusual movements');
    await page.getByTestId('lumen-trigger').click();
    const input = page.getByLabel('Ask Lumen about your uploaded report');
    await input.fill('Did Watchdog find a spike?'); await input.press('Enter');
    await expect(page.getByTestId('lumen-panel')).toContainText('Observed 250.0 USD');
    await expect(page.getByTestId('lumen-panel')).toContainText('not a savings estimate or root-cause claim');
    expect(requests).toEqual([]);
    await input.press('Escape');
    await checkNoSample(page);
  });

  test('leaving a running analysis terminates its worker and drops the selection', async ({ page }) => {
    await page.getByLabel('Current billing CSV files', {exact:true}).setInputFiles(csv('current'));
    await page.getByRole('button', {name:'Review my bill',exact:true}).click();
    await expect.poll(() => page.workers().length).toBe(1);
    await page.getByRole('button', {name:'Try an example',exact:true}).click();
    await expect.poll(() => page.workers().length).toBe(0);
    await page.getByRole('button', {name:'Review my own cloud bill →',exact:true}).click();
    await expect(page.getByRole('button', {name:'Review my bill',exact:true})).toBeDisabled();
    await checkNoSample(page);
  });

  test('the existing header export menu downloads this bill instead of canonical sample evidence', async ({ page }) => {
    await analyze(page, true);
    await page.getByRole('button', { name: 'Export uploaded report', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('canonical-export-json').click()]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(evidence.source).toBe('uploaded');
    expect(evidence.current.net).toBe('1310.125');
    expect(evidence.comparison.delta).toBe('313.525');
    expect(JSON.stringify(evidence)).not.toContain('2939.0525');
  });
});
