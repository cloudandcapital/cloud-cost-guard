// Pin and self-host Pyodide plus its jsonschema dependency closure. Runtime
// package downloads happen at build time, never against customer CSV contents.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const VERSION = '0.29.4';
async function prepare() {
  const packageRoot = process.env.BILLING_PYODIDE_PACKAGE || path.dirname(require.resolve('../frontend/node_modules/pyodide/package.json'));
  const target = path.join(ROOT, 'frontend/public/billing-pipeline/runtime');
  const lock = JSON.parse(await fs.readFile(path.join(packageRoot, 'pyodide-lock.json'), 'utf8'));
  const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.version !== VERSION) throw new Error('Unexpected Python runtime version');
  await fs.mkdir(target, { recursive: true });
  for (const name of ['pyodide.js', 'pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
    await fs.copyFile(path.join(packageRoot, name), path.join(target, name));
  }
  const packages = new Set();
  function dependencies(raw) { const name = raw.replaceAll('_', '-'); if (packages.has(name)) return; packages.add(name); lock.packages[name].depends.forEach(dependencies); }
  dependencies('jsonschema');
  for (const name of packages) {
    const item = lock.packages[name];
    const destination = path.join(target, item.file_name);
    let data;
    try { data = await fs.readFile(destination); } catch { /* first build */ }
    if (!data || createHash('sha256').update(data).digest('hex') !== item.sha256) {
      // Local wheel cache is useful for offline development; hashes still apply.
      try { data = await fs.readFile(path.join(packageRoot, item.file_name)); } catch {
        const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/${item.file_name}`);
        if (!response.ok) throw new Error(`Cannot prepare Python dependency: ${name}`);
        data = Buffer.from(await response.arrayBuffer());
      }
      if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error(`Python dependency digest differs: ${name}`);
      await fs.writeFile(destination, data);
    }
  }
  // Verify the tracked source package is a byte-for-byte projection of the lock.
  const sources = JSON.parse(await fs.readFile(path.join(ROOT, 'pipeline/sources.lock.json'), 'utf8'));
  const files = {};
  for (const source of sources.sources) for (const item of Object.values(source.files)) {
    const data = await fs.readFile(path.join(ROOT, 'pipeline/vendor', item.path));
    if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error(`Producer source differs: ${item.path}`);
    files[item.path] = data.toString('utf8');
  }
  await fs.writeFile(path.join(ROOT, 'frontend/public/billing-pipeline/sources.json'), JSON.stringify({files})+'\n');
  await fs.writeFile(path.join(ROOT, 'frontend/public/billing-pipeline/provenance.json'), JSON.stringify(sources)+'\n');
  console.log('Local billing pipeline prepared: pinned producers, CCAC, and Python runtime.');
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
