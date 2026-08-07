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
- Tests wait for `document.fonts.ready`, require loaded `Inter` and `Playfair Display` font faces, verify those families are applied to body and brand-title text, and require rendered Recharts geometry. The production CSS still obtains these same intended faces from Google Fonts; CI fails instead of silently accepting fallback fonts if that external font source is unavailable.
- The existing `REACT_APP_LUMEN_ENABLED=true` production feature flag is supplied to the test process without reading or changing runtime `.env` files.
- The tracked deterministic `frontend/src/data/report.json` remains the dashboard and Lumen fixture. No network billing source is used.
- Snapshot changes require the explicit `npm run test:visual:update` command, patch review, and independent visual approval.
- Screenshot comparison permits exactly zero changed pixels (`maxDiffPixels: 0`). Three consecutive clean no-update runs under the pinned environment were pixel-identical, so no nonzero tolerance is justified.
- Screenshot baselines are platform-specific when operating-system text rasterization changes pixels or font metrics: the existing approved files remain the macOS contract, while CI uses separately reviewed `-linux` files. Both platforms retain the same zero-pixel threshold; cross-platform differences are never converted into a tolerance.

## Visible-element inventory

| Element/state | Source | Where/condition | Interaction | Current data source | Pre-PR coverage | Classification | Preserve during migration |
|---|---|---|---|---|---|---|---|
| Sticky header, logo, title, demo subtitle | `frontend/src/App.js`, `App.css` | All dashboard states | None | Static copy | None | Canonical-ready | Yes |
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
| Primary tabs | `App.js`, Radix Tabs | All dashboard states | Seven tab switches in fixed order | Static structure | None | Canonical-ready | Yes |
| Constrained mobile primary-tab strip | `App.css`, Radix Tabs | 390 px approved viewport | Seven controls in a five-column grid: Findings through Overview form row one; 30 px-high AI Spend and SaaS controls form an implicit second row 36 px below row one, outside the fixed 38 px container and clipped by `overflow: hidden`; no horizontal scrolling | Static CSS | Visual-contract layout assertion | Canonical-ready | Yes as faithfully preserved legacy behavior; repair only in a separate design change |
| AI Spend mobile page overflow | `App.js`, chart/table layout | AI Spend at 390 px viewport | Existing page width is 408 px: client width 390 px plus exactly 18 px horizontal overflow | Approved legacy layout | Exact per-state overflow assertion | Canonical-ready | Yes as a known approved-base defect until a dedicated mobile-overflow correction is approved |
| Provider mobile page overflow | `App.js`, provider drilldown layout | AWS/Azure/GCP at 390 px viewport | AWS has no page overflow; Azure has exactly 83 px; GCP has exactly 148 px | Approved legacy provider layouts | Exact per-provider overflow assertions | Canonical-ready | Yes as newly measured approved-base defects; repair only in a dedicated mobile-overflow correction |
| Findings cards | `App.js` / `FindingCard` | Findings | Open details/methodology | React-derived legacy findings | None | Illustrative-only | Yes |
| Finding detail modal | `App.js` / `Modal` | Finding action | Close by button/backdrop | Selected legacy finding | None | Requires canonical extension | Yes |
| Products table | `App.js` / `ProductTable` | Products | Row hover | Legacy top-products section | None | Requires canonical extension | Yes |
| Cloud provider KPI row | `App.js` | Clouds | None | Legacy AWS/Azure/GCP objects | None | Illustrative-only | Yes |
| AWS/Azure/GCP drilldown tabs | `App.js`, Radix Tabs | Clouds | Provider switch | Static structure, legacy provider objects | None | Requires canonical extension | Yes |
| Provider service graph/table/findings | `App.js`, Recharts | Selected provider | Tooltip; finding modal | Legacy provider objects | Provider text, table content, visible SVG, nonempty bar paths, and nonzero rendered geometry; it does not validate canonical financial correctness | Illustrative-only | Yes |
| Kubernetes KPIs, namespace graph, nodes/workloads | `App.js`, Recharts | Kubernetes | Tooltip/table inspection | Legacy Kubernetes object | Connector unit test only | Illustrative-only | Yes |
| Anomaly Severity and Resilience Workloads | `App.js` | Overview | None | Legacy anomalies/resilience | None | Requires canonical extension | Yes |
| AI KPI cards, trend, donut, model table | `App.js`, Recharts | AI Spend | Tooltips | Legacy AI section/browser ratios | Scenario unit tests | Illustrative-only | Yes |
| SaaS KPIs, tool graph, trend, unused table | `App.js`, Recharts | SaaS | Tooltips/table inspection | Legacy SaaS section | Scenario unit tests | Illustrative-only | Yes |
| Lumen closed trigger | `AskClaude.jsx` | Production flag enabled | Open panel | Static shell | Lumen parsing/preset tests | Canonical-ready | Yes |
| Lumen open/empty state | `AskClaude.jsx` | After open | Close; choose preset; enter question | Legacy report | Lumen parsing/preset tests | Illustrative-only | Yes |
| Lumen preset answer/new chat | `AskClaude.jsx` | After preset | Reset conversation | Legacy report/preset builder | Preset unit tests | Illustrative-only | Yes |
| Lumen custom submission | `AskClaude.jsx`, `/api/ask-claude` | Non-preset question submitted by Send or Enter | Adds the user message, clears input, POSTs normalized messages, then renders returned assistant text | Public API handler and legacy report context | API sanitizer/safety tests; not a deterministic visual baseline | Illustrative-only | Yes |
| Lumen loading state | `AskClaude.jsx` | Custom request pending | Input and Send disabled; animated three-dot assistant bubble shown | Network request state | Not reproducibly baselined | Illustrative-only | Yes |
| Lumen error state | `AskClaude.jsx` | Custom request or response failure | Inline `.ask-claude-error` displays the returned/fallback error below messages; input becomes available after completion | Network/API error | Not reproducibly baselined | Illustrative-only | Yes |
| Clipboard failure presentation | `TriageCard.jsx` | Clipboard API missing or write rejected after Copy investigation command | Inline red text: `Clipboard access is unavailable. Select the command above to copy it manually.` | Browser Clipboard API | Not reproducibly baselined | Requires canonical extension | Yes |
| CSV export failure presentation | `App.js` | CSV construction/download throws | Logs `Export failed:` and shows browser alert `Export failed. Please try again.` | Browser Blob/object-URL/download APIs | Not reproducibly baselined | Requires canonical extension | Yes |
| Typography, beige palette, rounded cards, hierarchy | `App.css`, `index.css` | All states | Hover/focus/responsive changes | CSS and Google fonts | Loaded-family contract assertion | Canonical-ready | Yes |
| Desktop three-column and responsive stacked layouts | `App.js`, Tailwind, `App.css` | Breakpoint-dependent | Resize/reflow | CSS | None | Canonical-ready | Yes |

