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

test("optimized production bundle mounts the canonical React dashboard", async (t) => {
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
  await page.getByTestId("approved-dashboard").waitFor({ state: "visible" });
  assert.notEqual(await page.locator("#root").innerHTML(), "");
  assert.equal(await page.getByText("Published Technology Spend", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Exact canonical value: USD 2939.0525", { exact: true }).count(), 1);
});
