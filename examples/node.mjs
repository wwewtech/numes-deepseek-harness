"""Numes free models via Node.js fetch. Zero dependencies, Node 18+.

  NUMES_API_KEY=sk-... node examples/node.mjs           # direct
  node examples/node.mjs --proxy                        # via local proxy

The proxy route needs the proxy running:
  node tools/numes-free-failover.mjs
"""

const DIRECT_BASE = 'https://api.numes.ai/api/v1';
const PROXY_BASE  = 'http://127.0.0.1:8787/v1';
// A free id MUST end with ':free'; without it you are on the paid route.
const FREE_MODEL = 'moonshotai/kimi-k3.1-pro:free';

const useProxy = process.argv.includes('--proxy');
const base  = useProxy ? PROXY_BASE : DIRECT_BASE;
const model = useProxy ? 'numes-free-auto' : FREE_MODEL;

const headers = { 'Content-Type': 'application/json' };
if (!useProxy) {
  const key = process.env.NUMES_API_KEY;
  if (!key) { console.error('Set NUMES_API_KEY or use --proxy'); process.exit(1); }
  headers.Authorization = `Bearer ${key}`;
}

const t0 = Date.now();
const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers,
  // FreeTwTFT can be ~60-100s on harder prompts.
  signal: AbortSignal.timeout(630_000),
  body: JSON.stringify({
    model,
    max_tokens: 1500,
    reasoning: { effort: 'none' },
    messages: [{ role: 'user', content: 'Reply with exactly one word: PONG' }],
  }),
});

console.log(`HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const [k, v] of res.headers) {
  if (k.startsWith('x-numes-') || k.startsWith('x-request-') || k.startsWith('x-generation-')) {
    console.log(`  ${k}: ${v}`);
  }
}

const json = await res.json();
if (!res.ok) { console.error(json); process.exit(1); }

console.log(`\nanswer : ${json.choices[0].message.content.trim()}`);
console.log(`cost   : ${json.usage?.cost ?? 'n/a'}`);