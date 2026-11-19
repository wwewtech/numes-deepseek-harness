#!/usr/bin/env node
/**
 * Integration tests for tools/numes-free-failover.mjs via the local HTTP server.
 *
 *   node --test tests/proxy.test.mjs
 *
 * Covers: /health, /status, /v1/models, the paid-model guard, and unknown
 * routes. Uses a dummy key and a random port; no network calls are made.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proxyPath = path.join(repo, 'tools', 'numes-free-failover.mjs');
const PORT = 18789;
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [proxyPath], {
    env: {
      ...process.env,
      NUMES_API_KEY: 'sk-test-dummy-not-a-real-key',
      NUMES_PROXY_PORT: String(PORT),
      NUMES_PROXY_DISCOVERY_MS: '0',
      NUMES_CHAIN: 'test/model-a:free,test/model-b:free',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // wait for listen
  const start = Date.now();
  let ok = false;
  while (Date.now() - start < 6000) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) { ok = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert.ok(ok, 'proxy did not start in time');
});

after(() => { try { proc.kill('SIGTERM'); } catch {} });

test('GET /health returns 200 with non-empty chain', async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.chain));
  assert.equal(json.chain.length, 2);
  assert.deepEqual(json.chain, ['test/model-a:free', 'test/model-b:free']);
  assert.equal(json.backoff.length > 0, true);
});

test('GET /status shows free guard, auto-discovery config, stats', async () => {
  const res = await fetch(`${BASE}/status`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.free.pinnedChain, true);
  assert.equal(json.free.guard.includes('max_price'), true);
  assert.equal(json.retry.honourRetryAfter, true);
  assert.equal(json.proxy.port, PORT);
});

test('GET /v1/models lists configured chain (pinned mode)', async () => {
  const res = await fetch(`${BASE}/v1/models`);
  const json = await res.json();
  assert.equal(json.object, 'list');
  assert.equal(json.data.length, 2);
  assert.equal(json.data[0].id, 'test/model-a:free');
});

test('paid-model guard refuses non-free ids before any network I/O', async () => {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Numes-Force-Model': 'moonshotai/kimi-k3.1-pro',
    },
    body: JSON.stringify({ model: 'x', messages: [] }),
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, 400);
  assert.ok(/non-free/.test(json.error.message), 'expected message about non-free id');
});

test('guard accepts :free on the per-request chain override', async () => {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Numes-Chain': 'moonshotai/kimi-k3.1-pro:free,not/allowed,paid/model',
    },
    body: JSON.stringify({ messages: [] }),
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(/non-free/.test(json.error.message));
});

test('unknown route returns 404', async () => {
  const res = await fetch(`${BASE}/nope`);
  assert.equal(res.status, 404);
});

test('invalid JSON body returns 400 before upstream call', async () => {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not a json',
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error.code, 400);
});