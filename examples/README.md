# Examples

Runnable recipes for the free Numes route. Every snippet here was exercised against the live API while writing the guide — but **re-check prices yourself**: free offers come and go.

Two ways to talk to Numes:

| Route | Endpoint | When |
|---|---|---|
| **Direct** | `https://api.numes.ai/api/v1` | You pick `:free` models yourself |
| **Proxy** | `http://127.0.0.1:8787/v1` | You want failover, retries and discovery |

The direct route needs `NUMES_API_KEY`. The proxy holds the key itself, so clients only send a placeholder.

- [`curl.md`](curl.md) — raw HTTP, no tooling
- [`python.py`](python.py) — `requests`, streaming, tool calls
- [`powershell.ps1`](powershell.ps1) — Windows-native
- [`node.mjs`](node.mjs) — `fetch`, zero dependencies
- [`tool-call.md`](tool-call.md) — a complete tool-calling loop

## The one rule

A model id must end in **`:free`**:

```text
moonshotai/kimi-k3.1-pro        ← paid route: 402 on a zero balance
moonshotai/kimi-k3.1-pro:free   ← free route: cost 0
```

Through the proxy you send its alias instead (`numes-free-auto`); the proxy enforces `:free` for you and rejects anything else with `400` before any traffic leaves the machine.

## Giving output room

Free models reason by default and reasoning tokens count toward `max_tokens`. With `max_tokens: 40` the reply came back **empty** with `finish_reason: "length"`. Use `1500`+, or turn reasoning off:

```json
{ "reasoning": { "effort": "none" } }
```
