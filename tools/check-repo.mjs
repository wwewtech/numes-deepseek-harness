#!/usr/bin/env node
/**
 * Offline repository checks. No network, no key required.
 *
 *   node tools/check-repo.mjs
 *
 * Verifies:
 *   1. every relative Markdown link resolves;
 *   2. no Numes key or token-like string is committed;
 *   3. the YAML configs parse and their model ids are all `:free`;
 *   4. the proxy source still contains the guards the README advertises.
 *
 * Exit code 0 = all good. Used by CI and handy before a commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const note = (message) => console.log(`  ${message}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const rel = (p) => path.relative(root, p);

// 1. Relative Markdown links ------------------------------------------------
console.log('1. Relative Markdown links');
let linkCount = 0;
for (const file of files.filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (/^(https?:|#|mailto:)/.test(target)) continue;
    linkCount++;
    const resolved = path.resolve(path.dirname(file), target.split('#')[0]);
    if (!fs.existsSync(resolved)) problems.push(`broken link in ${rel(file)}: ${target}`);
  }
}
note(`${linkCount} relative links checked`);

// 2. Secret patterns --------------------------------------------------------
console.log('2. Committed secrets');
const secretPatterns = [
  { name: 'Numes inference key', re: /sk-numes-v1-[0-9a-z]{16,}/ },
  { name: 'GitHub token', re: /gh[pous]_[A-Za-z0-9]{20,}/ },
];
const scannable = files.filter(f => /\.(md|yml|yaml|mjs|js|json|svg|txt)$/.test(f));
for (const file of scannable) {
  const text = fs.readFileSync(file, 'utf8');
  for (const { name, re } of secretPatterns) {
    if (re.test(text)) problems.push(`possible ${name} in ${rel(file)}`);
  }
}
note(`${scannable.length} files scanned`);

// 3. Config sanity ---------------------------------------------------------
// Two kinds of provider block live here and they have different rules:
//   * a DIRECT Numes route talks to api.numes.ai, so every listed id must be a
//     canonical `author/model:free` slug;
//   * a PROXY route talks to the local failover proxy, which accepts a single
//     friendly alias (`numes-free-auto`) and picks the real model itself.
console.log('3. Provider configs');
const configs = files.filter(f => f.includes(`${path.sep}configs${path.sep}`) && f.endsWith('.yml'));
for (const file of configs) {
  const text = fs.readFileSync(file, 'utf8');
  const ids = [...text.matchAll(/^\s*-\s*(?:\{?\s*)?id:\s*([A-Za-z0-9._:-]+(?:\/[A-Za-z0-9._:-]+)?)/gm)]
    .map(m => m[1])
    .filter(id => id !== 'llm-pi-ai');           // drop the plugin row itself
  const isProxy = /baseURL:\s*http:\/\/127\.0\.0\.1/.test(text);
  const isDirect = /https:\/\/api\.numes\.ai/.test(text);
  if (!ids.length) problems.push(`no model ids found in ${rel(file)}`);
  if (isDirect) {
    const notFree = ids.filter(id => !id.endsWith(':free'));
    if (notFree.length) problems.push(`${rel(file)} lists non-free ids: ${notFree.join(', ')}`);
  } else if (isProxy) {
    // The proxy refuses anything that is not `:free`, but its own alias is the
    // single allowed exception: it never reaches Numes as a model id.
    const bad = ids.filter(id => id.includes('/') && !id.endsWith(':free'));
    if (bad.length) problems.push(`${rel(file)} lists non-free Numes ids: ${bad.join(', ')}`);
  }
  if (/\bapiKey:\s*\S/.test(text)) problems.push(`${rel(file)} appears to contain a literal apiKey`);
  note(`${rel(file)}: ${ids.length} model id(s) [${isProxy ? 'proxy' : isDirect ? 'direct' : 'unknown'}]`);
}

// 4. Advertised guards exist in the source ---------------------------------
console.log('4. Proxy guards');
const proxyPath = path.join(root, 'tools', 'numes-free-failover.mjs');
const proxy = fs.readFileSync(proxyPath, 'utf8');
const required = [
  ['free-model guard', /function assertFree/],
  ['max_price cap', /max_price:\s*\{\s*prompt:\s*0,\s*completion:\s*0\s*\}/],
  ['exponential retry rounds', /DEFAULT_BACKOFF_MS/],
  ['Retry-After handling', /retry-after/],
  ['discovery', /discoverFreeModels/],
  ['fatal-error abort', /fatal/],
];
for (const [label, re] of required) {
  if (!re.test(proxy)) problems.push(`proxy is missing "${label}" (README would be inaccurate)`);
  else note(`${label}: present`);
}

// 5. Bundle / install evidence ----------------------------------------------
// walkinglabs / SihanTeng / awesome-deepseekharness all require actual bundle
// evidence, not just proxy files: `package.json` with `dsh.bundle.patch`,
// a `.dsh-plugin/manifest.json`, and a real `cordis.patch.yml` on disk.
console.log('5. DSH bundle install evidence');
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) {
  problems.push('root package.json missing (required for dsh plugin add)');
} else {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.dsh?.bundle?.patch) problems.push('package.json missing dsh.bundle.patch');
  else note(`dsh.bundle.patch = ${pkg.dsh.bundle.patch}`);
  if (!pkg.name) problems.push('package.json missing name');
  if (!pkg.main) problems.push('package.json missing main entry');
  if (pkg.main && !fs.existsSync(path.join(root, pkg.main))) problems.push(`package.json main entry missing: ${pkg.main}`);
}
const manifestPath = path.join(root, '.dsh-plugin', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  problems.push('.dsh-plugin/manifest.json missing (required by DSH Inclusion Policy)');
} else {
  const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const field of ['name', 'version', 'description', 'entry', 'patch']) {
    if (!mf[field]) problems.push(`.dsh-plugin/manifest.json missing required field: ${field}`);
  }
  if (mf.entry && !fs.existsSync(path.join(root, mf.entry))) problems.push(`.dsh-plugin/manifest.json entry missing: ${mf.entry}`);
  if (mf.patch && !fs.existsSync(path.join(root, mf.patch))) problems.push(`.dsh-plugin/manifest.json patch missing: ${mf.patch}`);
  note(`manifest ${mf.name}@${mf.version} ok`);
}
const rootPatch = path.join(root, 'cordis.patch.yml');
if (!fs.existsSync(rootPatch)) problems.push('root cordis.patch.yml missing (bundle points at it)');
else {
  const text = fs.readFileSync(rootPatch, 'utf8');
  if (!/- id: llm-pi-ai/.test(text)) problems.push('cordis.patch.yml does not register an llm-pi-ai provider');
  else note('cordis.patch.yml registers a provider');
}

// Report -------------------------------------------------------------------
console.log('');
if (problems.length) {
  console.error(`FAILED with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('All checks passed.');
