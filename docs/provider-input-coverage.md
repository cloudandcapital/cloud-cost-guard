# Provider input coverage

This matrix distinguishes code support, documentation and tested evidence. It
is not a claim that every current download, language or customer account passes.
The existing local producer pipeline, source hashes and partial-cost boundary
remain in place. No private bill was used in these checks.

| Provider / layout | Input path | Evidence and limit |
| --- | --- | --- |
| AWS FOCUS CSV / Gzip CSV | Selected stable FOCUS columns; all parts of one export run | Historical public mixed-provider FOCUS input and exact pipeline/browser tests pass. Current native AWS downloads and complete 1.2 conformance are not certified. Native CUR and Cost Explorer pivots remain separate formats. |
| Azure FOCUS CSV / Gzip CSV | Selected stable FOCUS columns | Historical Microsoft Toolkit sample rows and exact pipeline/browser tests pass. Current native customer downloads and arbitrary Azure usage schemas still need their own checks. |
| Google Cloud Cost table, English, flat/no grouping | Recognized CSV columns plus explicit invoice month and currency | Invented documented-layout fixture exercises usage, separate credits, tax, adjustment, rounding and a Total control. Exact net USD 108.830007, six counted rows from seven input rows. This is contract evidence, not a captured customer export. |
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

FinOps Lite PR21 merged as `9a3faacdfe6040c6e569e875f7a3da581819db81`.
Producer checks passed on Python 3.10, 3.11 and 3.12, including required quality,
dependency audit and package smoke checks. Local source tests: 118 passed, one
existing release skip. Guard interface/reader tests: 183 passed; pipeline
integration: 14 passed; native/WebAssembly parity includes the new Google path.
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