`Canonical-ready` classifies only the preserved visual or structural shell. It does not claim that illustrative values or legacy browser arithmetic are canonical data.

## Preserved mobile defects

At the approved 390 × 844 viewport, the primary tab list is exactly seven controls in a five-column CSS grid. Findings, Products, Clouds, Kubernetes, and Overview occupy the first row. AI Spend and SaaS are 30 px-high controls in an implicit second row whose top is 36 px below the first row. The list retains a fixed total height of 38 px and `overflow: hidden`; it has no horizontal scrolling. The second row begins below the container's visible content area and is clipped, creating a concrete usability risk. PR #9 deliberately preserves this legacy behavior and does not redesign it. A separate future design issue must own any repair.

The approved AI Spend mobile state has exactly 18 px of page-level horizontal overflow on the review workstation (`clientWidth` 390 px; `scrollWidth` 408 px). Provider drilldown measurement there also records AWS at zero overflow, Azure at exactly 83 px (`scrollWidth` 473 px), and GCP at exactly 148 px (`scrollWidth` 538 px). Ubuntu CI's rasterization metrics are separately pinned at AI 20 px, AWS 0 px, Azure 82 px, and GCP 146 px. The contract asserts these exact platform-specific approved-base defects so any increase, decrease, disappearance, or other change requires intentional review. Every other primary tab must have `scrollWidth === clientWidth`, as must AWS and all desktop states. These exceptions must be removed when a dedicated mobile-overflow correction is approved; they do not weaken any other no-overflow assertion.

## Existing but not reproducibly baselined states

These are recorded requirements, not new UI in this PR:

- The initial `Loading cost analysis...` branch is synchronous/ephemeral with the bundled report and cannot be captured deterministically without application control hooks.
- The dashboard `Failed to load cost data` branch has no reproducible approved-main input because the report is bundled and trusted at build time.
- Findings-empty, anomaly-empty, Kubernetes-loading, modal-without-selection, Lumen network-loading, Lumen network-error, clipboard-error, and CSV-export-error branches exist conditionally but are not produced by the approved deterministic fixture and are therefore not promoted into the visual baseline.
- Canonical unsupported, partial-quality, adapter-failure, incompatible-aggregation, and unavailable-provider states do not exist in the approved visible interface. They must be introduced later through separately reviewed UI decisions.

## Coverage and removal detection

Structural tests assert exact tab order and constrained mobile layout, exact overflow for every primary/provider state, major card containers, visible chart SVGs, nonempty path data, nonzero geometry, all donut sectors, intended loaded fonts, headline copy, primary controls, triage, and Lumen placement. Interaction tests exercise all primary tabs, all provider tabs, Export, Refresh, finding drilldown/modal, review-plan expansion, and Lumen open/preset/reset/close. Removing an asserted visual or interaction causes a locator/count/content/geometry failure before screenshot comparison; visual changes additionally fail the zero-pixel stored screenshot comparison.
