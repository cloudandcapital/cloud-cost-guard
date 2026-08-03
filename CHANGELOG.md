# Changelog

All notable changes to Cloud Cost Guard are documented here.

## [Unreleased]

### Added
- **Pipeline framing** — README rewritten to open with the Visibility → Variance → Tradeoffs system context; updated data pipeline section to reference all four tools including their newest features (FOCUS 1.0 export, `--report` flag, `compare` subcommand).
- **GitHub Actions CI** — npm install + build runs on Node 20 on every push.

## [0.1.0] — Initial release

- React dashboard: spend trends, unit economics, savings coverage
- Findings cards with evidence (resource, region, type)
- CSV export of findings with savings
- Reads normalized `report.json` aggregated from FinOps Lite, Watchdog, and Recovery Economics
- Vercel deployment
