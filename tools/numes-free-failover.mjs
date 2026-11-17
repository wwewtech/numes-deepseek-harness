#!/usr/bin/env node
/**
 * numes-free-failover.mjs — local OpenAI-compatible failover proxy for the
 * free (`:free`) Numes catalogue.
 *
 * Listens on 127.0.0.1 only. For every chat completion it tries the free
 * models in order (last successful one first) until one returns a usable
 * response, then pipes that response straight through, streaming included.
 * If every candidate fails, it returns the last upstream error instead of
 * inventing a paid fallback: `:free` never routes to paid endpoints.
 *
 * No dependencies. Node.js 18+. The key is read from NUMES_API_KEY or from
 * DSH's own credential file; it is never logged.
 *
 * Optional environment:
 *   NUMES_PROXY_PORT                default 8787
 *   NUMES_CHAIN                     comma-separated model override
 *   NUMES_PROXY_HEADER_TIMEOUT_MS   first-byte deadline per attempt (stream), default 180000
 *   NUMES_PROXY_BODY_TIMEOUT_MS     overall deadline per attempt (non-stream), default 300000
 *
 * Optional request headers:
 *   X-Numes-Force-Model  try this single model only
 *   X-Numes-Chain        comma-separated chain override for this request
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const PORT = Number(process.env.NUMES_PROXY_PORT || 8787);
const HOST = '127.0.0.1';
const UPSTREAM = process.env.NUMES_UPSTREAM || 'https://api.numes.ai/api/v1';
const HEADER_TIMEOUT_MS = Number(process.env.NUMES_PROXY_HEADER_TIMEOUT_MS || 180000);
const BODY_TIMEOUT_MS = Number(process.env.NUMES_PROXY_BODY_TIMEOUT_MS || 300000);
const IDLE_TIMEOUT_MS = Number(process.env.NUMES_PROXY_IDLE_TIMEOUT_MS || 120000);

const DEFAULT_CHAIN = [
  'moonshotai/kimi-k3.1-pro:free',
  'deepseek/deepseek-v4.1-flash:free',
  'z-ai/glm-5.3-flash:free',
  'z-ai/glm-5.3:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'dealignai/deepseek-v4.1-flash-uncensored-fp8:free',
  'dealignai/glm-5.3-flash-uncensored-fp8:free',
  'dealignai/glm-5.3-uncensored-fp8:free',
  'uniboshi/kimi-k3-abliterated-v1:free',
];

const CHAIN = (process.env.NUMES_CHAIN || DEFAULT_CHAIN.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);

function resolveKey() {
  if (process.env.NUMES_API_KEY) return process.env.NUMES_API_KEY;
  try {
    const file = path.join(os.homedir(), '.dsh', '.credentials.yaml');
    const m = fs.readFileSync(file, 'utf8').match(/^\s*NUMES_API_KEY:\s*(\S+)\s*$/m);
    if (m) return m[1];
  } catch { /* fall through */ }
  return null;
}

const KEY = resolveKey();
if (!KEY) {
  console.error('[numes-proxy] no key: set NUMES_API_KEY or store it in ~/.dsh/.credentials.yaml');
  process.exit(1);
}

let lastGood = null;
const stats = { started: new Date().toISOString(), attempts: 0, successes: 0, failovers: 0, failures: 0 };

