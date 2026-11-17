# Numes models in DeepSeek Harness

A compact, source-backed guide to using [Numes](https://numes.ai) with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) — including a **hard $0 route** that cannot fall back to a paid endpoint.

[Русская версия](README.ru.md). Independent guide; unofficial for both projects.

**No new DSH plugin is needed.** DSH already ships the `llm-pi-ai` adapter for OpenAI-compatible endpoints, so Numes is added from **Settings → Models → Add model provider**.

[Quick setup](#2-minute-setup) · [The $0 route](#the-0-route-use-free) · [File-based setup](#optional-file-based-configuration) · [Troubleshooting](#troubleshooting)

## Why this guide exists

Numes speaks **OpenAI Chat Completions**; DSH reaches custom Chat Completions gateways through `llm-pi-ai`. Joining them is configuration, not plugin development.

There is no Numes preset in DSH's provider directory, so pick **Custom model API** rather than hunting for a Numes button.

## 2-minute setup

Prerequisites: a working DSH install and a Numes **inference** key from [Keys](https://numes.ai/dashboard/keys). The key's billing currency is permanent.

1. In DSH open **Settings → Models**.
2. Choose **Add model provider → Custom model API**.
3. Fill in:

   | Field | Value |
   | --- | --- |
   | Provider ID | `numes` |
   | Protocol | **OpenAI Chat Completions** |
   | Endpoint | `https://api.numes.ai/api/v1` |
   | API key | your own key (`sk-` followed by the rest, exactly as Numes issued it) |

4. Save. The key lands in DSH's credential store, not in provider configuration. To use environment authentication instead, give `NUMES_API_KEY` to the process that launches DSH.
5. Click **Fetch available models**, select the models you want, then **Update list**. Discovery reads `GET https://api.numes.ai/api/v1/models`; it does not test inference or prove that an offer is $0.
6. In the composer, pick a model under **Numes** — for example `moonshotai/kimi-k3.1-pro:free`.

> A model ID containing `/` and `:` is expected. DSH shows it as `numes/moonshotai/kimi-k3.1-pro:free` to select the route, and the Numes API receives `moonshotai/kimi-k3.1-pro:free` unchanged. Checked on DSH Desktop 0.2.2-rc.3.

No install script, no daemon, no extra package, and no key in Git.

## The $0 route: use `:free`

Numes splits a model's **free** and **paid** endpoints into two catalogue entries:

- `author/model` — only endpoints that charge.
- `author/model:free` — only endpoints where **every rate is zero** in your key's currency.

Per [Numes's model documentation](https://numes.ai/docs/models#free-models), `:free` is a hard guarantee: fallback never crosses to the paid side. If no free endpoint can take the request you get `503 provider_unavailable` and **nothing is charged**. A free request cannot silently become a paid one.

So the free setup is simply the same model ID with `:free` appended. DSH treats it as an ordinary model ID.

**Gotcha that bites people:** a plain ID like `moonshotai/kimi-k3.1-pro` now routes to *paid* endpoints only. With an empty balance that surfaces as `402 insufficient_credits`, and with credit it charges you. If you want $0, the `:free` suffix is not optional.

Free requests are not unconditional: Numes requires a verified email and applies separate rate limits, returning `429 rate_limited` (check `Retry-After`) or `403 verified_email_required`.

### What $0 does not mean

Zero token price is not unlimited, instant, private, or permanent:

- Free entries appear and disappear as provider prices change. A model can be free today and paid tomorrow; the plain entry then starts charging.
- Zero rate says nothing about retention. Read [Numes's provider data policies](https://numes.ai/docs/privacy/provider-data-policies) before sending private code or credentials.
- Latency is provider-dependent. In manual probes on 17 November 2026, these free endpoints sometimes needed **50–85 seconds** before the first token, and tool calls could take longer. One short prompt returned in about 3 seconds shortly afterwards — expect variance, not a number.
- A dated observation: on 17 November 2026 a USD key saw nine `:free` text models with tool support, all served by `amazee.ai / token-factory`. That is a snapshot, not a promise that those nine exist tomorrow.

Always confirm with your own `usage.cost`, Numes [Activity](https://numes.ai/docs/account/activity), and `GET /api/v1/key`.

## Optional file-based configuration

Most users should use the GUI. For a managed/Desktop profile, [`configs/numes.patch.yml`](configs/numes.patch.yml) is a starter block for the profile's `cordis.patch.yml`, following the [official adapter example](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md#configure-provider-routes).

Add only the `llm-pi-ai` entry — do not replace the whole file. It contains no secret: `apiKeyEnv: NUMES_API_KEY` is a reference DSH resolves per request.

Why the config lists only `:free` IDs: the model list decides which IDs DSH can send, and `:free` decides where Numes may route them. Both are needed for a guaranteed-zero path.

## Numes also has a launcher

Numes documents `numes run opencode` / `numes run pi`: you paste or create an inference key once and the launcher writes that client's configuration. Handy for OpenCode, Pi and OMP — but it does not configure a DSH profile. Use DSH's Models page instead of installing another agent just for this. See [Numes coding agents](https://numes.ai/docs/integrations/coding-agents).

## Troubleshooting

| Symptom | Meaning and next step |
| --- | --- |
| `402 insufficient_credits` on a model you thought was free | You sent a plain ID, so routing used a paid endpoint. Append `:free`, and check the balance/limits with `GET /api/v1/key`. |
| `429 rate_limited` | Free requests have their own limits. Wait for `Retry-After`; do not loop. |
| `403 verified_email_required` | Numes requires a verified email for free requests. Verify it on Numes. |
| `503 provider_unavailable` | No eligible free endpoint right now, an unhealthy endpoint, or unsupported parameters. Refresh the catalogue, try another `:free` model, or wait. |
| `401 invalid_credentials` | Wrong/revoked/expired key, or a management key instead of an inference key. Recreate on [Numes Keys](https://numes.ai/dashboard/keys); never post the key. |
| Model missing from the picker | Re-run discovery, and confirm the key and route saved. Raw profile edits show up in DSH configuration diagnostics. |
| Slow start | Measure on a quiet sample. Free endpoints vary a lot; a 60-second first token is a known behaviour, not necessarily a broken config. |
| Empty content, truncated answer | Raise the output allowance, shorten context, or try another `:free` model. Reasoning tokens count toward output. |
| Which endpoint actually served | Check the response `provider` field and Numes generation metadata/logs. |

## Scope and disclaimers

- Verified with ordinary OpenAI-compatible requests, streaming usage, and tool calls from a coding-agent-shaped payload.
- Tested on DSH Desktop 0.2.2-rc.3 (Windows) with a USD key. Not certified for every DSH release, account, or Numes deployment.
- DSH and Numes both change. Re-read their docs after upgrading; treat samples here as a dated starting point.
- Numes's [Acceptable Use Policy](https://numes.ai/legal/acceptable-use) applies. This guide does not automate account creation, captcha solving, credit harvesting, key sharing, or quota evasion.
- Not affiliated with DeepSeek or Numes. No warranty on availability, charges, speed, privacy, or fitness.

### Sources

- [Numes: Free models](https://numes.ai/docs/models#free-models) — the `:free` contract
- [Numes: Provider routing](https://numes.ai/docs/routing/provider-routing) · [Quickstart](https://numes.ai/docs/quickstart) · [Coding agents](https://numes.ai/docs/integrations/coding-agents)
- [DSH `llm-pi-ai` adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md) · [DSH Models UI](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-models/README.md)

## License

MIT — see [LICENSE](LICENSE). Contribution and security notes: [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md).
