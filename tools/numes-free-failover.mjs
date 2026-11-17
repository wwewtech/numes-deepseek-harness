#!/usr/bin/env node
/**
 * numes-free-failover.mjs — local OpenAI-compatible failover proxy for the
 * free (`:free`) Numes catalogue, with persistent retry rounds.
 *
 * Listens on 127.0.0.1 only. For every chat completion it tries the free
 * models in order (last successful one first) until one returns a usable
 * response, then pipes that response straight through, streaming included.
 *
 * If every model fails, it does NOT give up: it waits and starts a new
 * round over all models. Rounds are spaced by an exponential backoff
 * (5s → 10s → 15s → 30s → 1m → 2m → 5m, then every 5m forever) so a
 * temporarily exhausted free pool recovers without the caller retrying.
 *
 * It never routes to a paid endpoint: every candidate ends with `:free`,
 * so a failed attempt costs nothing and there is no path to a charge.
 * The two Numes errors that mean "stop retrying" (401 bad key, 402 out
 * of funds) abort the rounds early instead of hammering a dead account.
 *
 * No dependencies. Node.js 18+. The key is read from NUMES_API_KEY or from
 * DSH's own credential file; it is never logged.
 *
 * Optional environment:
 *   NUMES_PROXY_PORT                default 8787
 *   NUMES_CHAIN                     comma-separated model override
 *   NUMES_PROXY_HEADER_TIMEOUT_MS   first-byte deadline per attempt (stream), default 180000
 *   NUMES_PROXY_BODY_TIMEOUT_MS     overall deadline per attempt (non-stream), default 300000
 *   NUMES_PROXY_IDLE_TIMEOUT_MS     stalled-stream watchdog, default 120000
 *   NUMES_PROXY_BACKOFF_MS          comma-separated round delays in ms;
 *                                  default "5000,10000,15000,30000,60000,120000,300000"
 *   NUMES_PROXY_MAX_ROUNDS          give up after N rounds (0 = never), default 0
 *   NUMES_PROXY_DISCOVERY_MS        refresh the free-model catalogue from
 *                                  GET /models every N ms; 0 disables. Default 300000.
 *   NUMES_PROXY_MIN_BACKOFF_MS      floor for Retry-After-aware waits, default 1000
 *
 * Optional request headers:
 *   X-Numes-Force-Model  try this single model only
 *   X-Numes-Chain        comma-separated chain override for this request
 *   X-Numes-Max-Rounds   per-request round limit (0 = never stop)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.NUMES_PROXY_PORT || 8787);
const HOST = '127.0.0.1';
const UPSTREAM = process.env.NUMES_UPSTREAM || 'https://api.numes.ai/api/v1';
const HEADER_TIMEOUT_MS = Number(process.env.NUMES_PROXY_HEADER_TIMEOUT_MS || 180000);
const BODY_TIMEOUT_MS = Number(process.env.NUMES_PROXY_BODY_TIMEOUT_MS || 300000);
const IDLE_TIMEOUT_MS = Number(process.env.NUMES_PROXY_IDLE_TIMEOUT_MS || 120000);

const DEFAULT_BACKOFF_MS = [5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];
const BACKOFF_MS = (process.env.NUMES_PROXY_BACKOFF_MS || DEFAULT_BACKOFF_MS.join(','))
  .split(',').map(s => Number(s.trim())).filter(n => n >= 0);
const MAX_ROUNDS = Number(process.env.NUMES_PROXY_MAX_ROUNDS || 0);
const DISCOVERY_MS = Number(process.env.NUMES_PROXY_DISCOVERY_MS || 300_000);
const MIN_BACKOFF_MS = Number(process.env.NUMES_PROXY_MIN_BACKOFF_MS || 1_000);

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

// Live catalogue state, refreshed from GET /models by discoverFreeModels().
// autoChain holds the free IDs the key can currently see; CHAIN stays the
// user's explicit preference.  Active chain = autoChain when discovery has
// data and the user did not pin NUMES_CHAIN.
let autoChain = null;
let lastDiscovery = null;
const pinnedChain = Boolean(process.env.NUMES_CHAIN);

// Free-model guard: strip a `:free` model down to its paid twin?  Never.
// Any model id that reaches the upstream MUST end with :free.  Guard on
// both the configured chain and per-request overrides.
function assertFree(id) {
  if (typeof id !== 'string' || !id.endsWith(':free')) {
    throw new Error(`refusing non-free model "${id}" (paid endpoints are off-limits)`);
  }
  return id;
}
CHAIN.forEach(assertFree);

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
const stats = {
  started: new Date().toISOString(),
  attempts: 0, successes: 0, failovers: 0, failures: 0,
  rounds: 0, retries: 0, lastError: null,
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The model list routing actually uses right now. */
function activeChain() {
  return !pinnedChain && autoChain && autoChain.length ? autoChain : CHAIN;
}

