# Numes models in DeepSeek Harness

A compact, source-backed setup guide for using [Numes](https://numes.ai) with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — including the $0 offers in its marketplace.

**No new DSH plugin is needed.** DSH already includes the `llm-pi-ai` adapter for OpenAI-compatible endpoints. You can add Numes from **Settings → Models → Add model provider** without editing files.

[Quick setup](#2-minute-setup) · [Free-tier reality](#the-free-offer-is-not-a-guarantee) · [File-based setup](#optional-file-based-configuration) · [Troubleshooting](#troubleshooting)

[Русская версия](README.ru.md). Independent guide; unofficial for both projects.

## Why this guide exists

Numes speaks **OpenAI Chat Completions**. DSH speaks to custom Chat Completions gateways through `llm-pi-ai`. The two already fit together; joining them is configuration, not a DSH plugin-development project.

The default DSH model directory does not have a Numes preset. Select **Custom model API**, rather than looking for a Numes button.

## 2-minute setup

You need an active DSH installation and a Numes **inference** key. Create or copy one on Numes at [Keys](https://numes.ai/dashboard/keys). The key's billing currency is permanent; see Numes's [key documentation](https://numes.ai/docs/account/api-keys).

1. In DSH open **Settings → Models**.
2. Choose **Add model provider → Custom model API**.
3. Fill in:
   | Field | Value |
   | --- | --- |
   | Provider ID | `numes` |
   | Protocol | **OpenAI Chat Completions** |
   | Endpoint | `https://api.numes.ai/api/v1` |
   | API key | `sk-numes-v1-…` (your own key) |
4. Save. The key goes into DSH's credential store, not the provider configuration. If using environment authentication instead, supply `NUMES_API_KEY` to the process launching DSH.
5. Click **Fetch available models**, choose the models you want, then **Update list**. Discovery inspects `GET https://api.numes.ai/api/v1/models`; it does not fetch inference or prove that a selected offer is free.
6. In the chat composer, select a model under **Numes**, e.g. `moonshotai/kimi-k3.1-pro`.

> A model ID with slashes is expected: DSH uses `numes/moonshotai/kimi-k3.1-pro` to choose the Numes route but sends `moonshotai/kimi-k3.1-pro` to the Numes API. This arrangement was checked on DSH 0.2.2-rc.3.

You are done. No install script, no new daemon, no plugin package, no API key in Git.

## The free offer is not a guarantee

**$0 != unlimited.** Some Numes endpoints list input and output rates at $0. Whether they remain available, what quotas apply, and how prompt data is retained are separate questions. Read Numes's [model/pricing documentation](https://numes.ai/docs/models) and [provider data policies](https://numes.ai/docs/privacy/provider-data-policies).

On 17 November 2026 a manual scan of all 154 models available to one USD key found nine $0 input-completion, tool-capable offers. All were on `amazee.ai / token-factory`. This is **a dated observation, not a promise**. Numes permits many providers, so a model with a free endpoint may also have paid endpoints.

| State | What to expect |
| --- | --- |
| A healthy free endpoint | Actual `usage.cost` should show `0`. Always check your own usage. |
| No eligible free endpoint | The offer can disappear; refresh the model list. |
| Default route tries a paid endpoint | With an empty balance this returns `402`; with credits it may charge you. |
| An interactive agent | Be prepared for variable first-token latency and occasional errors. |

This guide deliberately does **not** promise free forever, unlimited requests, zero retention, absence of any per-request/non-token fee, official Numes support for DSH, or that every listed offer is actively serving requests. For cost-sensitive work, set a spending limit on your Numes key and Numes account.

### Safe and useful expectations

- For curiosity, testing integrations, and non-urgent tasks, a free offer can be convenient.
- For reliable client work, decide your budget and select a paid route with acceptable speed and data policy.
- For manual API calls, inspect exactly where you are routed (`X-OpenRouter-Metadata: enabled`, or Numes's `GET /generation`).
- For manual free-only calls, use `provider.only` with a specific endpoint tag **and** `provider.max_price: { prompt: 0, completion: 0 }`. For example:

```json
{
  "model": "moonshotai/kimi-k3.1-pro",
  "messages": [{ "role": "user", "content": "Hello" }],
  "provider": {
    "only": ["PROVIDER-SLUG/ENDPOINT-ID"],
    "max_price": { "prompt": 0, "completion": 0 }
  }
}
```

Find the current endpoint tag with Numes's `GET /api/v1/models/{author}/{slug}/endpoints`; do not blindly copy a tag from a dated guide. The DSH adapter does not expose a per-request Numes `provider` pin, so do not imply otherwise.

## Optional file-based configuration

Many users should use the GUI above. For managed/Desktop profiles, the [official adapter example](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md#configure-provider-routes) can be placed in the profile's `cordis.patch.yml`. A ready Numes starter is provided in [`configs/numes.patch.yml`](configs/numes.patch.yml).

Adapt it to your profile and review every model entry before use. It contains no secret: `apiKeyEnv: NUMES_API_KEY` makes DSH resolve the credential on each request.

## Numes also has a launcher

Numes documents `numes run opencode` and `numes run pi`: you can paste or create an inference key once and the launcher generates the corresponding client configuration. That is useful for OpenCode, Pi and OMP, but it does not configure a DSH profile. Use DSH's Models page instead of downloading another agent just for this.

Reference: [Numes coding-agent integration](https://numes.ai/docs/integrations/coding-agents).

## Troubleshooting

| Symptom | Meaning and next step |
| --- | --- |
| Models do not show up | Verify `NUMES_API_KEY` or the saved key, refresh the page, and re-use model discovery. If a raw profile edit was misformatted, DSH configuration diagnostics are shown in the application. |
| `401 invalid_credentials` | Wrong/revoked/expired key, or a management key rather than an inference key. Recreate it on [Numes Keys](https://numes.ai/dashboard/keys); do not publish it in an issue. |
| `402 insufficient_credits` | The chosen offer is not $0, or the account/key spending limit stopped a request. Check the price of the model and spending limits. Do not retry in a loop. |
| `503 provider_unavailable` | An endpoint has no capacity, is unhealthy, does not support required parameters, or your `provider` filters excluded all endpoints. |
| Slow start | Test on a quiet sample first. In my dated manual probes, these $0 endpoints sometimes needed about 50–85 seconds before first output, and tool calls could take longer. Not every network stall or 50-second delay is necessarily bad. |
| Empty response/tool loop | Try a different offer in the DSH picker, shorten the context, and give the model enough output tokens for tool calls or reasoning. A diagnostic/retry policy does not make weak endpoints instant. |
| The selected model versus what you receive | Numes chooses the route. Check the returned `provider` and Numes generation metadata/logs. |

## Scope and disclaimers

- Tested using ordinary OpenAI-compatible requests and a tool call from a cwd-style coding-agent payload.
- The preparation environment was DSH Desktop 0.2.2-rc.3 on Windows; the selected model was visible in DSH's model selector after the local route configuration. This is not certification against every DSH release or Numes account.
- DSH and Numes both evolve. Re-read their official documentation after upgrading and treat this repository's samples as a point-in-time starting point.
- Numes's [Acceptable Use Policy](https://numes.ai/legal/acceptable-use) applies. This guide does not automate account creation, captcha solving, credit harvesting, key sharing, or evasion of account/rate limits.
- Not affiliated with DeepSeek or Numes. The services and $0 offers belong to their respective operators. No warranty on endpoint availability, token charges, speed, privacy or suitability.

### Sources

- [Official DSH `llm-pi-ai` adapter README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md)
- [Official DSH Models UI README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-models/README.md)
- [Numes: Models](https://numes.ai/docs/models) · [Custom API quickstart](https://numes.ai/docs/quickstart) · [Agent integration](https://numes.ai/docs/integrations/coding-agents)
- [Numes: Provider routing](https://numes.ai/docs/routing/provider-routing)

## License

MIT. See [LICENSE](LICENSE). Contributing notes: [CONTRIBUTING.md](CONTRIBUTING.md).
