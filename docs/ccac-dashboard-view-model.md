# Deterministic CCAC dashboard view model

`ccg-dashboard-view/1.0.0` is a static presentation projection of the already validated illustrative `trusted_report` in `fixtures/ccac/illustrative-v0.2.1/run`. It is not a replacement for CCAC validation. Phase 2 does not import the generated file into React, change public numbers, or provide it to Lumen.

Production generation always validates the complete seven-artifact run with the Phase 1 byte-integrity checker before reading `report.json`. The pure projection function is separately exposed only for semantic tests. A standalone, unvalidated report cannot be projected by the build command.

The projection additionally enforces the checked-in, versioned policy at `scripts/ccac_dashboard_view_policy_v1.json`. That policy is independent of the report being projected and explicitly pins the source-report identity, exact producer versions, complete metric and evidence inventories, producer associations, canonical metric/evidence/finding/opportunity/aggregate/reconciliation/quality relationships, artifact filenames, byte sizes and SHA-256 values, disclosures, and unsupported registry for `ccg-dashboard-view/1.0.0`. Counts, prefixes, well-formed hashes, and a whole-document hash are not accepted as substitutes for these reviewed identities and relationships. Array order is ignored only where order has no semantic meaning.

## Mapping contract

Every metric record carries `trace.canonical_id`, producer and version, source artifact, basis, quality, currency, unit, its own metric period, additivity, canonical formula, input metric IDs, and evidence IDs. Values are copied without arithmetic and serialized as decimal strings. Catalog arrays are indexed by canonical ID; output order uses stable IDs, dates, or the report's explicit display order.

| View-model path | Canonical report path and stable identity | Producer | Type / unit / period | Basis, quality, additivity | Transformation and missing behavior | Display safety |
| --- | --- | --- | --- | --- | --- | --- |
| `schema` | Projection constant `ccg-dashboard-view/1.0.0` | Cloud Cost Guard | string | projection identity | Exact constant | Versioned consumer contract |
| `identity.mode/status/contract/run_id/report_id/generated_at/report_period` | Same-named trusted-report fields; `report.tech-spend.trusted` | Command Center 0.2.1 | strings / report-wide period | canonical trust state | Exact copy after allowlist validation | Keeps illustrative mode prominent |
| `identity.source_report_sha256` | Raw `report.json` SHA-256 | Command Center 0.2.1 | lowercase SHA-256 | validated provenance | Exact constant for this fixture | Prevents source ambiguity |
| `identity.disclosures[]` | `display.disclosures[]` | Command Center 0.2.1 | bounded text | canonical disclosure | Exact text; missing fails | Preserves non-additivity and illustrative warnings |
| `source_metadata.catalog_counts` | Lengths of the four canonical catalogs | Command Center 0.2.1 | integral counts | source metadata | Exact required counts: 155/10/1/1 | Accounts for the complete source catalog without projecting every value |
| `source_metadata.manifest_sha256/artifact_sha256s` | `provenance` | Command Center 0.2.1 | SHA-256 strings | validated provenance | Sorted keys; missing fails | Connects records to immutable source artifacts |
| `producers[]` | `included_producers`, `producer_quality`, and `provenance.artifact_sha256s`, keyed by producer name | All five exact released versions | object / quality enum | `valid` or SaaS `partial` | Sorted by producer name; issues sorted by code; missing fails | Keeps partial SaaS evidence visible |
| `cloud.total` | `metric.cloud.total` | FinOps Lite 0.3.0 | decimal string / USD / currency / 2026-07-01..22 | observed, valid, additive | Exact value; no sum | Canonical cloud-only boundary |
| `cloud.comparison[]` | `metric.cloud.previous-total`, `metric.cloud.change-amount`, `metric.cloud.change-percentage` | FinOps Lite 0.3.0 | decimal strings / metric-specific unit and period | canonical basis; valid; canonical additivity | Fixed stable-ID order; formulas are copied, not evaluated | Canonical comparison only |
| `cloud.services[]` | Stable IDs `metric.cloud.service.*.cost` without `.day.` | FinOps Lite 0.3.0 | decimal strings / USD / cloud period | observed, valid, additive | Sorted by ID; no recomputed total | Service values remain separately traceable |
| `cloud.daily[]` | Stable IDs `metric.cloud.day.YYYY-MM-DD.cost` | FinOps Lite 0.3.0 | decimal strings / USD / each one-day period | observed, valid, additive | Sorted by date and ID; missing days are not synthesized | Canonical daily cloud series only |
| `ai.total` | `metric.ai.total-cost` | AI Cost Lens 0.2.0 | decimal string / USD / 2026-07-01..03 | calculated, valid, non-additive outside AI | Exact value; no recomputation | Retains potential cloud overlap boundary |
| `ai.metrics[]` | All stable IDs in `display.section_metric_ids.ai-cost-lens` | AI Cost Lens 0.2.0 | decimal strings / canonical token, request, ratio, or currency units and periods | provider-reported observed or calculated as canonical; valid; canonical additivity | Sorted by ID; null remains null | Preserves provider, model, allocation, cost basis, price evidence, and unattributed dimensions |
| `ai.unattributed_findings[]` | Displayed `finding.allocation.*` | AI Cost Lens 0.2.0 | finding/status object | producer quality | Exact allowlisted fields | Explicitly states unattributed cost is not savings |
| `ai.cross_domain_additivity` | `metric.ai.total-cost.additivity` and disclosure | AI Cost Lens 0.2.0 | enum | non-additive | Exact machine label | Prevents cloud-billing double counting |
| `saas.invoice_metrics[]` | `metric.saas.crm-9261ceef.invoice-cost`, `metric.saas.design-a77de8a6.invoice-cost` | SaaS Cost Analyzer 0.2.0 | decimal strings / USD / annual and quarterly periods respectively | observed, valid, additive only inside each invoice boundary | Sorted by ID; never summed | Keeps supplied invoice boundaries separate |
| `saas.combined_total` | No canonical metric | none | null | unsupported | Always null | Prevents an invented SaaS total |
| `findings[]` | All ten `finding_catalog` records selected by `display.finding_ids` | Watchdog, Recovery Economics, AI Cost Lens, SaaS Analyzer | bounded text/status/enums | relevant producer quality | Explicit display order; linked IDs must resolve | Every displayed finding remains canonical and audit-visible |
| `anomalies[]` | Two `finding.anomaly.*` records and their `.observed`, `.expected`, `.impact`, `.change-percent`, `.robust-score` metrics | FinOps Watchdog 0.4.0 | decimal strings / canonical units / one-day periods | observed or calculated; valid; canonical additivity | Stable display order; no arithmetic | `impact_classification=anomaly_impact_not_savings` |
| `resilience.findings[]` | Five displayed `finding.resilience-gap.*` records | Recovery Economics 0.2.1 | finding/status objects | valid | Explicit display order | Does not assert recoverability |
| `resilience.modeled_metrics[]` | All resilience metrics with canonical `estimated` basis | Recovery Economics 0.2.1 | decimal strings / canonical units / 2026-08-01..09-01 | estimated, valid, canonical additivity | Sorted by ID; formulas copied only | Separates modeled exposure from invoices and savings |
| `resilience.observed_restore_metrics[]` | `metric.resilience.orders-db.tested-*` | Recovery Economics 0.2.1 | decimal strings / hours / metric period | observed, valid, non-additive | Sorted by ID | Keeps observed failed test evidence separate from modeled RTO/RPO |
| `resilience.recoverability_classification` | Restore-evidence finding and disclosures | Recovery Economics 0.2.1 | enum | not demonstrated | Exact projection classification | Prevents a demonstrated-recoverability claim |
| `opportunity.source` | `opportunity.saas.crm-9261ceef.renewal-seat-review` | SaaS Cost Analyzer 0.2.0 | annual USD estimate and lifecycle object | estimated, low confidence, identified | Decimal strings; safeguard booleans retained; review text validated but not rendered | Review-first; no verified/realized classification |
| `opportunity.annual_aggregate` | `aggregate.opportunities.annual.usd` plus its sole canonical source opportunity | Command Center 0.2.1 | annual USD low/expected/high | aggregate values are canonical; estimated basis and low confidence are inherited from the sole included source opportunity | No arithmetic and no monthly conversion | Retains overlap-safe aggregate and source opportunity ID |
| `unsupported[]` | Projection allowlist derived from explicit report absences and disclosures | Cloud Cost Guard | reason-code objects | unsupported | No numeric field | Makes missing concepts explicit without substituting zero |

