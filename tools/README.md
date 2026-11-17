# Free-model failover proxy

Local OpenAI-compatible endpoint that tries every **`:free`** Numes model in turn until one answers, so you stop switching models by hand when a pool drops.

```
DSH (or curl) ──▶ 127.0.0.1:8787  ──▶  Numes :free models, one per attempt
                    (this script)
```

## Why it exists

`:free` requests never fall back to a paid endpoint — that is the guarantee that keeps them at $0. The cost of that guarantee is that a single unavailable free pool returns `503 provider_unavailable` and the turn fails. This proxy turns that dead end into "try the next free model".

**It never uses a paid model.** Every candidate in the chain ends with `:free`, so a failed attempt costs nothing and there is no path to a charge.

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
2026-11-17T16:15:45.490Z listening on http://127.0.0.1:8787 (chain of 9 free models)
2026-11-17T16:15:45.494Z upstream https://api.numes.ai/api/v1; key source: ~/.dsh/.credentials.yaml
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

Then keep the original `numes` provider for direct `:free` access if you want it, and pick the `numes-free` models when you want automatic failover.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /v1/chat/completions` | Chat completion with failover (streaming and non-streaming) |
| `GET /v1/models` | Lists the failover chain, so discovery in DSH succeeds |
| `GET /health` | Current `lastGood` model, configured chain, attempt/success/failure counters |

## Request headers (optional)

| Header | Effect |
| --- | --- |
| `X-Numes-Chain` | Comma-separated model IDs to try instead of the default chain |
| `X-Numes-Force-Model` | Try exactly one model, no failover |

## Response headers

| Header | Meaning |
| --- | --- |
| `X-Numes-Free-Model` | Which model actually answered |
| `X-Numes-Free-Attempts` | How many attempts it took (1 = first model worked) |

## Behaviour worth knowing

- **Sticky:** the last model that worked is tried first on the next request, so a healthy model is not re-probed every time.
- **Streaming:** once the first byte arrives, output is piped straight through. Failover cannot happen after partial output — restarting mid-answer would corrupt it, and tool effects may already have run.
- **Deadlines:** `NUMES_PROXY_HEADER_TIMEOUT_MS` (default 180 s) bounds the wait for the first byte per attempt; `NUMES_PROXY_BODY_TIMEOUT_MS` (default 300 s) bounds a non-streaming attempt; `NUMES_PROXY_IDLE_TIMEOUT_MS` (default 120 s) closes a stalled stream. Free pools legitimately need 50–85 s before first output, so do not set these aggressively.
- **Failures are free:** a `503`/timeout on an attempt is not billed. Only delivered output is charged, and here it always comes from a `:free` endpoint.
- **All candidates failing** returns the last upstream error with `error_type: provider_unavailable` and a note that nothing was charged. It does not invent a paid fallback.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `NUMES_PROXY_PORT` | `8787` | Listen port on `127.0.0.1` |
| `NUMES_CHAIN` | the nine `:free` IDs | Comma-separated failover order |
| `NUMES_UPSTREAM` | `https://api.numes.ai/api/v1` | Upstream base URL |
| `NUMES_PROXY_HEADER_TIMEOUT_MS` | `180000` | First-byte deadline per attempt |
| `NUMES_PROXY_BODY_TIMEOUT_MS` | `300000` | Overall deadline, non-streaming |
| `NUMES_PROXY_IDLE_TIMEOUT_MS` | `120000` | Stalled-stream watchdog |

The default chain is the nine `:free` entries observed on 17 November 2026. Refresh it when the catalogue changes — a model that loses its free offer will simply fail its attempt and the next one is tried.

## Verify it yourself

```powershell
# health and current chain
Invoke-RestMethod http://127.0.0.1:8787/health

# one real request; the headers name the model that answered
$body = @{ model='auto'; messages=@(@{role='user';content='Reply with one word: PONG'}) } | ConvertTo-Json -Depth 5
$r = Invoke-WebRequest http://127.0.0.1:8787/v1/chat/completions -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 300 -UseBasicParsing
$r.Headers['X-Numes-Free-Model']
($r.Content | ConvertFrom-Json).usage.cost    # 0
```

## Security

- Binds to `127.0.0.1` only; it is not reachable from your network.
- Holds the Numes key in memory and sends it only to the configured upstream.
- Logs model IDs and error text, never the key or full prompts.
- No account creation, no captcha handling, no rate-limit evasion: a `429` is passed through with its `Retry-After` semantics intact.

## Limitations

- **Not a scheduler.** It serialises nothing; concurrent requests each run their own chain.
- **Not persistent.** `lastGood` and counters reset when the process restarts.
- **Does not make free pools reliable.** If Numes has no free capacity at all, every attempt fails and you get the honest `503`.
- **Untested against paid routes on purpose** — plugging a paid model into the chain would remove the $0 guarantee this tool exists to preserve.
