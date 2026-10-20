import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { TextEncoder, TextDecoder } from 'util';
import BillingApp from './BillingApp';

// Layout and SVG rendering are covered by the browser suite. Exercise real file parsing,
// report construction and application state here without a layout engine or network.
jest.mock('recharts', () => ({ ResponsiveContainer: () => null, BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, LineChart: () => null, Line: () => null, ReferenceLine: () => null }));
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = (name) => fs.readFileSync(path.join(__dirname, `../../../public/billing/${name}-example.csv`), 'utf8');
const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
let root, host;
async function click(element) { expect(element).toBeTruthy(); await act(async () => { element.click(); }); }
async function choose(text, kind = 'current', name = 'bill.csv') {
  const bytes = new TextEncoder().encode(text);
  const input = document.querySelector(`#${kind}-files`);
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
const text = () => document.body.textContent;

beforeEach(async () => {
  window.scrollTo = jest.fn();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(() => { throw new Error('Uploaded reports must not call the network'); });
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<BillingApp SampleDashboard={() => <div>Sample-only sentinel</div>}/>); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

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
  expect(text()).not.toContain('Sample-only sentinel');
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
  expect(text()).toContain('Sample-only sentinel');
  expect(text()).not.toContain('API compute');
  await click(button('Review my own cloud bill →'));
  expect(button('Review my bill').disabled).toBe(true);
  expect(text()).not.toContain('Sample-only sentinel');
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
