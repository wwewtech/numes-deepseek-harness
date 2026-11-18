# curl recipes

Raw HTTP — no SDK, no runtime. Substitute your own key.

## 1. The absolute minimum

```bash
export NUMES_API_KEY="sk-..."          # your own inference key

curl -s https://api.numes.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $NUMES_API_KEY" \
  -H "Content-Type: application/json" \
  --max-time 630 \
  -d '{
    "model": "moonshotai/kimi-k3.1-pro:free",
    "max_tokens": 1500,
    "reasoning": { "effort": "none" },
    "messages": [{ "role": "user", "content": "Reply with exactly one word: PONG" }]
  }'
```

Look at `usage.cost` in the answer — for a `:free` route it is `0`.

## 2. Streaming

```bash
curl -N https://api.numes.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $NUMES_API_KEY" \
  -H "Content-Type: application/json" \
  -D - \
  -d '{
    "model": "deepseek/deepseek-v4.1-flash:free",
    "stream": true,
    "max_tokens": 1500,
    "messages": [{ "role": "user", "content": "Count to five." }]
  }'
```

`-N` disables buffering, `-D -` prints headers including `X-Request-Id` and `X-Generation-Id`.

## 3. Which free models exist right now

```bash
curl -s https://api.numes.ai/api/v1/models \
  -H "Authorization: Bearer $NUMES_API_KEY" \
  | jq -r '.data[].id | select(endswith(":free"))'
```

## 4. What a specific endpoint charges

The catalogue row describes *one representative* offer. Check the endpoint itself:

```bash
curl -s "https://api.numes.ai/api/v1/models/moonshotai%2Fkimi-k3.1-pro%3Afree/endpoints" \
  -H "Authorization: Bearer $NUMES_API_KEY" \
  | jq '.data.endpoints[] | {tag, pricing, max_completion_tokens}'
```

Note the URL encoding: `:` becomes `%3A`, `/` becomes `%2F`.

## 5. Pin one endpoint and cap the price

For a direct call you can force an endpoint *and* refuse anything above zero:

```bash
curl -s https://api.numes.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $NUMES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshotai/kimi-k3.1-pro:free",
    "max_tokens": 1500,
    "provider": {
      "only": ["PROVIDER-SLUG/ENDPOINT-ID"],
      "max_price": { "prompt": 0, "completion": 0 }
    },
    "messages": [{ "role": "user", "content": "hi" }]
  }'
```

Get the current tag from step 4 — do not copy a tag from an old post.

## 6. Through the local proxy

Start it first (`node tools/numes-free-failover.mjs`), then forget about model ids:

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "numes-free-auto",
    "max_tokens": 1500,
    "reasoning": { "effort": "none" },
    "messages": [{ "role": "user", "content": "Reply with exactly one word: PONG" }]
  }'
```

The response headers tell you what happened:

```text
X-Numes-Free-Model:    moonshotai/kimi-k3.1-pro:free
X-Numes-Free-Attempts: 1
X-Numes-Free-Round:    1
```

`Attempts: 2` means one model failed and the next one answered. `Round: 2` means the whole chain failed once, the proxy waited, and tried again.

## 7. Health, status, models

```bash
curl -s http://127.0.0.1:8787/status | jq .free,.retry
curl -s http://127.0.0.1:8787/health | jq '.chain|length, .stats'
curl -s http://127.0.0.1:8787/v1/models | jq -r '.data[].id'
```

## Common answers

| Status | `error_type` | Meaning |
|---|---|---|
| `402` | `insufficient_credits` | You sent a plain id (paid route) or hit a limit |
| `429` | `rate_limited` | Free requests have their own limits — honour `Retry-After` |
| `503` | `provider_unavailable` | No free endpoint can serve this right now; nothing was charged |
| `401` | `invalid_credentials` | Wrong/revoked/management key |

Every response carries `X-Request-Id`. Quote it in support requests; never send the key or prompt.
