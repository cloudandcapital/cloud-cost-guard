"""Copy reviewed producer source, verbatim, for the browser's local Python runtime.

Run with --source-root pointing at a directory containing the four repositories.
The lock records upstream revisions and every source digest. No financial logic
belongs in Guard's adapter or this packaging script.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {
    'finops-lite': ['finops_lite/__init__.py', 'finops_lite/ccac.py', 'finops_lite/ccac_json.py', 'finops_lite/billing.py', 'finops_lite/billing_currencies.json'],
    'finops-watchdog': ['finops_watchdog/__init__.py', 'finops_watchdog/ccac.py', 'finops_watchdog/billing.py', 'finops_watchdog/data/illustrative-finops-lite-1.1.json'],
    'tech-spend-command-center': ['tech_spend_command_center/__init__.py', 'tech_spend_command_center/trusted.py', 'tech_spend_command_center/ccac11.py', 'tech_spend_command_center/billing.py'],
    'cloud-capital-analysis-contract': ['src/ccac/__init__.py', 'src/ccac/errors.py', 'src/ccac/schema.py', 'src/ccac/semantic.py', 'src/ccac/validator.py', 'src/ccac/schemas/__init__.py'],
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    args = parser.parse_args()
    target = ROOT / 'pipeline/vendor'
    target.mkdir(parents=True, exist_ok=True)
    sources, files = [], {}
    for name, paths in PACKAGES.items():
        repo = args.source_root / name
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip())
        inventory = {}
        if name == 'cloud-capital-analysis-contract':
            paths = paths + [str(path.relative_to(repo)) for path in sorted((repo/'schemas').rglob('*.json'))]
        for original in paths + ['LICENSE']:
            destination = original.removeprefix('src/')
            if original.startswith('schemas/'):
                destination = 'ccac/' + original
            if original == 'LICENSE':
                destination = 'licenses/' + name + '.txt'
            data = (repo/original).read_bytes()
            (target/destination).parent.mkdir(parents=True, exist_ok=True)
            (target/destination).write_bytes(data)
            digest = hashlib.sha256(data).hexdigest()
            inventory[original] = {'path': destination, 'sha256': digest}
            files[destination] = data.decode('utf-8')
        sources.append({'repository': 'https://github.com/cloudandcapital/'+name, 'revision': revision, 'uncommitted': dirty, 'files': inventory})
    (ROOT/'pipeline/sources.lock.json').write_text(json.dumps({'profile': 'billing_csv/1.0', 'sources': sources}, indent=2)+'\n')
    # Served by the worker; only reviewed code and public schemas, never a bill.
    public = ROOT/'frontend/public/billing-pipeline'
    public.mkdir(parents=True, exist_ok=True)
    (public/'sources.json').write_text(json.dumps({'files': files}, ensure_ascii=False, sort_keys=True)+'\n')

if __name__ == '__main__':
    main()
