# Review your own cloud bill

Uploads run FinOps Lite → Watchdog → released CCAC validation → Command Center locally, using the reviewed source snapshots in [the pipeline lock](../pipeline/sources.lock.json). The dashboard and Lumen receive the validated read-only presentation. [Ownership and evidence](pipeline-upload-integration.md) are documented separately.

The start screen accepts billing CSVs without cloud credentials. Select the current period's files, optionally add a separate earlier period, and choose **Review my bill**. Your records populate the existing Cloud Cost Guard dashboard: the same header, summary cards, section navigation, charts, export menu and Lumen panel. There is no separate result-page product. **Try an example** reviews the downloadable current/previous invented CSVs through this same local pipeline in illustrative mode; it is never used to complete missing upload data. The original full technology spend demo is a separate secondary action inside the export instructions.

**Findings** explains totals, service drivers and supplied comparisons. **Services** accounts for all service groups and signed credits. **Clouds** charts the uploaded records and filters only providers actually present, with explicit filtered subtotals; the headline, exports and Lumen continue to cover the whole upload. **Overview** explains the cost basis and coverage. A single **Not in this file** card in Overview explains missing workload, direct-vendor AI and SaaS evidence and links to Technology Cost Review. Upload mode has four tabs, without three empty category tabs. Provider-billed AI can still be present in the supplied service costs.

GitHub Actions tests, validates and builds the app and its tracked illustrative fixtures. That CI workflow is distinct from the Cloud & Capital analysis pipeline, whose producers own calculations, evidence and findings. Billing review invokes those Python producers in a local WebAssembly worker, not in a public GitHub workflow. The reference cloud connectors remain disconnected from production ingestion.

## Supported files

UTF-8 comma-separated `.csv` or locally expanded `.csv.gz`, with a header and at least one record. Quoted commas, escaped quotes, embedded newlines, BOM, LF, and CRLF are supported. Headers are case-insensitive and trimmed. Every row must have the same number of cells. The entire selection fails on any invalid row; rows are never silently skipped.

Each period accepts up to 20 parts, 10 MB combined before and after decompression, 50,000 input records, 1,000 service groups, and 366 calendar days. Choose all parts of **one** export run. This reader cannot establish whether an export includes every account or charge. Do not combine daily snapshots of a month-to-date export: those snapshots often repeat charges.

### Simple format

| Column | Meaning |
| --- | --- |
| `Date` | Required charge start date, `YYYY-MM-DD` |
| `Service` | Required service or adjustment label |
| `Cost` | Required signed billed amount; decimal point, up to 18 places |
| `Currency` | Required supported three-letter currency code, such as USD or EUR |
| `Provider` | Optional; missing values display as “Not specified” |
| `RecordId` | Optional stable line-item identity, unique within Provider + BillingAccountId |
| `BillingAccountId` | Optional identity namespace for RecordId |
| `EndDate` | Optional exclusive charge end; monthly totals use the next month start. Ambiguous first-of-month records require an explicit one-day/monthly UI choice |

Download [the template](../frontend/public/billing/template.csv), [an invented current bill](../frontend/public/billing/current-example.csv), and [its earlier comparison](../frontend/public/billing/previous-example.csv).

### FOCUS billing CSV

Required headers: `ChargePeriodStart`, `ChargePeriodEnd`, `ServiceName`, `BilledCost`, `BillingCurrency`. Optional `ProviderName`, `RecordId`, `BillingAccountId`, `ChargeCategory`, `BillingPeriodStart`, `BillingPeriodEnd` and `InvoiceId` are read. Billing-period boundaries define comparison dates while earlier usage corrections retain their charge dates; different billing windows use their combined range with a warning. The reader supports these stable columns from FOCUS exports; it does **not** assert full FOCUS conformance. `EffectiveCost` and `ListCost` never substitute for `BilledCost`.

