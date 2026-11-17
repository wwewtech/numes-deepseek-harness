# Free-model failover proxy

Local OpenAI-compatible endpoint that tries every **`:free`** Numes model in turn until one answers — and if they all fail, waits and tries again with an exponential backoff, forever, instead of giving up.

```
DSH (or curl) ──▶ 127.0.0.1:8787 ──▶ Numes :free models, one per attempt
                    (this script)      │     └─ provider.max_price {0,0} on every request
                                        └─ all failed? wait 5s→10s→…→5m… and retry
```

## Why it exists

`:free` requests never fall back to a paid endpoint — that is the guarantee that keeps them at $0. The cost of that guarantee is that a single unavailable free pool returns `503 provider_unavailable` and the turn fails. This proxy turns both dead ends into "keep trying":

1. **Failover** moves to the next free model when one fails.
2. **Retry rounds** wait out a fully exhausted free pool: every round walks the whole chain again, spaced `5s → 10s → 15s → 30s → 1m → 2m → 5m`, then every 5 minutes forever. A temporarily exhausted pool recovers without the caller doing anything.
3. **Auto-discovery** refreshes the free-model list from `GET /models` every 5 minutes, so a removed free offer disappears from routing and a newly free model joins it — no config edits.

**It never routes to a paid model.** The free guard is doubled:

- every candidate must end with `:free` — enforced on the configured chain *and* per-request overrides, with a `400` before any traffic leaves your machine;
- every request carries `provider.max_price {prompt: 0, completion: 0}`, Numes's own per-request price cap, so even a catalogue mistake cannot route a call to a paid endpoint. A `:free` request never falls back to a paid endpoint anyway.

There is no path to a charge.

## Requirements

- Node.js 18+ (uses built-in `fetch`).
- A Numes inference key in `NUMES_API_KEY`, or already stored by DSH at `~/.dsh/.credentials.yaml` (the script reads it automatically; the value is never logged).

No packages to install.

## Run

```powershell
# Windows PowerShell
node tools\numes-free-failover.mjs
```

```bash
# macOS / Linux
node tools/numes-free-failover.mjs
```

Expected output:

```text
2026-11-17T18:27:06.713Z listening on http://127.0.0.1:8787 (chain of 9 free models)
2026-11-17T18:27:06.716Z retry rounds: backoff 5s → 10s → 15s → 30s → 60s → 120s → 300s → then 300s forever, max rounds ∞
```

Leave it running in its own terminal window. Stop with `Ctrl+C`.

## Connect DSH to it

Add a second provider that points at the proxy instead of at Numes. See [`../configs/numes-failover.patch.yml`](../configs/numes-failover.patch.yml), or in the GUI use **Settings → Models → Add model provider → Custom model API**:

| Field | Value |
| --- | --- |
| Provider ID | `numes-free` |
| Base URL | `http://127.0.0.1:8787/v1` |
| Protocol | OpenAI Chat Completions |
| API key | any non-empty placeholder, e.g. `local-proxy` |

The placeholder is only required because the adapter wants a credential; the real Numes key stays inside the proxy process.

