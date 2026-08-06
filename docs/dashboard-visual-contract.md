# Approved dashboard visual and interaction contract

## Authority and scope

This contract freezes the interface on `main` commit `c4aa0d059c507ff523a3d1666a177e9aebe143be`. It records and tests only states reproducible from that commit. It does not validate the illustrative financial arithmetic as canonical, migrate data, ground Lumen in CCAC, or introduce future unavailable/partial/error designs.

The rejected PR #8 branch and commit `5a1a16ecb075e6a41513b5079eea3c5ece79c50c` are audit evidence and are not an implementation base.

## Controlled rendering environment

- Chromium supplied by `@playwright/test` 1.62.1.
- Node.js 20.x, matching CI and `frontend/package.json`.
- Desktop viewport: 1440 × 1000 CSS pixels.
- Mobile viewport: 390 × 844 CSS pixels.
- Device scale factor: 1.
- Locale: `en-US`; timezone: `UTC`; light color scheme.
- Reduced motion is requested. Test-only CSS disables animation, transitions, delays, and caret rendering after the approved page loads.
- Tests wait for `document.fonts.ready` and rendered Recharts surfaces.
- The existing `REACT_APP_LUMEN_ENABLED=true` production feature flag is supplied to the test process without reading or changing runtime `.env` files.
- The tracked deterministic `frontend/src/data/report.json` remains the dashboard and Lumen fixture. No network billing source is used.
- Snapshot changes require the explicit `npm run test:visual:update` command, patch review, and independent visual approval.

## Visible-element inventory