UTC timestamps (for example `2026-09-01T13:00:00Z`) and ISO dates are accepted. UTC `+00:00` is accepted; other offsets are rejected. Timezone-less timestamps stop preflight until the visitor explicitly confirms that this export uses UTC. This choice is passed to the producer, recorded in report warnings and source mapping notes, and does not rewrite the source text. Dates must be real calendar dates between 1900 and 2199. ChargePeriodEnd is exclusive. FOCUS rows with no service name retain their amounts under a flagged service-not-supplied label, based on their supplied ChargeCategory. No service is inferred. Explicit BigQuery timestamps ending in UTC and up to six fractional-second digits are supported without dropping microseconds.

Valid minute-precision UTC boundaries such as `2024-06-12T00:00Z` are accepted,
including Microsoft's published EA example. Timezone-less values still require
explicit UTC confirmation. Amounts and original source text stay unchanged.

Download [the invented FOCUS example](../frontend/public/billing/focus-example.csv).

### Google Cloud Cost table CSV

Recognized invoice/statement key-value header lines can stay before the cost
table. Up to 32 document rows are read separately; unknown preceding records stop
the file. An explicit document currency must match your confirmation. Invoice
dates and header totals do not override the selected month or become charges.
The original full-file hash includes these headers, and mapping notes disclose
the separate document rows.

The English Cost table export is a separate invoice-month format. Include
`Service description`, `Cost type` and `Unrounded cost` (recommended) or `Cost`.
Money column labels such as `Unrounded Cost ($)` are recognized. List cost is
not substituted. Choose the file, then confirm the invoice month and the
three-letter billing currency from the invoice or statement. A dollar symbol
alone does not establish USD. Replacing files clears those choices.

Credits are already separate signed rows. Taxes, adjustments and rounding rows
remain in the review. A single `Cost type=Total` row is a reconciliation control,
not another charge: FinOps Lite checks it at two-decimal invoice precision both before and after duplicate handling, and
excludes it from financial totals. A mismatch or multiple Total rows stops the
review. If Unrounded cost is missing for a row, its supplied Cost value can be
used with a warning; missing values are never replaced with zero.

The confirmed month supplies the reporting window. Usage dates can fall outside
that invoice month; the records cannot establish daily spending. Clouds shows
an invoice-month view, and Watchdog gets no invented daily observations.
The original CSV stays unchanged. Downloads record its hash, normalized charges,
selected month/currency and any rounded fallback, rather than embedding every
original column. Review this layout separately from another representation of
that bill. Filters and incomplete account coverage remain the visitor's check.

## Export instructions