Metric and evidence producer ownership is verified against the exact versioned policy and the canonical `display.section_metric_ids` registry. Finding, opportunity, aggregate, reconciliation, and quality relationships must match the complete pinned graph. Missing, additional, renamed, substituted, duplicated, or cross-associated identities fail the whole projection. Artifact provenance must match the approved producer, version, filename, byte size, and digest; correctly formatted but unapproved hashes fail closed.

## Numeric and missing-data policy

The build loader parses JSON decimals as `Decimal`. Currency, percentages, scores, hours, and other precision-sensitive values serialize as exact base-10 strings. Integral catalog counts stay integers. The projection never sums, rounds, forecasts, normalizes, annualizes, converts periods, or evaluates formulas. A canonical `null` remains `null` and requires an `unknown_reason`; an unknown value cannot be replaced by zero. Canonical explicit zero remains the string `"0"` or `"0.0"` according to its source lexical value.

## String safety

Projected strings are bounded and treated only as JSON data. Control characters, Unicode directional controls, and angle-bracket markup are rejected. No HTML or renderable Markdown is generated, and formulas remain inert text. A validation failure returns no partial view model and does not replace an existing output.

## Unsupported registry

| Concept | Reason code |
| --- | --- |
| Combined total technology spend | `incompatible_boundaries` |
| Cloud + AI + SaaS additive total | `incompatible_boundaries` |
| Combined scope donut | `incompatible_boundaries` |
| Combined daily technology-spend series | `missing_canonical_metric` |
| Next-month forecast | `missing_canonical_metric` |
| Browser-created avoidable run rate | `browser_derived_value_forbidden` |
| Monthly opportunity scalar | `period_conversion_forbidden` |
| Tagging coverage | `missing_canonical_metric` |
| Kubernetes cost or utilization | `missing_canonical_metric` |
| Verified savings | `trust_classification_forbidden` |
| Realized savings | `trust_classification_forbidden` |
| Demonstrated recoverability | `insufficient_passing_evidence` |
| Zero substituted for unknown | `missing_value_substitution_forbidden` |

## Regeneration

From the repository root:

```bash
python scripts/build_ccac_dashboard_view.py
python scripts/build_ccac_dashboard_view.py --check
python -m unittest tests.test_ccac_dashboard_view -v
```

CI validates the complete fixture, generates into a temporary file, byte-compares it with `frontend/src/data/ccac-dashboard-view.generated.json`, and runs the semantic tests. The existing released Command Center validation remains mandatory.

Phase 2 deliberately does not connect this file to the dashboard. React, exports, charts, the legacy scenario, Lumen, and `/api/ask-claude` remain unchanged and out of scope.
