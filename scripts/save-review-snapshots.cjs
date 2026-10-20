// Temporary draft-only evidence capture. Removed after the images are reviewed.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const repository = 'cloudandcapital/cloud-cost-guard';
const branch = 'codex/interface-polish';
const head = process.env.CCG_REVIEW_HEAD;
const prefix = 'frontend/visual-contract/snapshots/';

async function api(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${route}`);
  return response.json();
}

(async () => {
  if (!/^[0-9a-f]{40}$/.test(head || '') || !process.env.GITHUB_TOKEN) throw new Error('Missing capture identity');
  const paths = [...new Set(execFileSync('git', ['ls-files', '-m', '-o', '--exclude-standard', '--', prefix], { encoding: 'utf8' }).trim().split('\n').filter(Boolean))];
  if (!paths.length) { console.log('No PNG changes to save.'); return; }
  if (paths.length > 60) throw new Error('Unexpected number of snapshots');
  const files = paths.map((file) => {
    if (!file.startsWith(prefix) || file.includes('..') || !/^[A-Za-z0-9._/-]+\.png$/.test(file)) throw new Error('Unexpected evidence path');
    const bytes = fs.readFileSync(file);
    if (bytes.length > 2000000 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Unexpected evidence content');
    return { file, bytes };
  });
  if (files.reduce((sum, file) => sum + file.bytes.length, 0) > 20000000) throw new Error('Evidence exceeds size limit');
  if ((await api(`git/ref/heads/${branch}`)).object.sha !== head) { console.log('Draft changed; leaving its head intact.'); return; }
  const parent = await api(`git/commits/${head}`);
  const tree = [];
  for (const { file, bytes } of files) {
    const blob = await api('git/blobs', 'POST', { content: bytes.toString('base64'), encoding: 'base64' });
    tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
  }
  if ((await api(`git/ref/heads/${branch}`)).object.sha !== head) { console.log('Draft changed; leaving its head intact.'); return; }
  const nextTree = await api('git/trees', 'POST', { base_tree: parent.tree.sha, tree });
  const commit = await api('git/commits', 'POST', { message: 'Capture uploaded records in the original dashboard for visual review', parents: [head], tree: nextTree.sha });
  // A concurrent branch update is also protected by the non-forced fast-forward rule.
  await api(`git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
  console.log(`Saved ${files.length} review PNGs on ${branch}: ${commit.sha}`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
