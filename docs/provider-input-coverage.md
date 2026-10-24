# Provider input coverage

This matrix distinguishes code support, documentation and tested evidence. It
is not a claim that every current download, language or customer account passes.
The existing local producer pipeline, source hashes and partial-cost boundary
remain in place. No private bill was used in these checks.

| Provider / layout | Input path | Evidence and limit |
| --- | --- | --- |
| AWS FOCUS CSV / Gzip CSV | Selected stable FOCUS columns; all parts of one export run | Historical public mixed-provider FOCUS input and exact pipeline/browser tests pass. Current native AWS downloads and complete 1.2 conformance are not certified. Native CUR and Cost Explorer pivots remain separate formats. |
| Azure FOCUS CSV / Gzip CSV | Selected stable FOCUS columns | The unchanged first 1,000 records of Microsoft's published EA FOCUS 1.0 demo file retain all 96 columns and exact net USD 83.346183636400141. Valid minute-precision UTC boundaries are supported. This 2024 demo prefix is format evidence, not a current customer download or FOCUS 1.2 certification. |
| Google Cloud Cost table, English, flat/no grouping | Recognized CSV columns and optional document headers, plus explicit invoice month and currency | Invented documented-layout fixtures exercise usage, separate credits, tax, adjustment, rounding, a Total control and invoice/statement metadata before the charge table. Exact net USD 108.830007, six counted charge rows from seven table rows. These are contract checks, not a captured customer export. |
| Google Cloud FOCUS scalar CSV | Same supported FOCUS columns | Explicit UTC suffix and microsecond boundaries are tested, including an unassigned tax row. Arbitrary nested BigQuery exports are not automatically converted. |
| Simple billing CSV | Date, Service, Cost, Currency | Existing exact signed costs, comparisons, source evidence and downloads remain tested. A template pass does not certify a provider-native layout. |

## New compatibility behavior

FOCUS rows with missing ServiceName keep their amounts under a clearly flagged
unassigned label. The category is source-supplied, not a guessed service. UTC
BigQuery serialization and up to six fractional seconds preserve original time
precision. Google Cost table uses its signed amount rows directly; credits are
not added again, and a Total control is reconciled and excluded from charges.
Month/currency context and the hash of the unchanged source remain in canonical
evidence; downloads contain normalized records, not every original CSV column.
No daily observations are invented from an invoice-month summary.

The current provider-documentation pass found and repaired two additional
boundaries: Microsoft's published CSV uses explicit UTC timestamps without
seconds; Google's Cost table download can include invoice/statement header lines
before its columns. Up to 32 recognized key-value metadata rows are read
separately, with original line numbers and full CSV hashes preserved. Unknown
preceding rows stop the file. Clear document currencies must match confirmation;
invoice dates and header totals never replace charge rows or the selected month.

FinOps Lite PR24 merged as `8be01c196701fce47f6d09dae18374ab07f6e4bd`,
preserving existing simple/FOCUS column order after PR23's document-header fix.
Producer checks passed on Python 3.10, 3.11 and 3.12, including required quality,
dependency audit and package smoke checks. Local source tests: 131 passed, one
existing release skip. Guard interface/reader tests: 188 passed; pipeline
integration: 15 passed; native/WebAssembly parity: seven passed, including the
provider-published Microsoft prefix and Google document-header fixture.
Final browser/release evidence is recorded with the app pull request.

## Provider documentation

- [AWS FOCUS 1.2 table](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-2-aws.html)
- [Azure FOCUS schema](https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-focus)
- [Google Cost table fields and CSV behavior](https://docs.cloud.google.com/billing/docs/how-to/cost-table)
- [Google FOCUS export schema](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/focus-export)

## Remaining acceptance

Use authorized/redacted current AWS/Azure downloads and a separately sourced
Google Cost table export to check actual delivered headers, amounts, credits,
taxes, Total controls, periods and account coverage. Keep these results separate
from invented contract fixtures and historical public FOCUS data. Localized CSVs,
ZIP/Parquet, invoice PDFs and arbitrary native layouts require separate support;
no general bill-import promise follows from the paths above.

## Independent-audit acceptance follow-up

FinOps Lite PR25/26 add post-duplicate Google Total enforcement, separately
visible invoice header comparisons, explicit month/symbol/sign/summary-row
checks, confirmed monthly templates, invoice billing periods and labelled daily
averages. Combined provider billing windows remain supported with a warning.
These are format/control fixes, not new current-customer export certification.
AWS instructions now choose FOCUS 1.2 Daily/Gzip CSV; Azure MOSP is explicitly
unsupported for native FOCUS export. Manifests remain unread and completeness
not verified. Wider-file capacity, hourly-to-daily evidence, provider manifest
checks and scientific notation remain bounded future work requiring evidence.
