# Static CCAC illustrative fixture

This fixture is an immutable, illustrative-only six-tool pipeline run. It contains no customer data, credentials, or live-cloud data. Cloud Cost Guard does not consume this fixture yet.

`run/report.json` is the canonical machine-readable report. The optional human summary produced by `techspend summarize` is a usability aid and is not a dashboard ingestion source, so it is intentionally not checked in.

## Released sources

| Tool | Version | Peeled release commit |
| --- | --- | --- |
| FinOps Lite | 0.3.0 | `48f10ee9c4168dc77fc52525499d3d67f8c7f6c2` |
| FinOps Watchdog | 0.4.0 | `3874a265b627bd362093e9b8bd8c12e1fa01862c` |
| Recovery Economics | 0.2.1 | `38b8fdb3f1acee00fbbb955309381bb544b35762` |
| AI Cost Lens | 0.2.0 | `58d570b492052338a30f9d8313815d241b5abe55` |
| SaaS Cost Analyzer | 0.2.0 | `fe4db1c5b1d1808c71c5a314ebb3798b5bd23f33` |
| Tech Spend Command Center | 0.2.1 | `5c06df63cd014867fe3cb2e346e2e97cd2469689` |

The shared interchange contract is `ccac/1.0.0`.

## Reproduction

Create a clean Python 3.12 environment, install the six projects from the exact commits above, and run:

```bash
techspend demo-pipeline --output-dir demo-run
techspend summarize demo-run > summary.txt
```

The first command publishes the directory only after the complete illustrative pipeline validates. The second command independently validates the complete directory through released Tech Spend Command Center behavior before rendering a human summary. Generation requires no cloud credentials.

The repository-local checksum checker supplements but does not replace released full-run CCAC validation:

```bash
python scripts/validate_ccac_fixture.py fixtures/ccac/illustrative-v0.2.1/run
```

## Canonical artifacts

The `run/` directory must contain exactly these files and bytes:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `finops-lite.json` | 52,821 | `f8529ff5db134a6e81554fd5b2c87e687dc2258009522246d4642ca81501b3a0` |
| `finops-watchdog.json` | 13,308 | `ec9269ce4e27ecb412108ca46dc4bd1229ad61682f234fee6cf71ca9833fb717` |
| `recovery-economics.json` | 20,879 | `db44438fea1d33f1b76591aa4ce6a3d6560ba8528c575dcb782a6da4ad8f71e4` |
| `ai-cost-lens.json` | 38,593 | `b51cf23ea86cdaaea52bdfbba6188f995824f3591fed03ac97e262f23d1333be` |
| `saas-cost-analyzer.json` | 33,057 | `58f31ae72c17f80c1608d8f292756e741763ca4ef868d3ac0badf7a6df940bc8` |
| `manifest.json` | 2,312 | `16c4ce49800f0909cfa281739fb983e0d3c8c39d661f6eec7e3b4f08f2f378a6` |
| `report.json` | 154,193 | `3e56662a5192644dd17d698184267c5e638f24018991f442dfbcf81b4dc8edaa` |

Do not reformat, normalize, reorder, or edit these artifacts by hand.
