# Changelog

## October 2026 · Billing review release

- Added browser-local FOCUS and simple billing CSV review with exact signed totals, service and provider breakdowns, optional earlier-period comparison, diagnostic Watchdog findings, and explicit coverage limits.
- Ran the pinned FinOps Lite, Watchdog, CCAC validator, and Command Center analysis in a local WebAssembly worker. Kept upload results in tab memory and provided local Lumen answers and HTML, JSON, and CSV downloads.
- Preserved the validated CCAC 1.1 illustrative Cloud, direct-AI, and SaaS example, with separate server-grounded Lumen explanations.
- Pinned Node 24.x for deployment and expanded CI, browser, pipeline parity, and adversarial validation checks.

The [upload documentation](docs/billing-upload.md) lists supported inputs and accounting rules. The [architecture document](docs/architecture-and-trust.md) describes provenance and capability boundaries.

## 0.1.0 · Initial release

- Introduced the React dashboard, findings cards, CSV exports, and Vercel hosting.
- Used normalized reports from FinOps Lite, Watchdog, and Recovery Economics in the early dashboard.
