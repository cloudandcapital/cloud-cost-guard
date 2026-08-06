import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const passthrough = (tag = "div") => ({ children, ...props }) => React.createElement(tag, props, children);
jest.mock("./components/ui/card", () => ({ Card: passthrough(), CardContent: passthrough(), CardDescription: passthrough(), CardHeader: passthrough(), CardTitle: passthrough("h3") }));
jest.mock("./components/ui/badge", () => ({ Badge: passthrough("span") }));
jest.mock("./components/ui/tabs", () => ({ Tabs: passthrough(), TabsContent: passthrough(), TabsList: passthrough(), TabsTrigger: passthrough("button") }));
jest.mock("./components/ui/alert", () => ({ Alert: passthrough(), AlertDescription: passthrough() }));
jest.mock("./components/ui/table", () => ({ Table: passthrough("table"), TableBody: passthrough("tbody"), TableCell: passthrough("td"), TableHead: passthrough("th"), TableHeader: passthrough("thead"), TableRow: passthrough("tr") }));
jest.mock("lucide-react", () => new Proxy({}, { get: () => passthrough("span") }));
jest.mock("recharts", () => new Proxy({}, { get: () => ({ children }) => <div>{children}</div> }));
import App, { formatCanonicalDecimal } from "./App";
import {
  CcacDashboardViewUnavailableError,
  getValidatedCcacDashboardView,
} from "./lib/ccacDashboardView";

jest.mock("./components/AskClaude", () => () => <div data-testid="lumen">Lumen</div>);

const sourceRoot = path.resolve(__dirname);

test("visible dashboard reads only through the validated adapter", () => {
  const appSource = fs.readFileSync(path.join(sourceRoot, "App.js"), "utf8");
  expect(appSource).toContain("getValidatedCcacDashboardView()");
  expect(appSource).not.toContain("getCloudCapitalReport");
  expect(appSource).not.toContain(["ccac-dashboard-view", "generated.json"].join("."));
  expect(appSource).not.toContain("data/report.json");
});

test("generated view has exactly one application import", () => {
  const generatedAssetName = ["ccac-dashboard-view", "generated.json"].join(".");
  const files = fs.readdirSync(path.join(sourceRoot, "lib"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(sourceRoot, "lib", name))
    .concat([path.join(sourceRoot, "App.js"), path.join(sourceRoot, "components", "AskClaude.jsx"), path.join(sourceRoot, "components", "TriageCard.jsx")]);
  const consumers = files.filter((file) => fs.readFileSync(file, "utf8").includes(generatedAssetName));
  expect(consumers).toEqual([path.join(sourceRoot, "lib", "ccacDashboardView.js")]);
});

test("Lumen alone retains its isolated legacy report source", () => {
  const source = fs.readFileSync(path.join(sourceRoot, "components", "AskClaude.jsx"), "utf8");
  const triageSource = fs.readFileSync(path.join(sourceRoot, "components", "TriageCard.jsx"), "utf8");
  expect(source).toContain("getCloudCapitalReport");
  expect(source).not.toContain("ccacDashboardView");
  expect(triageSource).not.toContain("getCloudCapitalReport");
  expect(triageSource).not.toContain("report.json");
});

test("canonical dashboard renders exact values, canonical order, quality, and corrected labels", () => {
  const view = getValidatedCcacDashboardView();
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("$2,194.0");
  expect(html).toContain("$12.5325");
  expect(html).toContain("Amazon EC2");
  expect(html).not.toContain("AmazonEC2");
  expect(html).toContain("partial");
  expect(html).toContain("No canonical combined technology-spend metric exists.");
  const positions = view.findings.map((finding) => html.indexOf(finding.title.replaceAll("AmazonEC2", "Amazon EC2").replaceAll("AmazonS3", "Amazon S3")));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("display formatter preserves decimal strings, explicit zero, and missing state", () => {
  expect(formatCanonicalDecimal("12.5325", { currency: true })).toBe("$12.5325");
  expect(formatCanonicalDecimal("100000")).toBe("100,000");
  expect(formatCanonicalDecimal("0", { currency: true })).toBe("$0");
  expect(formatCanonicalDecimal(null, { currency: true })).toBe("Unavailable");
});

test("adapter-specific unavailability renders only the generic state", () => {
  const adapter = require("./lib/ccacDashboardView");
  const spy = jest.spyOn(adapter, "getValidatedCcacDashboardView").mockImplementation(() => {
    throw new CcacDashboardViewUnavailableError();
  });
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Validated illustrative dashboard data is unavailable.");
  expect(html).not.toContain("$2,194.0");
  expect(html).not.toContain("Amazon EC2");
  spy.mockRestore();
});

test("unexpected errors remain observable", () => {
  const adapter = require("./lib/ccacDashboardView");
  const spy = jest.spyOn(adapter, "getValidatedCcacDashboardView").mockImplementation(() => {
    throw new TypeError("programming defect");
  });
  expect(() => renderToStaticMarkup(<App />)).toThrow("programming defect");
  spy.mockRestore();
});
