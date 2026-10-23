# Public provider compatibility fixture

`focus-sample-1000.csv.gz` contains the unmodified 1,000-record
[`FOCUS-1.0/focus_sample.csv`](https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS-Sample-Data/blob/main/FOCUS-1.0/focus_sample.csv)
from the FOCUS Sample Data contributors / FinOps Foundation, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Source repository tree: `adbdd17a132984d6e8583c149c236d2199c3f5bc`.
Source Git blob: `8d7568d2c024926d086b4d232010f9a0580657d2`.
Expanded SHA-256: `e91e5ac7edf01ed2c9d926f37ef7dc1ae2aae97956fea8da6c9ee488b1c2839e`.
Gzip SHA-256: `16408d9ca23c636a5ab5fb964f8f55bebdc0dd2b33ca61bb85297617bf4867ed`.

The only packaging change is deterministic Gzip compression (mtime 0). No row,
amount, timestamp or header was edited. This locally produced Gzip wrapper is
not an authentic provider download. The extract contains AWS, Microsoft and
Oracle records, not Google Cloud. These are historical, anonymized/sample rows,
not a complete invoice or proof of every current native export layout.

Tests deliberately select UTC for the timezone-less serialization. This is an
explicit test interpretation, not an assertion that any timezone-less file is
UTC. The default import must stop and ask. Exact independent totals over the
supplied rows: AWS 18.00663861840, Microsoft 1.97651418586, Oracle 0.53707392473,
combined USD 20.52022672899. There are no identical full-dimension rows.
