# Static CCAC 1.1 illustrative fixture

`run/report.json` is the approved CCAC 1.1 trusted report produced by Tech Spend Command Center 0.3.0 at commit `b114f776727a070e34c2f0d771165464f2055b93`. Its SHA-256 is `5479da098b31fdf630fe3a0edc3ac67d30848185cecc61b640d998461b2f6b41`.

The complete seven-file run is immutable. `scripts/validate_ccac11_fixture.py` checks exact filenames, byte sizes, and hashes, then invokes the released `cloudandcapital-ccac` v0.2.0 validator. The wheel is dependency-pinned to SHA-256 `bc46f363b1a03c94cf0da75759bccd0271de2c53b1f77a1a7255f9c8e7f768f1`.

Approved changed producer commits:

- FinOps Lite: `d72649ec07aa57c60a7ea3f8ff2890b8d95c4b93`
- FinOps Watchdog: `9bc4e90725969f7775b3aef110b01e10dec4a7e0`
- Recovery Economics: `9a6c4e1ce34e58af10fc42d44d911338a724dabe`

The generated `ccac-dashboard-view-v1.1.generated.json` is a data-layer artifact only. React, exports, Lumen, and the visible dashboard continue using their existing sources.
