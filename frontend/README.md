# Cloud Cost Guard frontend

The public app opens with a browser-local cloud billing CSV review. Its optional invented example uses a separate, validated CCAC 1.1 report. See [supported uploads and privacy](../docs/billing-upload.md) and [architecture and trust boundaries](../docs/architecture-and-trust.md).

Use Node 24.x. From this directory:

```bash
npm ci
npm start
```

The first start prepares the pinned Python/WebAssembly runtime on this machine. Uploaded billing rows are analyzed in the visitor's browser and kept in tab memory. Example-mode free-form Lumen questions use the serverless API; uploaded-report Lumen is a local prepared guide.

## Checks

```bash
CI=true npm test -- --watchAll=false --runInBand
npm run test:api
npm run test:pipeline
CI=true npm run build
npm run test:production-mount
npm run test:visual
```

The pipeline runtime's source revisions and dependency hashes are pinned in [`pipeline/sources.lock.json`](../pipeline/sources.lock.json). See [pipeline reproduction](../pipeline/README.md) before changing those snapshots. Never put credentials in `REACT_APP_*` variables; they are exposed in browser code.
