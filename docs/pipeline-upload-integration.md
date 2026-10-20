# Preserve the analysis pipeline when adding billing uploads

## Product requirement and current status

Cloud Cost Guard should let visitors use the existing Cloud & Capital analysis system with their own evidence. The upload form is an entry point to that system. Assisted reviews should use the same system.

Draft PR #32 currently connects browser-local CSV calculations to the existing dashboard shell. The CSV flow is tested, but uploaded records do **not** pass through FinOps Lite, FinOps Watchdog, CCAC or Tech Spend Command Center. Its prepared local Lumen answers also use the separate billing report model. This is an unfinished pipeline integration and is not release-ready against this requirement.

The existing producer code, immutable example run, contract validation, reconciliation, canonical projection, exports and canonical Lumen path remain intact. Keeping those available as an example is not sufficient proof that customer uploads reuse them.

## Intended ownership

| Component | Responsibility for visitor data |
| --- | --- |
| Upload interface | Explain supported inputs, read/select files, report format errors and obtain any necessary processing consent |
| FinOps Lite | Normalize supported cloud billing evidence; own exact cloud totals, service/provider/date metrics, comparison metrics and source provenance |
| FinOps Watchdog | Analyze eligible observed daily series using its existing history, statistical and financial-materiality rules; preserve insufficient-history and quality states |
| Other specialist producers | Analyze their own supplied AI, SaaS or resilience evidence when available |
| CCAC | Validate artifact structure, evidence links, accounting boundaries, quality and cross-document semantics |
| Tech Spend Command Center | Assemble validated producer results; preserve accounting/overlap rules, missing scopes, canonical references and reconciliation |
| Cloud Cost Guard | Present the validated report, its findings and limits; generate exports and ground Lumen in the same evidence |

Calculation ownership stays with the analytical producers. Guard must not become a second cost-analysis engine with a matching visual layout.

## Gaps confirmed in the current implementation

1. `frontend/src/lib/billing/report.js` calculates upload totals, service groups, comparisons and findings independently of the analytical producers. `BillingDashboard.jsx` presents that model, while the canonical example uses the original presentation model.
2. FinOps Lite documents a real read-only AWS CCAC path and experimental CSV normalization helpers. A reviewed canonical input adapter for the upload format still needs to be established. The browser parser alone does not establish producer reuse or full FOCUS conformance.
3. Watchdog already consumes FinOps Lite's reconciled observed daily series. Its required history and materiality rules must remain authoritative. A monthly charge plotted on its start date must not be presented to Watchdog as observed daily usage; gaps must not be filled with invented zeros.
4. Command Center's documented illustrative orchestration consumes all five producers. Review and test the cloud-only/partial-run behavior needed for a cloud billing upload. Missing AI, SaaS or resilience evidence must not be supplied by example artifacts or zero-valued stand-ins.
5. Guard's canonical projection and browser validator explicitly pin the approved example's dates, inventories, values and artifact hashes. Accepting another valid run requires a reviewed report adapter and validation boundary. Disabling the example checks is not that adapter.
6. Canonical Lumen currently selects claims from the validated example report and rejects browser-supplied grounding. A visitor report needs the equivalent validated, per-report claim source. The new local guide is useful draft work, but does not prove reuse of that canonical path.

The input handling, privacy controls, dashboard wiring, invented fixtures, state-reset checks and layout work in this draft can be retained where appropriate. Adapt or replace the parallel calculation path as the producer connection is established.

## Release evidence required

- Process an invented supported bill through the actual analytical producer path and validate its emitted artifacts with the released CCAC validator.
- Assemble a report that truthfully represents only the supplied scopes. A cloud-only upload may show Cloud cost; it cannot imply a complete Cloud + direct-AI + SaaS total.
- Trace each displayed total, service/provider figure, comparison and finding back to a producer-owned metric or finding and its uploaded source evidence.
- Have dashboard views, HTML/JSON/CSV exports and Lumen consume that same validated result, with no sample artifact or value substituted.
- Exercise Watchdog with suitable daily evidence, an injected cost event, insufficient history and gaps. Preserve its existing detection and quality semantics.
- Reject changed hashes, mismatched runs, missing references, invalid accounting boundaries and other malformed artifacts before display.
- Preserve the approved illustrative run and all its existing validation and grounding tests.
- Verify clearing/replacing records, currency/credit/date/duplicate policies and desktop/mobile behavior through the connected path.
- Decide and document where the existing runtime executes. Keep processing local where feasible; clearly disclose any server or AI transfer. Billing files must not be committed to GitHub or trigger a public workflow containing their contents.

Keep PR #32 in draft until this evidence is available and Diana approves release. Coordinate the homepage upload promise with that release.

## Inspected sources

- [Guard architecture and trust](architecture-and-trust.md), its canonical projection/validation scripts, and the current upload implementation
- [FinOps Lite](https://github.com/cloudandcapital/finops-lite/blob/main/README.md)
- [FinOps Watchdog](https://github.com/cloudandcapital/finops-watchdog/blob/main/README.md)
- [Tech Spend Command Center](https://github.com/cloudandcapital/tech-spend-command-center/blob/main/README.md)
- [CCAC](https://github.com/cloudandcapital/cloud-capital-analysis-contract/blob/main/README.md)

Upstream documentation contains historical phase statements; implementation and validated run evidence must establish each supported connection before release.