| Element/state | Source | Where/condition | Interaction | Current data source | Pre-PR coverage | Classification | Preserve during migration |
|---|---|---|---|---|---|---|---|
| Sticky header, logo, title, demo subtitle | `frontend/src/App.js`, `App.css` | All dashboard states | None | Static copy | None | Canonical-ready shell | Yes |
| Period, Export CSV, Refresh | `App.js` | Header | Download findings CSV; reload deterministic report | Legacy report-derived findings | Indirect logic only | Requires canonical extension | Yes |
| Illustrative source/snapshot disclosure | `App.js` | Below header | None | `report.json.generated_at` | Report trust tests | Illustrative-only | Yes, with truthful replacement |
| Executive current-cost headline and delta | `App.js` | All primary tabs | None | Legacy report plus browser arithmetic | None | Illustrative-only | Yes |
| Projected-next-month block | `App.js` | Executive headline | None | Legacy browser projection | None | Illustrative-only | Yes, unavailable until canonical forecast exists |
| Cloud, AI, SaaS scope cards | `App.js` / `KPICard` | Executive summary | Hover styling | Legacy report sections | None | Requires canonical extension | Yes |
| Tag Coverage card | `App.js` | Executive summary | None | Legacy tagging section | None | Requires canonical extension | Yes |
| Modeled Resilience Opportunity card | `App.js` | Executive summary | None | Legacy opportunity aggregate | None | Requires canonical extension | Yes |
| Daily Tech Spend graph | `App.js`, Recharts | Executive summary | Tooltip | Browser-combined cloud/AI/SaaS trend | Scenario unit tests | Illustrative-only | Yes |
| Tech Spend by Scope donut and legend | `App.js`, Recharts | Executive summary | Tooltip | Browser-combined legacy totals | None | Illustrative-only | Yes, container only until denominator is valid |
| Top Signal & Forecast | `App.js` | Executive summary | None | Legacy anomaly plus browser forecast | None | Illustrative-only | Yes |
| Triage Preview collapsed | `TriageCard.jsx` | Above primary tabs | Review plan | First legacy anomaly | AWS command unit tests | Requires canonical extension | Yes |
| Triage review plan expanded | `TriageCard.jsx` | After Review plan | Hide; copy read-only command | Legacy anomaly, deterministic command | AWS command unit tests | Requires canonical extension | Yes |
| Kubernetes summary caption | `App.js` | Above primary tabs | None | Legacy Kubernetes object/opportunity | None | Illustrative-only | Yes, honest unavailable treatment later |
| Primary tabs | `App.js`, Radix Tabs | All dashboard states | Seven tab switches in fixed order | Static structure | None | Canonical-ready shell | Yes |
| Findings cards | `App.js` / `FindingCard` | Findings | Open details/methodology | React-derived legacy findings | None | Illustrative-only | Yes |
| Finding detail modal | `App.js` / `Modal` | Finding action | Close by button/backdrop | Selected legacy finding | None | Requires canonical extension | Yes |
| Products table | `App.js` / `ProductTable` | Products | Row hover | Legacy top-products section | None | Requires canonical extension | Yes |
| Cloud provider KPI row | `App.js` | Clouds | None | Legacy AWS/Azure/GCP objects | None | Illustrative-only | Yes |
| AWS/Azure/GCP drilldown tabs | `App.js`, Radix Tabs | Clouds | Provider switch | Static structure, legacy provider objects | None | Requires canonical extension | Yes |
| Provider service graph/table/findings | `App.js`, Recharts | Selected provider | Tooltip; finding modal | Legacy provider objects | None | Illustrative-only | Yes |
| Kubernetes KPIs, namespace graph, nodes/workloads | `App.js`, Recharts | Kubernetes | Tooltip/table inspection | Legacy Kubernetes object | Connector unit test only | Illustrative-only | Yes |
| Anomaly Severity and Resilience Workloads | `App.js` | Overview | None | Legacy anomalies/resilience | None | Requires canonical extension | Yes |
| AI KPI cards, trend, donut, model table | `App.js`, Recharts | AI Spend | Tooltips | Legacy AI section/browser ratios | Scenario unit tests | Illustrative-only | Yes |
| SaaS KPIs, tool graph, trend, unused table | `App.js`, Recharts | SaaS | Tooltips/table inspection | Legacy SaaS section | Scenario unit tests | Illustrative-only | Yes |
| Lumen closed trigger | `AskClaude.jsx` | Production flag enabled | Open panel | Static shell | Lumen parsing/preset tests | Canonical-ready shell | Yes |
| Lumen open/empty state | `AskClaude.jsx` | After open | Close; choose preset; enter question | Legacy report | Lumen parsing/preset tests | Illustrative-only | Yes |
| Lumen preset answer/new chat | `AskClaude.jsx` | After preset | Reset conversation | Legacy report/preset builder | Preset unit tests | Illustrative-only | Yes |
| Typography, beige palette, rounded cards, hierarchy | `App.css`, `index.css` | All states | Hover/focus/responsive changes | CSS and Google fonts | None | Canonical-ready visual shell | Yes |
| Desktop three-column and responsive stacked layouts | `App.js`, Tailwind, `App.css` | Breakpoint-dependent | Resize/reflow | CSS | None | Canonical-ready shell | Yes |

## Existing but not reproducibly baselined states

These are recorded requirements, not new UI in this PR:

- The initial `Loading cost analysis...` branch is synchronous/ephemeral with the bundled report and cannot be captured deterministically without application control hooks.
- The dashboard `Failed to load cost data` branch has no reproducible approved-main input because the report is bundled and trusted at build time.
- Findings-empty, anomaly-empty, Kubernetes-loading, modal-without-selection, Lumen network-loading, Lumen network-error, clipboard-error, and CSV-export-error branches exist conditionally but are not produced by the approved deterministic fixture and are therefore not promoted into the visual baseline.
- Canonical unsupported, partial-quality, adapter-failure, incompatible-aggregation, and unavailable-provider states do not exist in the approved visible interface. They must be introduced later through separately reviewed UI decisions.

## Coverage and removal detection

Structural tests assert the exact tab order, major card containers, rendered line/pie SVGs, all three donut sectors, headline copy, primary controls, triage, and Lumen placement. Interaction tests exercise all primary tabs, all provider tabs, Export, Refresh, finding drilldown/modal, review-plan expansion, and Lumen open/preset/reset/close. Removing an asserted visual or interaction causes a locator/count/content failure before screenshot comparison; visual changes additionally fail the stored screenshot comparison.
