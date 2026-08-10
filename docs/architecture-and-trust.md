# Architecture and trust boundaries

Cloud Cost Guard is the read-only presentation layer for a deterministic Technology Spend evidence pipeline. The public application uses a tracked illustrative dataset; it does not connect to customer accounts, credentials, production resources, or live billing systems.

## System architecture

The validated data flow is:

```text
illustrative source artifacts
  -> analytical producers
  -> Tech Spend Command Center
  -> validated CCAC 1.1 trusted report
  -> fail-closed Cloud Cost Guard presentation model
  -> React dashboard, canonical exports, and Lumen explanations
```

Each producer has a distinct responsibility and accounting treatment:

| Producer | Responsibility | Technology Spend treatment |
| --- | --- | --- |
| FinOps Lite | Observed Cloud billing evidence | Canonical additive Cloud scope |
| AI Cost Lens | Direct-vendor and provider-billed AI analysis | Direct-vendor AI is additive; broader AI is non-additive |
| SaaS Cost Analyzer | SaaS invoice, entitlement, and reporting-period evidence | Canonical additive same-period SaaS scope |
| FinOps Watchdog | Anomaly detection | Diagnostic only; excluded from Technology Spend |
| Recovery Economics | Modeled and observed resilience evidence | Diagnostic only; excluded from Technology Spend |

Tech Spend Command Center validates the producer artifacts, applies accounting and overlap rules, reconciles the eligible scopes, and publishes the trusted report. CCAC defines and validates the machine-readable contract. Cloud Cost Guard validates a deterministic projection of that report before rendering it.

## CCAC 1.1 validation

The tracked CCAC 1.1 run contains seven JSON files: five producer artifacts, `report.json`, and `manifest.json`. Validation requires the complete run and checks its schema, report identity, report and manifest hashes, producer inventory, artifact hashes, periods, bases, units, currencies, additivity classifications, evidence references, exact values, and reconciliation record.

The generated presentation view records the approved producer commits and versions, artifact filenames and SHA-256 hashes, CCAC release and wheel hash, Command Center commit, trusted-report hash, report-provenance manifest hash, and final manifest hash. This creates a traceable path from each displayed metric or finding to its canonical ID, producer, source artifact, evidence IDs, period, basis, unit, currency, quality, and accounting classification.

Validation fails closed. A mismatch produces a canonical error state; the application does not substitute legacy or partial data.

## Deterministic financial calculations

Financial values are parsed and reconciled with exact decimal arithmetic before they reach the browser. The approved illustrative report publishes:

- Cloud: USD `2194.0`
- Direct AI: USD `8.2825`
- SaaS: USD `736.77`
- Technology Spend: USD `2939.0525`
- Reconciliation: `passed`, exact difference USD `0.0`

The projection independently sums the three eligible scopes and requires an exact match with the published total and reconciliation record. Browser number conversion is limited to display and chart rendering; it is not used to calculate canonical financial values.

Missing data remains missing. The unsupported registry keeps Azure, GCP, Kubernetes, forecasting, tagging coverage, combined daily Technology Spend, realized or verified savings, demonstrated recoverability, and unknown-as-zero behavior outside the published view.

## Additivity and overlap rules

Broader AI is USD `12.5325`, but it is non-additive because it includes provider-billed AI already represented inside Cloud. Only the USD `8.2825` direct-vendor AI scope is added to Technology Spend.

The supplied SaaS invoices are USD `8640.0` annual and USD `1050.0` quarterly. Their periods are incompatible, so they remain separate evidence records. The canonical SaaS scope is the same-period USD `736.77` allocation; neither the browser nor Lumen may combine those invoices.

FinOps Watchdog reports diagnostic anomaly impact, not savings. Recovery Economics keeps modeled scenarios separate from observed restore-test evidence, and recoverability remains `not demonstrated`. Neither producer contributes an additive spend scope.

## Shared presentation grounding

React, canonical HTML and JSON exports, deterministic Lumen presets, and the production Lumen API consume the same validated CCAC 1.1 presentation model. The browser wrapper and Node API pass the tracked generated view into one shared pure-ESM validator and context core.

Exports are generated client-side from the validated model. The HTML is self-contained and printable, with no scripts, event handlers, tracking, external resources, or network dependency. The JSON retains exact decimal strings, provenance, `canonical_unsupported`, and the separate `presentation_unavailable` boundary.

## Lumen safety boundary

Lumen uses a structured claim-selection boundary rather than publishing model-authored financial prose. The model may return only one JSON object containing a small set of unique canonical claim IDs. The server validates those IDs against the catalog derived from the validated CCAC 1.1 context and deterministically renders all displayed prose, exact values, classifications, unavailable statements, and human-review language.

Arbitrary prose, numbers, Markdown, malformed structures, unknown or duplicate IDs, extra keys, unexpected blocks, and unexpected metadata fail closed to a deterministic safety response. Browser-supplied grounding is rejected.

Lumen may not invent or calculate financial values, forecast, extrapolate, annualize, reclassify anomaly impact as savings, combine invoices, claim demonstrated recoverability, or claim an external action. All proposed investigations remain read-only. Human approval, rollback planning, and later verification are required before any real change.

## Current limitations

- All published data is illustrative.
- No customer credentials, accounts, production resources, or live ingestion are connected.
- Azure, GCP, and Kubernetes are unavailable in the validated report.
- Forecasting and tagging coverage are unavailable.
- No automated remediation, external action, or realized-savings verification exists.
- Reference connectors and the reference MCP server are development surfaces, not the public dashboard's trusted runtime path.

Supporting real customer data safely would require isolated tenant storage, short-lived least-privilege identities, encrypted ingestion, pagination and normalization controls, schema and quality validation, immutable provenance, retention and deletion policies, authorization, audit logging, secret rotation, monitoring, incident response, and a reviewed deployment boundary.

New financial capabilities would also require producer-level canonical metrics, CCAC contract support, deterministic Command Center policies, adversarial fixtures, reconciliation rules, and explicit presentation approval.

## Reproducible verification

From the repository root, with frontend dependencies installed and the released validators available in the active Python environment:

```bash
python scripts/validate_ccac_fixture.py fixtures/ccac/illustrative-v0.2.1/run
CCG_CCAC10_VIEW="$(mktemp)"
python scripts/build_ccac_dashboard_view.py --output "$CCG_CCAC10_VIEW"
cmp "$CCG_CCAC10_VIEW" frontend/src/data/ccac-dashboard-view.generated.json

python scripts/validate_ccac11_fixture.py fixtures/ccac/illustrative-v0.3.0/run
ccac validate-run fixtures/ccac/illustrative-v0.3.0/run
CCG_CCAC11_VIEW="$(mktemp)"
python scripts/build_ccac11_dashboard_view.py --output "$CCG_CCAC11_VIEW"
cmp "$CCG_CCAC11_VIEW" frontend/src/data/ccac-dashboard-view-v1.1.generated.json
python -m unittest discover -s tests -p 'test_*.py' -v
```

```bash
cd frontend
CI=true npm test -- --watchAll=false
npm run test:api
npm run build
npm run test:production-mount
npm run test:visual
npx eslint src
npm audit --omit=dev --audit-level=high
```

The approved canonical exports are:

| Export | Bytes | SHA-256 |
| --- | ---: | --- |
| HTML executive report | 26,623 | `408b03ac3ce5a6a981575bf6e2a28a22033577183cafbcd3bdd90550922a428c` |
| JSON evidence package | 113,115 | `46c9b1b6a41960a479159ce111ee034d81ead4174c65341349fd0dd12e74f0f7` |
