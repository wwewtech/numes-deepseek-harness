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

// Report -------------------------------------------------------------------
console.log('');
if (problems.length) {
  console.error(`FAILED with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('All checks passed.');
