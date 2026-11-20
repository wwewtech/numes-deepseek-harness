#!/usr/bin/env node
/**
 * merge-providers.mjs — generate a DSH `--patch` overlay file that preserves
 * every provider already configured on a profile's `llm-pi-ai` row and adds
 * `numes-free` on top. Use this instead of letting the bundle replace the
 * whole `providers` mapping when the profile carries hand-edited providers.
 *
 *   node tools/merge-providers.mjs --profile <name> > numes-merge.yml
 *   dsh --profile <name> --patch numes-merge.yml ...
 *
 * The emitted YAML is a single loader patch row for `llm-pi-ai` whose
 * `config.providers` contains:
 *   - every provider found in the live composed config (`dsh --dump-config`),
 *   - plus `numes-free` pointing at the local failover proxy.
 *
 * Applying it through `--patch` puts it in the user layer, which sits above
 * bundle layers, so no installed bundle can wipe these rows later.
 *
 * Zero dependencies. Node 18+.
 */
import { execFileSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const profile = flag('--profile') || 'desktop';
const proxyPort = flag('--proxy-port') || '8787';
const apiKeyEnv = flag('--api-key-env') || 'NUMES_PROXY_PLACEHOLDER';

/** Locate a runnable `dsh` CLI without assuming one install layout. */
function findDsh() {
  const fromPath = () => {
    const ext = platform() === 'win32' ? '.cmd' : '';
    for (const dir of (process.env.PATH || '').split(platform() === 'win32' ? ';' : ':')) {
      if (!dir) continue;
      const candidate = join(dir, `dsh${ext}`);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  };
  const explicit = process.env.DSH_CLI || fromPath();
  if (explicit) return explicit;
  if (platform() !== 'win32') return 'dsh';
  return join(
    homedir(),
    'AppData', 'Local', 'Programs', 'DeepSeek Harness',
    'resources', 'runtime', 'cli', 'bin', 'dsh.cmd',
  );
}

/** Minimal YAML subset parser: enough for `dsh --dump-config` output of llm-pi-ai. */
function extractProvidersFromDump(dump) {
  const lines = dump.split(/\r?\n/);
  const rowIdx = lines.findIndex((l) => /^\s*-\s+id:\s*llm-pi-ai\s*$/.test(l));
  if (rowIdx < 0) throw new Error('llm-pi-ai row not found in dump-config output');
  // Walk forward to the `providers:` key of that row, then capture the block
  // until dedent below its indentation.
  let providersIdx = -1;
  let baseIndent = -1;
  for (let i = rowIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)providers:\s*$/);
    if (m) { providersIdx = i; baseIndent = m[1].length; break; }
    // Stop if we hit the next top-level row before finding providers
    if (/^\s*-\s+id:/.test(lines[i]) && i > rowIdx) break;
  }
  if (providersIdx < 0) return {};
  const providers = {};
  let current = null;
  for (let i = providersIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { if (current) providers[current].raw.push(''); continue; }
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent) break;
    const key = line.match(/^(\s*)([A-Za-z0-9._-]+):\s*(.*)$/);
    if (key && indent === baseIndent + 2) {
      current = key[2];
      providers[current] = { header: line.trim(), raw: [] };
    } else if (current) {
      providers[current].raw.push(line);
    }
  }
  return providers;
}

function renderProviders(providers) {
  const parts = [];
  for (const [name, block] of Object.entries(providers)) {
    if (name === 'numes-free') continue; // we re-add our own canonical copy below
    parts.push(`      ${name}:`);
    for (const line of block.raw) parts.push(line.replace(/^\s{8}/, '      '));
  }
  parts.push(`      numes-free:
        displayName: Numes (free, auto-failover)
        api: openai-completions
        baseURL: http://127.0.0.1:${proxyPort}/v1
        apiKeyEnv: ${apiKeyEnv}
        streamIdleTimeoutMs: 300000
        models:
          - id: numes-free-auto
            name: Numes free (auto-failover)
            contextWindow: 1048576
            maxTokens: 65536
            reasoningEfforts: false`);
  return parts.join('\n');
}

const dsh = findDsh();
if (!existsSync(dsh)) {
  console.error(`dsh CLI not found at ${dsh}. Set DSH_CLI or add dsh to PATH.`);
  process.exit(1);
}

let dump;
try {
  // On Windows: quote the path (spaces break shell:true) and use shell for .cmd shims.
  dump = execFileSync(`"${dsh}"`, ['--profile', profile, '--dump-config'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: platform() === 'win32',
  });
} catch (err) {
  console.error(`dsh --dump-config failed: ${err.message}`);
  process.exit(1);
}

const providers = extractProvidersFromDump(dump);
const names = Object.keys(providers).filter((n) => n !== 'numes-free');
console.error(`# found ${names.length} existing provider(s): ${names.join(', ') || 'none'}`);
console.error(`# numes-free will be ${names.length ? 'added alongside them' : 'the only provider'}`);
console.error(`# apply with: dsh --profile ${profile} --patch <this-file>`);
console.error('# generated by tools/merge-providers.mjs');
console.log('- id: llm-pi-ai');
console.log('  name: "@deepseek-ai/dsh-llm-pi-ai"');
console.log('  config:');
console.log('    providers:');
console.log(renderProviders(providers));
