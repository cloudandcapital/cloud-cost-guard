const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("../frontend/node_modules/playwright");

const BUILD_DIRECTORY = path.resolve(__dirname, "../frontend/build");
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

function createStaticServer() {
  return http.createServer((request, response) => {
    const requestedPath = new URL(request.url, "http://127.0.0.1").pathname;
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const candidate = path.resolve(BUILD_DIRECTORY, relativePath);
    if (!candidate.startsWith(`${BUILD_DIRECTORY}${path.sep}`) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(candidate)] || "application/octet-stream" });
    fs.createReadStream(candidate).pipe(response);
  });
}

test("optimized production bundle routes uploaded bills into the existing dashboard and isolates the example", async (t) => {
  assert.equal(fs.existsSync(path.join(BUILD_DIRECTORY, "index.html")), true, "run npm build before this test");
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  const address = server.address();
  const response = await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  assert.equal(
    pageErrors.some((error) => /ES Modules may not assign module\.exports/i.test(error)),
    false,
    `optimized bundle crossed an incompatible module boundary: ${pageErrors.join(" | ")}`,
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  await page.getByTestId("billing-upload").waitFor({ state: "visible" });
  assert.equal(await page.getByRole('form', { name: 'Review my cloud bill', exact: true }).count(), 1);
  assert.equal(await page.getByText('Exact canonical value: USD 2939.0525', { exact: true }).count(), 0);
  const dataRequests = [];
  page.on('request', (request) => { if (request.method() !== 'GET' || /api\/ask-claude|anthropic|posthog/.test(request.url())) dataRequests.push(request.url()); });
  await page.getByLabel('Current billing CSV files', { exact: true }).setInputFiles(path.resolve(__dirname, '../frontend/public/billing/current-example.csv'));
  await page.getByLabel('Previous billing CSV files', { exact: true }).setInputFiles(path.resolve(__dirname, '../frontend/public/billing/previous-example.csv'));
  await page.getByRole('button', { name: 'Review my bill', exact: true }).click();
  await page.getByTestId('billing-report').waitFor({ state: 'visible', timeout: 120000 });
  assert.equal(await page.getByTestId('approved-dashboard').getAttribute('data-source'), 'uploaded');
  assert.equal(await page.getByTestId('billing-net-total').innerText(), '$1,310.13');
  assert.match(await page.getByTestId('billing-comparison').innerText(), /\$313\.53/);
  for (const label of ['Services', 'Clouds', 'Overview', 'Findings']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    assert.equal(await page.getByTestId('billing-net-total').innerText(), '$1,310.13');
    assert.doesNotMatch(await page.locator('body').innerText(), /2939\.0525|2,939\.05|736\.77|Top canonical anomaly/);
  }
  await page.getByRole('button', { name: 'Export uploaded report', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('canonical-export-json').click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const evidence = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(evidence.current.net, '1310.125');
  assert.equal(evidence.previous.net, '996.6');
  assert.equal(evidence.comparison.delta, '313.525');
  assert.equal(evidence.pipeline.validator, 'cloudandcapital-ccac/0.2.0');
  assert.deepEqual(evidence.pipeline.included_producers.map(item => item.name), ['finops-lite','finops-watchdog']);
  assert.equal(JSON.parse(evidence.pipeline.artifacts['report.json']).status, 'partial');
  await page.getByTestId('lumen-trigger').click();
  await page.getByRole('button', { name: 'Summarize my spending', exact: true }).click();
  assert.match(await page.getByTestId('lumen-panel').innerText(), /\$1,310\.13/);
  await page.getByLabel('Ask Lumen about your uploaded report').press('Escape');
  assert.deepEqual(dataRequests, []);
  await page.getByRole('button', { name: 'Clear my data', exact: true }).click();
  await page.getByTestId('billing-upload').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByTestId('billing-report').waitFor({ state: 'visible', timeout: 120000 });
  assert.equal(await page.getByTestId('billing-net-total').innerText(), '$1,310.13');
  assert.match(await page.getByRole('region', { name: 'Example data', exact: true }).innerText(), /Invented bills/);
  assert.equal(await page.getByRole('tab', {name:'Kubernetes',exact:true}).count(),0);
  await page.getByRole('button', { name: 'Review my own cloud bill →', exact: true }).click();
  await page.getByText('What can I upload?', {exact:true}).click();
  await page.getByRole('button', { name: 'See the full technology spend demo', exact: true }).click();
  await page.getByTestId("approved-dashboard").waitFor({ state: "visible" });
  assert.notEqual(await page.locator("#root").innerHTML(), "");
  assert.equal(await page.getByText("Published Technology Spend", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Exact canonical value: USD 2939.0525", { exact: true }).count(), 1);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
});
