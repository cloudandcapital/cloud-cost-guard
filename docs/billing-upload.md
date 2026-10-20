# Review your own cloud bill

The start screen accepts billing CSVs without cloud credentials. Select the current period's files, optionally add a separate earlier period, and choose **Review my bill**. Your records populate the existing Cloud Cost Guard dashboard: the same header, summary cards, section navigation, charts, export menu and Lumen panel. There is no separate result-page product. **Try an example** opens this dashboard in a clearly labeled CCAC example mode; it is never used to complete missing upload data.

**Findings** explains totals, service drivers and supplied comparisons. **Services** accounts for all service groups and signed credits. **Clouds** charts the uploaded records and filters only providers actually present, with explicit filtered subtotals; the headline, exports and Lumen continue to cover the whole upload. **Overview** explains the cost basis and coverage. **Kubernetes**, **AI Spend** and **SaaS** explain what additional workload, direct-vendor or invoice data is needed, without filling those sections with example metrics. Provider-billed AI can still be present in the supplied service costs.

The GitHub pipeline tests, validates and builds the app and its tracked illustrative fixtures. It is not a customer billing ingestion service, and visitors do not need a GitHub workflow run or a human to upload on their behalf. CSV processing runs locally when they use the app. The reference cloud connectors remain disconnected from production ingestion. Assisted interpretation is an optional Cloud & Capital service linked below the dashboard; the self-service flow stands on its own.

## Supported files

UTF-8 comma-separated `.csv`, with a header and at least one record. Quoted commas, escaped quotes, embedded newlines, BOM, LF, and CRLF are supported. Headers are case-insensitive and trimmed. Every row must have the same number of cells. The entire selection fails on any invalid row; rows are never silently skipped.

Each period accepts up to 20 parts, 10 MB combined, 50,000 input records, and 366 calendar days. Choose all parts of **one** export run. This reader cannot establish whether an export includes every account or charge. Do not combine daily snapshots of a month-to-date export: those snapshots often repeat charges.

### Simple format

| Column | Meaning |
| --- | --- |
| `Date` | Required charge start date, `YYYY-MM-DD` |
| `Service` | Required service or adjustment label |
| `Cost` | Required signed billed amount; decimal point, up to 8 places |
| `Currency` | Required supported three-letter currency code, such as USD or EUR |
| `Provider` | Optional; missing values display as “Not specified” |
| `RecordId` | Optional stable line-item identity, unique within Provider + BillingAccountId |
| `BillingAccountId` | Optional identity namespace for RecordId |
| `EndDate` | Optional exclusive charge end; otherwise Date covers one day |

Download [the template](../frontend/public/billing/template.csv), [an invented current bill](../frontend/public/billing/current-example.csv), and [its earlier comparison](../frontend/public/billing/previous-example.csv).

### FOCUS billing CSV

Required headers: `ChargePeriodStart`, `ChargePeriodEnd`, `ServiceName`, `BilledCost`, `BillingCurrency`. Optional `ProviderName`, `RecordId`, `BillingAccountId`, and `ChargeCategory` are read. The reader supports these stable columns from FOCUS exports; it does **not** assert full FOCUS conformance. `EffectiveCost` and `ListCost` never substitute for `BilledCost`.

UTC timestamps (for example `2026-09-01T13:00:00Z`) and ISO dates are accepted. UTC `+00:00` is accepted; local times and other offsets are rejected. Dates must be real calendar dates between 1900 and 2199. ChargePeriodEnd is exclusive. A non-empty service label is required even for account-level tax or credit lines; label those records before uploading if the source leaves them empty.

Download [the invented FOCUS example](../frontend/public/billing/focus-example.csv).

## Export instructions

