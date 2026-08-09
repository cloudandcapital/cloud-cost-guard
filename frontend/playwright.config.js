const { defineConfig } = require("@playwright/test");

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4174";
const snapshotPathTemplate = process.platform === "linux"
  ? "{testDir}/snapshots/{testFilePath}/{arg}-{projectName}-linux{ext}"
  : "{testDir}/snapshots/{testFilePath}/{arg}-{projectName}{ext}";

module.exports = defineConfig({
  testDir: "./visual-contract",
  outputDir: "./test-results/visual-contract",
  snapshotPathTemplate,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]] : "list",
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixels: 0,
    },
  },
  use: {
    baseURL,
    browserName: "chromium",
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-1440x1000", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "tablet-768x1024", testIgnore: /dashboard\.visual\.spec\.js/, use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile-390x844", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "REACT_APP_LUMEN_ENABLED=true BROWSER=none HOST=127.0.0.1 PORT=4174 npm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