Keep the original `numes` provider for direct `:free` access if you want it, and pick the `numes-free` models when you want automatic failover and retries.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /v1/chat/completions` | Chat completion with failover + retry rounds (streaming and non-streaming) |
| `GET /v1/models` | The current (live-discovered) chain, so discovery in DSH succeeds |
| `GET /health` | `lastGood`, current chain, backoff, counters — machine-readable |
| `GET /status` | One-glance status: what we route to, the free guard, retry state |

## Request headers (optional)

| Header | Effect |
| --- | --- |
| `X-Numes-Chain` | Comma-separated model IDs to try instead of the default chain (each must end `:free`) |
| `X-Numes-Force-Model` | Try exactly one model, no failover (must end `:free`) |
| `X-Numes-Max-Rounds` | Give up after this many rounds for this request (`0` = never stop) |

## Response headers

| Header | Meaning |
| --- | --- |
| `X-Numes-Free-Model` | Which model actually answered |
| `X-Numes-Free-Attempts` | Total tries across all rounds (2 = one failover) |
| `X-Numes-Free-Round` | Which round succeeded (1 = immediate) |

## Behaviour worth knowing

- **Empty answer with a small output cap.** The free models reason by default and reasoning tokens count toward `max_tokens`. With `max_tokens: 40` a reply came back as `finish_reason: "length"` with empty `content` and 40 reasoning tokens. Use a generous cap (1500+), or send `reasoning: {"effort": "none"}`, which produced `PONG` with 0 reasoning tokens in testing.
- **Sticky:** the last model that worked is tried first on the next request, so a healthy model is not re-probed every time.
- **Retries never hammer a dead account.** Numes errors that mean "the key or funds are the problem" (`401` invalid credentials, `402` insufficient credits, `403` forbidden) abort the rounds immediately with a clear message — waiting cannot fix a rejected key. Everything else (`503` no provider, `429` rate limit, timeouts) is retried.
- **`Retry-After` is honoured.** Numes rate limits answer `429 rate_limited` and overload answers `503 service_unavailable` with a `Retry-After` hint (usually 2 seconds). The proxy reads it and waits the larger of the hint and its own backoff, so it never waits less than the platform asked.
- **The catalogue keeps itself current.** `GET /models` is re-read every 5 minutes (default). A free offer that disappears stops being tried; a model that gains a `:free` entry joins the chain automatically. A failure keeps the last good list; discovery never blocks or kills requests. Setting `NUMES_CHAIN` pins your own order and makes discovery informational.
- **Streaming:** once the first byte arrives, output is piped straight through. Failover cannot happen after partial output — restarting mid-answer would corrupt it, and tool effects may already have run. A stalled stream is closed by the idle watchdog.
- **Backoff honours the platform.** Numes rate limits answer with `429 rate_limited` and a `Retry-After` hint; Numes overload answers `503 service_unavailable` with `Retry-After` (usually 2 seconds). The 5-second first backoff already respects both. A rate-limited request does not consume its `X-Request-Id`, and failed attempts are never charged (no output, no charge), so waiting costs nothing.
- **Failures are free.** Per the [Principles](https://numes.ai/docs/principles): "a request that fails without delivering output to you isn't charged". Only delivered output is charged, and here it always comes from a `:free` endpoint.
- **Disconnects stop everything.** If the caller (DSH) disconnects mid-rounds, the proxy aborts attempts and backoff promptly rather than retrying to a dead connection.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `NUMES_PROXY_PORT` | `8787` | Listen port on `127.0.0.1` |
| `NUMES_CHAIN` | the nine `:free` IDs | Comma-separated failover order (each must end `:free`) |
| `NUMES_UPSTREAM` | `https://api.numes.ai/api/v1` | Upstream base URL |
| `NUMES_PROXY_HEADER_TIMEOUT_MS` | `180000` | First-byte deadline per attempt |
| `NUMES_PROXY_BODY_TIMEOUT_MS` | `300000` | Overall deadline, non-streaming |
| `NUMES_PROXY_IDLE_TIMEOUT_MS` | `120000` | Stalled-stream watchdog |
| `NUMES_PROXY_BACKOFF_MS` | `5000,10000,15000,30000,60000,120000,300000` | Round delays; the last value repeats forever |
| `NUMES_PROXY_MAX_ROUNDS` | `0` | Give up after N rounds (`0` = never) |
| `NUMES_PROXY_DISCOVERY_MS` | `300000` | Refresh the free-model catalogue from `GET /models` every N ms (`0` disables) |
| `NUMES_PROXY_MIN_BACKOFF_MS` | `1000` | Floor for `Retry-After`-aware waits |

The default chain is the nine `:free` entries observed on 17 November 2026 — but with auto-discovery on (the default) it is only the fallback until the first `GET /models` succeeds, after which routing always uses the live list. Setting `NUMES_CHAIN` pins your own order instead.

The default backoff (5s → 10s → 15s → 30s → 1m → 2m → 5m → 5m forever) matches the observed behaviour of the free pool: short blips recover in seconds, exhausted capacity recovers in minutes. Free endpoints legitimately need 50–85 s before first output, so the per-attempt timeouts (180 s / 300 s) must stay generous.

## Verify it yourself

```powershell
# health, chain, backoff and counters
Invoke-RestMethod http://127.0.0.1:8787/health

# one real request; the headers name the model that answered
$body = @{ model='auto'; messages=@(@{role='user';content='Reply with one word: PONG'}) } | ConvertTo-Json -Depth 5
$r = Invoke-WebRequest http://127.0.0.1:8787/v1/chat/completions -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 300 -UseBasicParsing
$r.Headers['X-Numes-Free-Model']
($r.Content | ConvertFrom-Json).usage.cost    # 0

# the paid-model guard in action
$dead = Invoke-WebRequest http://127.0.0.1:8787/v1/chat/completions -Method POST -Headers @{'X-Numes-Force-Model'='moonshotai/kimi-k3.1-pro'} -ContentType 'application/json' -Body $body -TimeoutSec 30 -UseBasicParsing -SkipHttpErrorCheck
$dead.StatusCode   # 400
($dead.Content | ConvertFrom-Json).error.message   # refusing non-free model ...
```

## Security

- Binds to `127.0.0.1` only; it is not reachable from your network.
- Holds the Numes key in memory and sends it only to the configured upstream.
- Logs model IDs and error text, never the key or full prompts.
- No account creation, no captcha handling, no rate-limit evasion: a `429` is passed through with its `Retry-After` semantics intact.

## Limitations

- **Not a scheduler.** It serialises nothing; concurrent requests each run their own chain.
- **Not persistent.** `lastGood` and counters reset when the process restarts.
- **Does not make free pools reliable.** It converts "fail fast" into "wait and try again", which is what an exhausted pool needs — but if Numes removes every free offer, retry rounds keep failing honestly.
- **Untested against paid routes on purpose** — the `:free` guard makes a paid route impossible, which is the point.
