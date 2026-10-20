import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { TextEncoder, TextDecoder } from 'util';
import App from '../../App';
import * as exampleModel from '../../lib/ccac11PresentationModel';

// Layout and SVG rendering are covered by the browser suite. Exercise real file parsing,
// report construction and application state here without a layout engine or network.
// CRA's Jest resolver predates conditional package exports. Supply Radix's
// production diagnostic flag while retaining its real interactive components.
jest.mock('@radix-ui/primitive/is-development', () => ({ IS_DEVELOPMENT: false }), { virtual: true });
jest.mock('recharts', () => ({ ResponsiveContainer: () => null, BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, LineChart: () => null, Line: () => null, ReferenceLine: () => null, PieChart: () => null, Pie: () => null, Cell: () => null }));
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = (name) => fs.readFileSync(path.join(__dirname, `../../../public/billing/${name}-example.csv`), 'utf8');
const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
let root, host, sampleSpy;
async function click(element) { expect(element).toBeTruthy(); await act(async () => { element.click(); }); }
async function choose(text, kind = 'current', name = 'bill.csv') {
  const bytes = new TextEncoder().encode(text);
  const input = document.querySelector(`#${kind}-files`);
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
const text = () => document.body.textContent;
async function tab(label) {
  const trigger = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent === label);
  expect(trigger).toBeTruthy();
  await act(async () => { trigger.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); });
}

beforeEach(async () => {
  window.scrollTo = jest.fn();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.scrollTo = jest.fn();
  sampleSpy = jest.spyOn(exampleModel, 'getCcac11PresentationModel');
  global.fetch = jest.fn(() => { throw new Error('Uploaded reports must not call the network'); });
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<App/>); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); sampleSpy.mockRestore(); });

test('real uploads, comparison and local Lumen share one report without a network call', async () => {
  expect(document.querySelector('[data-testid="billing-upload"]')).toBeTruthy();
  await choose(fixture('current'));
  await choose(fixture('previous'), 'previous');
  await click(button('Review my bill'));
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('$1,310.13');
  expect(document.querySelector('[data-testid="billing-comparison"]').textContent).toContain('$313.53');
  await click(document.querySelector('[data-testid="lumen-trigger"]'));
  await click(button('Summarize my spending'));
  expect(document.querySelector('[data-testid="lumen-panel"]').textContent).toContain('$1,310.13');
  expect(document.querySelector('[data-testid="approved-dashboard"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="primary-tabs"]')).toBeTruthy();
  expect(sampleSpy).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a bad replacement creates no report, while the previous valid report can be restored', async () => {
  await choose(fixture('current')); await click(button('Review my bill'));
  await click(button('Upload another bill'));
  await choose('Wrong,Columns\n1,2');
  expect(document.querySelector('[role="alert"]').textContent).toContain('could not find');
  expect(button('Review my bill').disabled).toBe(true);
  expect(document.querySelector('[data-testid="billing-report"]')).toBeNull();
  await click(button('Back to report'));
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('$1,310.13');
});

test('a new current bill drops its old comparison and clear returns to an empty selection', async () => {
  await choose(fixture('current')); await choose(fixture('previous'), 'previous'); await click(button('Review my bill'));
  await click(button('Upload another bill'));
  await choose('Date,Service,Cost,Currency\n2026-10-01,My new service,7.25,USD');
  await click(button('Review my bill'));
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('$7.25');
  expect(document.querySelector('[data-testid="billing-comparison"]').textContent).toContain('Add an earlier bill');
  expect(text()).not.toContain('API compute');
  await click(button('Clear my data'));
  expect(document.querySelector('[data-testid="billing-upload"]')).toBeTruthy();
  expect(button('Review my bill').disabled).toBe(true);
  expect(text()).not.toContain('My new service');
});

test('switching to the example drops the uploaded selection', async () => {
  await choose(fixture('current')); await click(button('Review my bill'));
  await click(button('Try an example'));
  expect(text()).toContain('Exact canonical value: USD 2939.0525');
  expect(text()).not.toContain('API compute');
  await click(button('Review my own cloud bill →'));
  expect(button('Review my bill').disabled).toBe(true);
  expect(text()).not.toContain('2939.0525');
});

test('an invalid comparison cannot silently turn into a current-only report', async () => {
  await choose(fixture('current'));
  await choose('Wrong,Columns\n1,2', 'previous');
  expect(button('Review my bill').disabled).toBe(true);
  expect(document.querySelector('[data-testid="billing-report"]')).toBeNull();
  await click(button('Remove invalid comparison selection'));
  expect(button('Review my bill').disabled).toBe(false);
  await click(button('Review my bill'));
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('$1,310.13');
  expect(document.querySelector('[data-testid="billing-comparison"]').textContent).toContain('Add an earlier bill');
});

test('the real dashboard tabs use uploads and explain missing evidence without loading the example', async () => {
  await choose(fixture('current')); await choose(fixture('previous'), 'previous'); await click(button('Review my bill'));
  const headline = document.querySelector('[data-testid="billing-net-total"]');
  for (const label of ['Services', 'Clouds', 'Kubernetes', 'Overview', 'AI Spend', 'SaaS', 'Findings']) {
    await tab(label);
    expect(headline.textContent).toBe('$1,310.13');
    expect(text()).not.toMatch(/2939\.0525|2,939\.05|736\.77|8\.2825|Top canonical anomaly|Modeled resilience/);
    if (['Kubernetes', 'AI Spend', 'SaaS'].includes(label)) expect(text()).toContain('Additional data needed');
    if (label === 'Services') expect(document.querySelector('[aria-label="Uploaded service costs"]').textContent).toContain('API compute');
    if (label === 'Findings') expect(document.querySelector('[aria-label="Uploaded service comparisons"]').textContent).toContain('$240.03');
  }
  expect(sampleSpy).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('cloud provider filters change only their charts and subtotal, using signed costs from this upload', async () => {
  await choose('Date,Service,Cost,Currency,Provider\n2026-10-01,My compute,10.125,USD,AWS\n2026-10-02,My credit,-2.1,USD,AWS\n2026-10-03,My database,20,USD,Azure');
  await click(button('Review my bill'));
  await tab('Clouds');
  await click(button('AWS'));
  expect(document.querySelector('[data-testid="billing-provider-total"]').textContent).toContain('$8.03 net');
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('$28.03');
  await click(button('Azure'));
  expect(document.querySelector('[data-testid="billing-provider-total"]').textContent).toContain('$20.00 net');
  await click(button('All providers'));
  expect(document.querySelector('[data-testid="billing-provider-total"]').textContent).toContain('$28.03 net');
  expect(sampleSpy).not.toHaveBeenCalled();
});

test('a replacement resets the original dashboard tab, provider selection and Lumen context', async () => {
  await choose(fixture('current')); await click(button('Review my bill'));
  await tab('Clouds'); await click(button('AWS'));
  await click(button('Upload another bill'));
  await choose('Date,Service,Cost,Currency,Provider\n2026-10-01,Only new storage,25,EUR,New provider');
  await click(button('Review my bill'));
  expect(document.querySelector('[role="tab"][data-state="active"]').textContent).toBe('Findings');
  expect(document.querySelector('[data-testid="billing-net-total"]').textContent).toBe('€25.00');
  await tab('Clouds');
  expect(document.querySelector('[data-testid="billing-provider-total"]').textContent).toContain('All providers: €25.00');
  expect(text()).not.toContain('AWS');
});