/**
 * Catalogue discovery: GET /models returns every model the key can see;
 * free entries appear as their own `:free` rows.  Refresh autoChain so a
 * removed free offer disappears from routing and a new one joins it,
 * without touching a user-pinned NUMES_CHAIN.  Failure keeps the last
 * good list; discovery never blocks or kills requests.
 */
async function discoverFreeModels() {
  try {
    const res = await fetch(`${UPSTREAM}/models`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const free = (list.data || [])
      .map(m => m.id)
      .filter(id => typeof id === 'string' && id.endsWith(':free'));
    if (free.length) {
      const before = autoChain ? autoChain.join(',') : '(none)';
      autoChain = free;
      stats.discovered = { free: free.length, at: new Date().toISOString() };
      if (before !== free.join(',')) {
        log(`discovery: ${free.length} free models in catalogue${pinnedChain ? ' (NUMES_CHAIN pinned, not applied)' : ''}`);
        if (!pinnedChain) log(`discovery: chain now ${free.join(', ')}`);
      }
    }
    lastDiscovery = new Date().toISOString();
  } catch (err) {
    log(`discovery failed (keeping last list): ${err.message}`);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * One upstream try. Returns {ok,res,ms} or {ok:false,status,body}.
 * Errors that mean "the account is dead" are marked fatal.
 */
async function attempt(model, parsedBody, clientSignal, stream) {
  assertFree(model);
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
      body: JSON.stringify({
        ...parsedBody,
        model,
        // Second free-guard: cap every rate at zero per request, so even a
        // catalogue mistake cannot route this call to a paid endpoint.
        provider: { max_price: { prompt: 0, completion: 0 } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const fatal = res.status === 401 || res.status === 402 || res.status === 403;
      // 429 rate_limited and 503 service_unavailable can carry Retry-After:
      // the platform's own "wait this long" hint, in seconds.
      const retryAfter = Number(res.headers.get('retry-after') || 0) * 1000;
      return { ok: false, status: res.status, body: text.slice(0, 400), fatal, retryAfter };
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
      return sendJson(res, 200, { ok: true, lastGood, chain: activeChain(), backoff: BACKOFF_MS, stats });
    }
    if (req.method === 'GET' && (req.url === '/status' || req.url === '/v1/status')) {
      // Human-friendly one-glance status: what we route to, what we avoid,
      // and how the retry engine has been doing since start.
      return sendJson(res, 200, {
        ok: true,
        proxy: { host: HOST, port: PORT, upstream: UPSTREAM, started: stats.started },
        free: {
          pinnedChain,
          models: activeChain(),
          discoveredAt: stats.discovered?.at || null,
          discoveredCount: stats.discovered?.free || null,
          lastGood,
          guard: ':free suffix + provider.max_price {prompt:0, completion:0} on every request',
        },
        retry: {
          backoffMs: BACKOFF_MS,
          maxRounds: MAX_ROUNDS || 'infinite',
          rounds: stats.rounds,
          retries: stats.retries,
          honourRetryAfter: true,
        },
        stats,
      });
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
    const reqMaxRounds = Number(req.headers['x-numes-max-rounds'] || 0);
    const route = activeChain();
    let chain = chainOverride
      ? String(chainOverride).split(',').map(s => s.trim()).filter(Boolean)
      : (lastGood && route.includes(lastGood)
        ? [lastGood, ...route.filter(m => m !== lastGood)]
        : route);
    if (force) chain = [String(force)];
    try { chain.forEach(assertFree); }
    catch (e) { return sendJson(res, 400, { error: { message: e.message, code: 400 } }); }

    const roundsLimit = reqMaxRounds > 0 ? reqMaxRounds : MAX_ROUNDS;
    let round = 0;
    let lastError = null;
    let totalAttempts = 0;

    // Persistent retry rounds: each round walks the whole chain; between
    // rounds we back off exponentially (default 5s..5m, then 5m forever).
    while (true) {
      round++;
      stats.rounds++;
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        stats.attempts++; totalAttempts++;
        log(`round ${round}, attempt ${i + 1}/${chain.length}: ${model}`);
        const r = await attempt(model, parsed, clientAbort.signal, stream);
        if (clientGone) return log('client disconnected; stopping rounds');
        if (r.ok) {
          stats.successes++;
          if (i > 0) stats.failovers++;
          if (round > 1) stats.retries++;
          lastGood = model;
          log(`success via ${model} in ${(r.ms / 1000).toFixed(1)}s (round ${round}, attempt ${i + 1}, total tries ${totalAttempts})`);
          res.writeHead(200, {
            'Content-Type': stream ? 'text/event-stream' : 'application/json',
            'Cache-Control': 'no-cache',
            'X-Numes-Free-Model': model,
            'X-Numes-Free-Attempts': String(totalAttempts),
            'X-Numes-Free-Round': String(round),
          });
          if (!stream) {
            const text = await r.res.text();
            return void res.end(text);
          }
          // Stream through with an idle watchdog: a stalled upstream ends
          // the response; failover after partial output is unsafe.
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
        stats.lastError = { model, status: r.status, at: new Date().toISOString() };
        lastError = r;
        log(`fail ${model}: ${r.status} ${String(r.body).slice(0, 160)}`);
        // 401/402/403 mean the account or key is unusable: rounds are futile.
        if (r.fatal) {
          log(`fatal error ${r.status}: stopping rounds`);
          return sendJson(res, r.status, {
            error: {
              code: r.status,
              message: `Numes rejected the key (HTTP ${r.status}); retrying cannot fix this`,
              metadata: { error_type: r.status === 401 ? 'invalid_credentials' : 'insufficient_or_forbidden', last_upstream: String(r.body).slice(0, 300) },
            },
          });
        }
        if (i === chain.length - 1) break;
      }

      // Every model failed this round.  Decide whether to have another one.
      if (roundsLimit > 0 && round >= roundsLimit) break;
      // Retry-After-aware wait: when the platform said how long to wait
      // (429 rate_limited, 503 service_unavailable), honour the larger of
      // its hint and our own backoff; never wait less than the hint.
      let wait = BACKOFF_MS.length ? BACKOFF_MS[Math.min(round - 1, BACKOFF_MS.length - 1)] : 5000;
      if (lastError?.retryAfter && lastError.retryAfter > wait) {
        wait = lastError.retryAfter;
        log(`round ${round}: honouring upstream Retry-After of ${(wait / 1000).toFixed(0)}s`);
      }
      wait = Math.max(wait, MIN_BACKOFF_MS);
      log(`round ${round} exhausted (${totalAttempts} tries); retrying in ${wait / 1000}s`);
      // Sleep in short slices so a disconnecting client aborts promptly.
      const until = Date.now() + wait;
      while (Date.now() < until) {
        if (clientGone) return log('client disconnected during backoff');
        await sleep(Math.min(1000, until - Date.now()));
      }
    }

    log(`all rounds exhausted: ${round} rounds, ${totalAttempts} tries`);
    sendJson(res, lastError?.status && lastError.status >= 400 ? lastError.status : 503, {
      error: {
        code: lastError?.status || 503,
        message: `all Numes free models failed after ${round} round(s) / ${totalAttempts} attempt(s); nothing was charged for failed attempts`,
        metadata: {
          error_type: 'provider_unavailable',
          rounds: round,
          attempts: totalAttempts,
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
  log(`retry rounds: backoff ${BACKOFF_MS.map(m => m / 1000 + 's').join(' → ') || 'none'}${BACKOFF_MS.length ? ' → then ' + (BACKOFF_MS[BACKOFF_MS.length - 1] / 1000) + 's forever' : ''}, max rounds ${MAX_ROUNDS || '∞'}`);
  log(`free guard: :free suffix + provider.max_price{0,0} on every request; paid routes impossible`);
  if (DISCOVERY_MS > 0) {
    log(`catalogue discovery: every ${DISCOVERY_MS / 1000}s from GET /models${pinnedChain ? ' (NUMES_CHAIN pinned: discovery is informational)' : ''}`);
    void discoverFreeModels();
    setInterval(() => { void discoverFreeModels(); }, DISCOVERY_MS).unref();
  } else {
    log('catalogue discovery: disabled (NUMES_PROXY_DISCOVERY_MS=0)');
  }
});
