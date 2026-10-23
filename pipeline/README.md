# Local analytical pipeline

Guard runs the actual FinOps Lite → Watchdog → CCAC → Command Center Python code
in an isolated local Web Worker using Pyodide 0.29.4 (Python 3.13). It downloads
code, not customer records. There is no hosted ingestion endpoint or cloud login.

`vendor/` contains verbatim reviewed source and licenses from the revisions in
`sources.lock.json`. It is a reproducible browser distribution of those projects,
not an independent cost calculator. The producer changes were reviewed in
[FinOps Lite #19](https://github.com/cloudandcapital/finops-lite/pull/19),
[Watchdog #8](https://github.com/cloudandcapital/finops-watchdog/pull/8), and
[Command Center #8](https://github.com/cloudandcapital/tech-spend-command-center/pull/8).
Provider precision and UTC confirmation are updated through [FinOps Lite #20](https://github.com/cloudandcapital/finops-lite/pull/20), with exact lineage checks in [Watchdog #9](https://github.com/cloudandcapital/finops-watchdog/pull/9).
The unchanged CCAC source matches the released 0.2.0 validator tree.

To refresh approved snapshots, check out those exact revisions side by side and
run `python scripts/sync_billing_pipeline.py --source-root /path/to/repos`.
Review the source lock, file hashes and diff before committing. Do not hand-edit
vendored analysis code. The preparation script verifies every source digest.

`npm ci` installs the exact runtime package from the frontend lock. `prestart`
and `prebuild` copy its runtime files and fetch only the eight jsonschema wheels
in Pyodide's dependency closure; wheel SHA-256 values are checked against its
lock. All runtime files are then served from Guard's own origin. No runtime CDN
request contains a filename, bill, cost, source record or Lumen question.
Generated runtime/source bundles are ignored by Git and reproduced at build.

Original CSV text enters the worker as JSON data. A fixed Python function builds
the producer artifacts, checks the released CCAC schemas/semantics, checks the
actual manifest/run and exact catalog ownership, then projects amounts to decimal
strings. Charts use numbers only for geometry. Guard formats and renders values;
it does not sum costs, shares or comparisons. Python's temporary files live in
the worker's memory filesystem. Success, error, timeout, cancellation, replacement
or navigation terminates the worker. Reports remain in tab memory until cleared.

Evidence JSON downloads include the exact canonical artifact strings, report and
manifest digests, producer source revisions, metric references, reconciliation,
quality, and explicit omissions. Keep these strings intact when revalidating
artifacts: parsing canonical monetary numbers through JavaScript can round them.

`node --test scripts/billing-runtime.test.mjs` checks WebAssembly/native artifact
parity, exact totals, omissions and the existing injected-spike detector.
`python -m unittest tests.test_billing_pipeline -v` checks lineage, references,
partial reports, currency/credits/history, tampered hashes and altered catalogs.
Jest uses the same Python source natively; Playwright exercises the real worker.
The approved complete example retains its existing validators and fixture pins.
