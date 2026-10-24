# Billing uploads through the existing analytical pipeline

Cloud Cost Guard is the public interface to Cloud & Capital's analytical system.
A visitor chooses a supported billing CSV, the existing producers analyze it on
that visitor's device, and the validated result opens in the existing dashboard.
An assisted review can run the same pipeline; manual handoff is optional.

## Ownership and runtime

| Component | Responsibility for visitor data |
| --- | --- |
| Upload interface | Explain supported formats, preflight CSV files, collect period/duplicate choices and show plain errors |
| FinOps Lite | Normalize supported cloud bills; own exact signed totals, service/provider/date metrics, comparisons, findings and source evidence |
| FinOps Watchdog | Apply its existing median/MAD, history, severity and materiality rules to eligible observed daily metrics |
| CCAC 0.2.0 | Validate unchanged 1.1 artifact schemas, evidence links, boundaries and cross-document semantics |
| Tech Spend Command Center | Assemble the partial report, explicit omissions and exact reconciliation; verify hashes and producer ownership |
| Cloud Cost Guard | Format and render the read-only presentation; export the same evidence and ground local Lumen answers in it |

The actual Python sources run in a Pyodide Web Worker. There is no hosted upload
endpoint, cloud credential request, public GitHub workflow containing a bill, or
AI transfer in this flow. The original CSV enters a fixed Python function as JSON
data. Temporary artifacts use its memory filesystem; the worker is terminated
on success, error, timeout or navigation. Results remain in tab memory.

Source is copied verbatim from reviewable upstream commits with file hashes and
licenses in [the source lock](../pipeline/sources.lock.json). Runtime preparation
verifies the source digests and the pinned dependency wheels. See
[packaging and reproduction](../pipeline/README.md).

## Scope and comparison

A supplied cloud bill establishes supplied billed Cloud cost, not complete
organizational coverage or an all-in Cloud + direct AI + SaaS total. Direct AI,
SaaS and resilience producers are explicitly omitted with reasons. No absent
producer is replaced with zeros or sample artifacts. The default complete-run
policy still requires all five producers.

FinOps Lite preserves signed credits, 18-place money precision, date coverage,
currency separation and deliberate duplicate handling. An earlier non-overlapping
upload supplies period comparisons. Multi-day FOCUS/simple amounts are charted on their charge
start date, never spread into synthetic daily spend. Watchdog receives only
consecutive observed full UTC days with nonnegative daily totals. Short history,
missing days, monthly intervals and negative daily adjustments remain explicit
limits. A single upload can contain daily history suitable for Watchdog without
providing a separate period comparison.

The former JavaScript upload calculator was removed. Provider subtotals, chart
'Other' groups, shares, differences and finding values come from producer-owned
canonical metrics. The presentation retains metric and finding references.
Evidence JSON includes original exact artifact strings and source revisions;
JavaScript cannot round their numeric lexemes. Lumen is a local prepared guide
over the validated presentation, including Watchdog findings and limits. It
never borrows example claims or invokes the sample-only Anthropic API.

## Review and verification

The adapters were reviewed and merged in:

- [FinOps Lite #19](https://github.com/cloudandcapital/finops-lite/pull/19)
- [Watchdog #8](https://github.com/cloudandcapital/finops-watchdog/pull/8)
- [Command Center #8](https://github.com/cloudandcapital/tech-spend-command-center/pull/8)
- [Guard #32](https://github.com/cloudandcapital/cloud-cost-guard/pull/32), preserving its visual polish

Invented fixtures establish USD 1,310.125 current net, USD 996.6 previous net,
USD 313.525 change (31.5%), and a USD 240.025 compute movement. Native Python and
WebAssembly produce identical canonical artifacts for the same fixed run.
Released CCAC validation passes, services reconcile exactly, and the report
remains partial. An invented 21-day series injects a 250/day event after 100/day
history; the unchanged Watchdog detector finds it.

Checks also reject altered artifact hashes, rehashed changes to non-headline
catalog values, substituted omitted scopes, missing artifacts, forged daily
values, mismatched privacy classification, bad boundaries and path changes.
Browser checks cover all sections, local Lumen, exact exports, provider filters,
invalid files, credits, currency, duplicates, replacement/clear, worker
cancellation, switching examples, and desktop/mobile layout. The approved
illustrative run retains its original exact pins and validation/grounding tests.

Provider precision and explicit UTC confirmation are extended in FinOps Lite #20; exact daily lineage is extended in Watchdog #9. Source snapshots are still copied verbatim, not patched in Guard.

The public billing upload uses the revisions in the current source lock. Review their source hashes
and the production upload flow again whenever the vendor snapshots change.

Google Cost table ingestion is owned by FinOps Lite in the same pipeline. The browser collects explicit month/currency context and performs preflight only; the producer checks/excludes Total controls and owns aggregation. Original text and choices stay in evidence. This monthly input produces no daily anomaly series, and the UI uses an invoice-month view instead of a daily chart.