const log = (...a) => console.log(new Date().toISOString(), ...a);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** One upstream try. Returns {ok,res} or {ok:false,status,body}. */
async function attempt(model, parsedBody, clientSignal, stream) {
  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  clientSignal.addEventListener('abort', onClientAbort, { once: true });
  const deadline = stream ? HEADER_TIMEOUT_MS : BODY_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new Error(`no response within ${deadline} ms`)), deadline);
  const started = Date.now();
  try {
    const res = await fetch(`${UPSTREAM}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({ ...parsedBody, model }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: text.slice(0, 400) };
    }
    return { ok: true, res, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: 0, body: String(err?.cause?.message || err?.message || err) };
  } finally {
    clearTimeout(timer);
    clientSignal.removeEventListener('abort', onClientAbort);
  }
}

function sendJson(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const clientAbort = new AbortController();
  let clientGone = false;
  res.on('close', () => { if (!res.writableEnded) { clientGone = true; clientAbort.abort(); } });

  try {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/v1/health')) {
      return sendJson(res, 200, { ok: true, lastGood, chain: CHAIN, stats });
    }
    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      return sendJson(res, 200, {
        object: 'list',
        data: CHAIN.map(id => ({ id, object: 'model', owned_by: 'numes-free-failover' })),
      });
    }
    const isChat = req.method === 'POST' &&
      (req.url === '/v1/chat/completions' || req.url === '/chat/completions');
    if (!isChat) return sendJson(res, 404, { error: { message: `no route ${req.method} ${req.url}` } });

    const raw = await readBody(req);
    let parsed;
    try { parsed = JSON.parse(raw.toString('utf8') || '{}'); }
    catch { return sendJson(res, 400, { error: { message: 'invalid JSON body', code: 400 } }); }
    const stream = parsed.stream === true;

    const force = req.headers['x-numes-force-model'];
    const chainOverride = req.headers['x-numes-chain'];
    let chain = chainOverride
      ? String(chainOverride).split(',').map(s => s.trim()).filter(Boolean)
      : (lastGood && CHAIN.includes(lastGood)
        ? [lastGood, ...CHAIN.filter(m => m !== lastGood)]
        : CHAIN);
    if (force) chain = [String(force)];

    let lastError = null;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      stats.attempts++;
      log(`attempt ${i + 1}/${chain.length}: ${model}`);
      const r = await attempt(model, parsed, clientAbort.signal, stream);
      if (clientGone) return log('client disconnected; stopping');
      if (r.ok) {
        stats.successes++;
        if (i > 0) stats.failovers++;
        lastGood = model;
        log(`success via ${model} in ${(r.ms / 1000).toFixed(1)}s (attempt ${i + 1})`);
        res.writeHead(200, {
          'Content-Type': stream ? 'text/event-stream' : 'application/json',
          'Cache-Control': 'no-cache',
          'X-Numes-Free-Model': model,
          'X-Numes-Free-Attempts': String(i + 1),
        });
        if (!stream) {
          const text = await r.res.text();
          return void res.end(text);
        }
        // Stream through with an idle watchdog: a stalled upstream ends the
        // response; failover after partial output is impossible and unsafe.
        const reader = r.res.body.getReader();
        let idle;
        try {
          while (true) {
            const chunk = await Promise.race([
              reader.read(),
              new Promise((_, rej) => { idle = setTimeout(() => rej(new Error('idle timeout')), IDLE_TIMEOUT_MS); }),
            ]);
            clearTimeout(idle);
            if (chunk.done) break;
            if (!res.write(Buffer.from(chunk.value))) {
              await new Promise(resolve => res.once('drain', resolve));
            }
          }
        } catch (err) {
          log(`stream aborted via ${model}: ${err.message}`);
          try { reader.cancel(); } catch { /* already closed */ }
        } finally {
          clearTimeout(idle);
          if (!res.writableEnded) res.end();
        }
        return;
      }
      stats.failures++;
      lastError = r;
      log(`fail ${model}: ${r.status} ${String(r.body).slice(0, 160)}`);
      if (i === chain.length - 1) break;
    }

    log(`all ${chain.length} candidates failed`);
    sendJson(res, lastError?.status && lastError.status >= 400 ? lastError.status : 503, {
      error: {
        code: lastError?.status || 503,
        message: `all ${chain.length} Numes free models failed; nothing was charged for failed attempts`,
        metadata: {
          error_type: 'provider_unavailable',
          last_model: chain[chain.length - 1],
          last_upstream: String(lastError?.body || '').slice(0, 300),
        },
      },
    });
  } catch (err) {
    log('handler error:', err?.message || err);
    sendJson(res, 500, { error: { message: 'proxy handler error', detail: String(err?.message || err) } });
  }
});

server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT} (chain of ${CHAIN.length} free models)`);
  log(`upstream ${UPSTREAM}; key source: ${process.env.NUMES_API_KEY ? 'env' : '~/.dsh/.credentials.yaml'}`);
});