- **AWS:** Billing and Cost Management → Data Exports → FOCUS export → CSV delivery to S3. Download and select all `.csv.gz` parts belonging to one run; Guard expands them locally. Follow the [AWS Data Exports instructions](https://docs.aws.amazon.com/cur/latest/userguide/dataexports-create.html). FOCUS schema details are in [AWS's table dictionary](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-2-aws.html).
- **Azure:** Cost Management → Exports → Cost and usage details (FOCUS) → CSV. Download the export from Azure storage. Follow the [Azure export instructions](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-improved-exports) and [FOCUS column reference](https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-focus).
- **Google Cloud:** Billing → Cost table → choose the invoice month → reset filters → Group by: No grouping. Include Service description, Cost type and Unrounded cost, then download CSV. Confirm month/currency in Guard. Follow the [Google Cost table instructions](https://docs.cloud.google.com/billing/docs/how-to/cost-table).
- **Other exports:** map billed-cost rows to the simple template. Preserve signed credits, taxes, currency, and coverage. Native AWS CUR, Cost Explorer pivots, generic Azure usage exports, non-FOCUS BigQuery exports, Excel, invoice PDFs, ZIP, and Parquet are not automatically ingested.

## Accounting rules

- A report uses exactly one currency, also shared by its comparison. No exchange rates are inferred. Unknown or mixed codes stop the report.
- FinOps Lite sums costs with exact Decimal arithmetic and accepts up to 18 decimal places. No financial aggregation uses binary floating point. Chart geometry uses numbers only for display. Cards, tables, Lumen, and exports format exact decimal strings directly, preserving cent rounding even near the supported total limit; exact values survive JSON and normalized CSV downloads. Positive charges or absolute negative adjustments above one trillion per period are rejected.
- Negative values reduce net cost. Taxes, refunds, and credits are included only when supplied; no extra tax or credit is added. FOCUS `ChargeCategory=Credit` with a positive amount is rejected rather than silently changing its sign.
- Repeated stable record IDs within the same provider/account namespace count once when their content matches. Conflicting versions stop the report.
- Records without IDs are checked for identical normalized billing content **and** extra source dimensions. A match requires the user to choose “Count once” (duplicate exports) or “Keep all” (separate identical charges). Extra dimensions prevent distinct resource charges being dropped; they are not retained in the report. Different IDs are treated as different charges. This cannot detect every duplicate from overlapping snapshots or differently shaped exports.
- Service groups use both provider and service name. Positive-charge shares use positive charges as their denominator, so credits cannot inflate or invert those percentages.
- Coverage defaults to the earliest start and latest exclusive end, rounded outward to UTC calendar dates. The form accepts an optional full window with **inclusive** end date; every interval must fit. Coverage is not proof of a complete bill. Gaps in the chart mean no records were supplied, not confirmed zero usage. Multi-day charges are plotted whole on their start date and explicitly labeled; they are not spread into invented daily costs.
- A comparison must be earlier, non-overlapping, and use the same currency. Both total and service differences are exact. Differing durations and provider coverage are disclosed. Percentages are unavailable when the previous net is zero or negative; otherwise percentages are rounded to one decimal. A service absent from one upload is identified as “Not in [current/previous] upload”, without claiming it was created or removed. Period comparisons locate changes but do not establish root cause, forecasts, or savings. Watchdog separately applies its existing detector to eligible observed daily evidence; short history, gaps, monthly intervals and negative days remain explicit quality limits.

## Privacy and Lumen

Billing files are read with browser File APIs. Native browser Gzip decompression is bounded by the combined expanded-byte limit, checks the archive checksum, and preserves original expanded CSV text including BOM and line endings. Evidence source hashes identify that expanded CSV, not the compressed archive. Browsers without decompression support get an explicit extraction instruction. Records and results exist only in tab memory; Python temporary artifacts use the worker’s memory filesystem. The worker is terminated after success, error, cancellation or timeout. There is no upload endpoint, browser persistence, external ingestion, or cloud login. Switching to the example, clearing data, reloading, or closing the tab drops the active uploaded report and its Lumen history. Replacing the current selection also removes its old comparison. A failed replacement leaves the earlier valid report available only via **Back to report**. A malformed comparison file blocks review until it is corrected or explicitly removed, so it cannot silently become a current-only report.

Uploaded-mode Lumen is explicitly a **local report guide**, using deterministic prepared answers for totals, services, credits, coverage, changes, and producer-owned Watchdog findings. It is available without an API key. Questions, rows, filenames, and totals are not sent to an AI service. Unsupported questions get a local explanation of the boundary. It never invokes sample presets or `/api/ask-claude`.

The quick billing example uses the same local prepared Lumen answers. Only the separate full technology spend demo has the original server-grounded Lumen. Its free-form questions and example context are sent to Anthropic, as the UI explains. The server still rejects client-supplied report context. The example component is unmounted when returning to uploads, and pending sample requests are aborted. The previous PostHog script has been removed; Google font requests do not contain billing data. External help links use no-referrer behavior.

HTML reports escape all supplied text and contain no scripts or external resources. JSON carries exact normalized records, coverage, source revisions, metric/finding references and original canonical artifact strings with hashes. Keep those strings intact to preserve exact monetary numeric tokens when revalidating. Separate current/previous CSV downloads preserve signed numeric amounts and neutralize formula-like **text** cells with an apostrophe; those protected labels may differ if reimported. Unknown source columns are not exported.

## Implementation and reuse

`csv.js` provides file preflight; `pipeline.js` invokes the local worker and formats its validated presentation. Financial aggregation, provider filters, chart groups, changes and findings are owned by the Python producers in `pipeline/vendor`, copied verbatim from pinned upstream revisions. `report.js` contains formatting and the deterministic local Lumen guide; there is no parallel JavaScript calculator. `export.js` renders the same report to HTML/JSON/CSV. `BillingApp` manages selection/reset; the dashboard, cards, tabs, export utility and `AskClaude` dialog are shared. The complete example loader and API are never used to complete upload data. See [runtime packaging](../pipeline/README.md).

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

## Provider compatibility regression

The attributed public FOCUS fixture under `tests/fixtures/provider-inputs` contains 1,000 unchanged historical AWS/Microsoft/Oracle rows, with 11-place amounts and timezone-less timestamps. Without a UTC choice it must stop. With an explicit UTC test interpretation, exact net is USD `20.52022672899`; each provider subtotal reconciles. It is not a current native export or a Google Cloud test. The separate 10,000-row public extract reconciles to USD `151.43009124197`.

Run `node --test scripts/billing-inputs.test.mjs` for bounded plain/Gzip transport tests, `python -m unittest tests.test_billing_pipeline -v` for canonical evidence checks, and `node --test scripts/billing-runtime.test.mjs` for native/WebAssembly parity.

The documented-layout Google contract fixture reconciles six counted records and one excluded Total control to exact USD `108.830007`; the rounded invoice control is USD `108.83`. It is invented, not a captured customer export. Current provider/download coverage and remaining checks are tracked in [the coverage matrix](provider-input-coverage.md).

## Independent audit fixes, October 23

Google Count once cannot invalidate a Total control. Invoice/statement header
totals are compared separately and visible differences are retained, including
in print/JSON exports. They are review warnings, not proof of missing charges:
Google documents legitimate differences caused by timing, multiple invoices and
memos. An explicit Invoice month header must match confirmation; invoice dates
do not infer that month. Cost-column symbols reject impossible currency pairs.

Template total/subtotal lines and positive credit/refund/discount labels stop
preflight. Ambiguous comma-only costs stop instead of guessing; explicit thousands grouping with a decimal point is disclosed in bounded notes; no sign or locale
is guessed. EndDate is included in the blank template. A first-of-month file
without charge ends asks whether it contains daily records or monthly totals.

The daily average is a producer-owned metric: net cost divided by reporting days.
It is not a forecast or measured daily usage. Lumen states forecast and tax/rate
verification limits explicitly. Findings give owner questions without assigning
unproven causes. The headline has a neutral calculation note, not a provider-
reconciliation tick. The separate bill-check panel shows supplied controls or
says none were supplied.

AWS instructions recommend FOCUS 1.2, Daily, Gzip CSV, Overwrite and all parts of
one run. MOSP Azure accounts cannot export FOCUS; some pay-as-you-go accounts
are MCA and can. Provider manifests are not read or used to certify completeness.
Wide files can reach the existing 10 MB cap before the 50,000-row limit.

Downloads use inclusive dates in filenames and formatted currencies in the
printable report, while records/evidence retain exact amounts and exclusive
timestamps. An open personal bill adds the browser's standard leave/reload
warning; clearing data removes it. Physical print/Safari/real-device checks and
current customer provider exports remain separate unverified acceptance work.

## Independent recheck follow-up (October 24)

The simple template rejects explicit summary labels including Invoice total, Total charges, Totals, Total due and Total (USD). They must not become a second charge. A Credit card processing fee is still a real positive charge. Single-comma amounts such as 1,500 remain ambiguous; a valid multi-group amount such as 1,500,000 is unambiguous.

Google Invoice month headers accept YYYY-MM and English Month YYYY. An unknown header format leaves the decision with the visitor's explicit month confirmation and produces a warning. A recognized conflicting month still stops. Explicit Google/FOCUS Tax categories retain their exact signed tax metric. It is an amount lookup, not tax validation.

Late rows wholly outside their supplied billing window stay in bill totals and downloads. They are kept out of the current window's daily observations and noted separately. Missing in-window dates, partial days and negative daily totals still cannot become spike evidence. The displayed checked-series count excludes histories too short to run the detector.

Lumen answers supplied-month, tax-amount and invoice-gap questions from this report, while future-cost and correctness limits stay explicit. Header mismatches show their source-owned difference and are also marked next to the headline. The printable HTML places the headline and bill checks together and has compact A4/Letter print styling. The mobile Lumen action sits in the header instead of covering report text.