- **AWS:** Billing and Cost Management → Data Exports → FOCUS export → CSV delivery to S3. Download and decompress all CSV parts belonging to one run. Follow the [AWS Data Exports instructions](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html). FOCUS schema details are in [AWS's table dictionary](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-0-aws-columns.html).
- **Azure:** Cost Management → Exports → Cost and usage details (FOCUS) → CSV. Download the export from Azure storage. Follow the [Azure export instructions](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-improved-exports) and [FOCUS column reference](https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-focus).
- **Other providers:** map billed-cost rows to the simple template. Preserve signed credits, taxes, currency, and coverage. Native AWS CUR, Cost Explorer pivots, generic Azure/GCP exports, Excel, invoice PDFs, Gzip, ZIP, and Parquet are not automatically ingested.

## Accounting rules

- A report uses exactly one currency, also shared by its comparison. No exchange rates are inferred. Unknown or mixed codes stop the report.
- Costs are summed with fixed-point BigInt arithmetic at 8 decimal places. No financial aggregation uses binary floating point. Chart geometry uses numbers only for display. Cards, tables, Lumen, and exports format exact decimal strings directly, preserving cent rounding even near the supported total limit; exact values survive JSON and normalized CSV downloads. Positive charges or absolute negative adjustments above one trillion per period are rejected.
- Negative values reduce net cost. Taxes, refunds, and credits are included only when supplied; no extra tax or credit is added. FOCUS `ChargeCategory=Credit` with a positive amount is rejected rather than silently changing its sign.
- Repeated stable record IDs within the same provider/account namespace count once when their content matches. Conflicting versions stop the report.
- Records without IDs are checked for identical normalized billing content **and** extra source dimensions. A match requires the user to choose “Count once” (duplicate exports) or “Keep all” (separate identical charges). Extra dimensions prevent distinct resource charges being dropped; they are not retained in the report. Different IDs are treated as different charges. This cannot detect every duplicate from overlapping snapshots or differently shaped exports.
- Service groups use both provider and service name. Positive-charge shares use positive charges as their denominator, so credits cannot inflate or invert those percentages.
- Coverage defaults to the earliest start and latest exclusive end, rounded outward to UTC calendar dates. The form accepts an optional full window with **inclusive** end date; every interval must fit. Coverage is not proof of a complete bill. Gaps in the chart mean no records were supplied, not confirmed zero usage. Multi-day charges are plotted whole on their start date and explicitly labeled; they are not spread into invented daily costs.
- A comparison must be earlier, non-overlapping, and use the same currency. Both total and service differences are exact. Differing durations and provider coverage are disclosed. Percentages are unavailable when the previous net is zero or negative; otherwise percentages are rounded to one decimal. A service absent from one upload is identified as “Not in [current/previous] upload”, without claiming it was created or removed. These amounts locate changes but do not establish root cause, anomalies, forecasts, or savings.

## Privacy and Lumen

Billing files are read with browser File APIs. Normalized records and results exist only in React memory. There is no upload endpoint, browser persistence, external ingestion, or cloud login. Switching to the example, clearing data, reloading, or closing the tab drops the active uploaded report and its Lumen history. Replacing the current selection also removes its old comparison. A failed replacement leaves the earlier valid report available only via **Back to report**. A malformed comparison file blocks review until it is corrected or explicitly removed, so it cannot silently become a current-only report.

Uploaded-mode Lumen is explicitly a **local report guide**, using deterministic prepared answers for totals, services, credits, coverage, and changes. It is available without an API key. Questions, rows, filenames, and totals are not sent to an AI service. Unsupported questions get a local explanation of the boundary. It never invokes sample presets or `/api/ask-claude`.

The optional CCAC example still has its original server-grounded Lumen. Its free-form questions and example context are sent to Anthropic, as the UI explains. The server still rejects client-supplied report context. The example component is unmounted when returning to uploads, and pending sample requests are aborted. The previous PostHog script has been removed; Google font requests do not contain billing data. External help links use no-referrer behavior.

HTML reports escape all supplied text and contain no scripts or external resources. JSON carries exact normalized records and coverage. Separate current/previous CSV downloads preserve signed numeric amounts and neutralize formula-like **text** cells with an apostrophe; those protected labels may differ if reimported. Unknown source columns are not exported.

## Implementation and reuse

`src/lib/billing/csv.js` parses and normalizes files; `report.js` owns exact aggregates, findings, comparison and local Lumen answers; `export.js` renders the same report to HTML/JSON/CSV. `BillingApp` selects upload or dashboard and controls data reset. The `Dashboard` component in `App.js` provides the shared shell and all seven existing sections for both uploaded and example modes. `BillingDashboard.jsx` supplies its uploaded-data sections, reusing the dashboard cards and navigation. The existing `downloadCanonicalExport` download utility and `AskClaude` dialog/accessibility shell are reused. Uploaded mode never invokes the CCAC example model loader. CCAC sample validation, canonical exports, Lumen API, and reference cloud connectors remain separate; their data and schemas are not misrepresented as uploaded evidence.

## Release coordination

Keep this work in draft PR #32 on `codex/interface-polish` until Diana approves. Its original visual-polish commit remains in history. Preview deploys are authorized; production deployment and merging are not.

After approval, release the Guard upload flow and verify the production entry screen, template download and one invented upload **before** publishing the homepage promise “Upload your cloud billing export to see where your money went and what changed.” The homepage link should open Guard's root URL with **Review my cloud bill**. If the website draft is already ready, coordinate both releases so the promise never leads to the old sample-only tool. Do not change the production homepage as part of this PR.

## Reproducible checks

```bash
cd frontend
CI=true npm test -- --watchAll=false --runInBand
npm run test:api
CI=true npm run build
npx playwright install chromium --only-shell
npm run test:production-mount
npm run test:visual
```

The main invented fixtures have exact current charges `1362.375`, adjustments `-52.25`, net `1310.125`, previous net `996.6`, and delta `313.525` USD. The largest service movement is API compute, `240.025` USD. The FOCUS fixture is `48.6125` EUR net. These are test records, not customer data or savings evidence.
