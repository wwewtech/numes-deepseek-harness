# Numes models in DeepSeek Harness

A source-backed, step-by-step guide to add Numes to DeepSeek Harness (DSH), with an explicit **`$0` route using `:free`**.

**По-русски: [полная настройка](docs/SETUP.ru.md).**<br>
English: [quick setup](#quick-setup) · [full setup and troubleshooting](docs/SETUP.md)

## What you need

- DSH running on Desktop or via `dsh web`, with **Settings → Models**.
- Your own Numes account and a verified email for free requests.
- A Numes **inference key** from [Keys → Create key](https://numes.ai/dashboard/keys).
- **No extra DSH plugin, Python package, local proxy, or paid credits required for available `:free` offers.**

## Quick setup

1. In [Numes → Keys](https://numes.ai/dashboard/keys), choose **Create key**. Give it a name, **Type: Inference**, pick a permanent currency (e.g. USD), optionally set a spend limit, and copy the secret shown once.
2. In DSH, open **Settings → Models → Add model provider → Custom model API**.
3. Enter these values:
   | Field | Value |
   | --- | --- |
   | Provider ID | `numes` |
   | Display name | `Numes` |
   | Base URL / Endpoint | `https://api.numes.ai/api/v1` |
   | Protocol | **OpenAI Chat Completions** |
   | API key | your own inference key |
4. Save. DSH stores the secret write-only in its credential store and keeps only a credential reference, such as `NUMES_API_KEY`, in its profile.
5. Click **Fetch available models**. Select current entries marked **`(free)` / ending in `:free`**, click **Update list**, and save the provider.
6. In the model picker, select `numes / moonshotai/kimi-k3.1-pro:free`. Send:
   ```text
   Reply with exactly one word: PONG
   ```

If the composer asks for a project, use **Choose workspace** first. Model changes apply on the next request; an already active session keeps its recorded model until you select a different one there.

## What choosing `:free` means

| ID | Numes routes it to |
| --- | --- |
| `author/model` | Endpoints that charge |
| `author/model:free` | Only endpoints whose every rate is zero in your key's currency |

The direct Numes docs say `:free` requests **cannot fall back to paid endpoints**: no available eligible free endpoint returns `503 provider_unavailable`, costing nothing. It does not mean unlimited requests, guaranteed speed, no logging, or a permanent free tier.

- ID spelling including `/` and `:` is normal; DSH displays the provider route plus the unchanged Numes model ID.
- Free requests require email verification and have rate limits: `429 rate_limited` (honor `Retry-After`) or `403 verified_email_required`.
- **[Plain IDs are now paid routes]** — on my test account, `moonshotai/kimi-k3.1-pro` → `402` on a zero balance, while its `:free` counterpart answered `PONG` with `cost: 0`.

Read the [Numes free-model contract](https://numes.ai/docs/models#free-models), credentials guide, provider data policy, and actual usage. There is no second API, separate installation or Linux proxy required merely to use Numes from DSH.

## Optional manual profile configuration

See [`configs/numes.patch.yml`](configs/numes.patch.yml) for the exact provider block. Do **not** overwrite your whole profile with this sample: append/merge the entry into its top-level array while preserving your other records.

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      numes:
        displayName: Numes
        api: openai-completions
        baseURL: https://api.numes.ai/api/v1
        apiKeyEnv: NUMES_API_KEY
        streamIdleTimeoutMs: 300000
        models:
          - id: moonshotai/kimi-k3.1-pro:free
            name: Kimi K3.1 Pro (free)
            contextWindow: 1048576
            maxTokens: 65536
            reasoningEfforts: false
```

Typical local path: `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. DSH's official guide uses `web` for `dsh web`; the tested Desktop install used `desktop`. Use your actual profile name.

The file contains a **reference** to a key, not a key. `$env:NUMES_API_KEY`/launch environment can work if configured before DSH starts; a saved credential in `$DSH_HOME/.credentials.yaml` wins over environment fallback. Changing env variables after DSH started requires a restart to change that process's snapshot. Saved GUI credentials and profile configuration apply without restarting on the next request. Free endpoints do not get faster just because the stream timeout is long.

## If you saw QUOTA / 402 / 429 / 503

| Error | Explanation and what to do |
| --- | --- |
| `QUOTA` / `402 insufficient_credits` | Often a plain ID without `:free` sent you to a paid route, as in my checks. Correct the model itself to `:free`; do not just top-up hoping to preserve a free route. Spending limits and holds for other requests can also cause 402. |
| `429 rate_limited` | Free requests have their own limits; respect `Retry-After`. Another key or a session with stale credentials may require starting a refreshed request. |
| `429 provider_overloaded` | Current concurrent requests are full. Reduce parallel calls and use exponential backoff with jitter. |
| `503 provider_unavailable` | No eligible free endpoint or requested feature is supported at that moment. It does not fall back to paid. Refresh, try another currently-listed free model, or wait. |
| `401 invalid_credentials` | Wrong key kind, invalid secret, disabled/expired key. Create a replacement inference key; do not publicize it. |
| Empty/truncated answer | Give output tokens room for thinking/tool calls (1500+ in my manual probes); try another model. |

All error handling is by status + stable `metadata.error_type`, never by human-readable labels alone. Before retrying a mid-stream failure, account for already received text and completed tool effects. For support include `X-Request-Id`, not key/prompt/secrets.

## Don't need `numes run` for DSH

The [Numes coding-agent guide](https://numes.ai/docs/integrations/coding-agents) describes `numes run opencode` / `numes run pi`. That launcher creates OpenCode/Pi/OMP configuration and can create/save an inference key. It is useful with the mentioned agents; it does **not** create a DSH profile. DSH already reads your built-in `llm-pi-ai` adapter via its own Models page.

## Automatic free-model failover

Tired of switching models by hand after a `503`? A local proxy tries every `:free` model in turn until one answers, and **never falls back to a paid one**:

```bash
node tools/numes-free-failover.mjs
```

Then add a second DSH provider pointing at `http://127.0.0.1:8787/v1` (OpenAI Chat Completions, any placeholder key — the real Numes key stays inside the proxy). Details: [tools/README.md](tools/README.md); ready block: [configs/numes-failover.patch.yml](configs/numes-failover.patch.yml).

Verified: with the first candidate unavailable, the request moved to the next model and returned with `cost: 0`.

## Sources

- [DSH README: run](https://github.com/deepseek-ai/deepseek-harness#run)
- [DSH: Configure models (including custom OpenAI-compatible providers)](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)
- [Numes: Model catalogue and free guarantees](https://numes.ai/docs/models)
- [Numes: Create / limit inference keys](https://numes.ai/docs/account/api-keys)
- [Numes: API quickstart](https://numes.ai/docs/quickstart)
- [Numes: Errors including rate limits and insufficient credits](https://numes.ai/docs/api-reference/errors)

## Verified scope

One desktop DSH 0.2.2-rc.3 profile on Windows, standard `llm-pi-ai` route and one USD key were checked on 17 November 2026 along with actual zero-cost Kimi :free model responses and DSH-sized tool-call payloads. Other model polls supplied catalogue metadata only. This page is not affiliated with DSH or Numes.

Consult the actual service docs after upgrading and before production use. Apply [Numes Acceptable Use](https://numes.ai/legal/acceptable-use), DSH's license and your provider's terms. No account/CAPTCHA automation, shared keys or quota-evasion instructions are involved.

MIT — [LICENSE](LICENSE) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md).
