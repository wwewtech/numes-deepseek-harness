# Configuring Numes in DeepSeek Harness — full setup

**Goal:** make Numes available in DeepSeek Harness (DSH) via its built-in `llm-pi-ai` adapter, and keep free calls on explicit **`author/model:free`** routes.

Verified 17 November 2026 on DSH Desktop 0.2.2-rc.3, Windows, a USD Numes key. This is a configuration guide, **not a DSH plugin**, and it does not run an installer against your profile. It is independent of both services.

> Existing DSH + existing key? Start at [step 3](#3-create-an-inference-key).
> Already configured but `QUOTA` / `402` appear? Jump to [step 5, `:free`](#5-select-free-models).

## 0. Prerequisites

- A DSH Desktop install or working `dsh web`, with **Settings → Models** accessible.
- Your own [Numes account](https://numes.ai). Free requests require a verified email. See [Profile](https://numes.ai/dashboard/profile) if receiving `403 verified_email_required`.
- A private Numes **inference key**. Never share it here, in screenshots, prompts, issues, or commits.
- Internet access. Buying credit is not required while a current **free offer has capacity**.

You do **not** need `our-free-model`, a third-party downloader, Python, a local relay, a token-harvesting utility, or duplicate accounts.

## 1. Start DSH

### Existing Desktop application

Open your already-running installation. Use its actual Settings interface and release information rather than assuming this tested version.

### Official Web UI launch

Follow the current [DSH root README](https://github.com/deepseek-ai/deepseek-harness#run). At the time of writing:

```sh
npx @deepseek-ai/dsh web
```

This needs a supported Node.js runtime; check current requirements in that README rather than copying an old version assertion. Run from your intended project directory: DSH uses its invocation directory as the default filesystem location. A local Web UI typically opens `http://127.0.0.1:3080`, but follow the URL **your command prints** if different.

Do not launch another server just because an existing DSH UI is open: configure the existing application. See the [official Web UI guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md). For an actual agent task, also select **Choose workspace**; you can first configure models.

## 2. Sign in and verify the Numes email

Follow the normal account sign-up or sign-in at [numes.ai](https://numes.ai). Confirm the verification email sent to you if the account has not been verified yet.

One personal account and one key per application/environment are enough. There is no account-creation automation, CAPTCHA solving or quota workaround in this guide.

## 3. Create an inference key

1. Open **Numes → [Keys](https://numes.ai/dashboard/keys)**.
2. In the account switcher, select the account the request should use if you have multiple accounts.
3. Choose **Create key**.
4. Give it a recognizable **Name**, for example `dsh-desktop`.
5. Choose **Type: Inference**, not Management. Only inference keys run model calls.
6. Choose a **currency**, e.g. `USD`. This is permanent for the key, and requests only use offers in it.
7. Optionally set a **Spend limit** and its reset interval. This is additional protection if you later use paid models, not a prerequisite for free requests.
8. Save and copy the full secret in **Save this key now**.

The secret is shown once and cannot be recovered after dismissing the dialog. If lost, create another key. Use the official [API-key documentation](https://numes.ai/docs/account/api-keys) for limits, rotation and revocation.

## 4. Add the Numes provider through the GUI

1. DSH → **Settings → Models**.
2. Click **Add model provider**.
3. Choose **Custom model API**. Do not use `Third-party model provider` expecting a built-in Numes preset; you are defining a custom gateway.
4. Enter **exactly**:

   | Field | Value |
   | --- | --- |
   | Provider ID | `numes` |
   | Display name | `Numes` (optional label) |
   | Base URL / Endpoint | `https://api.numes.ai/api/v1` |
   | API protocol | `OpenAI Chat Completions` |
   | API key | your own inference key |

5. If your UI asks you to create/apply this new provider before discovery, do that. If **Fetch available models** is usable on the creation form, you may continue there before the final save.

Use **OpenAI Chat Completions**, not Responses, Anthropic Messages or Gemini API. Numes accepts calls at `POST https://api.numes.ai/api/v1/chat/completions`.

If `numes` already identifies another provider, choose another unused ID (e.g. `numes-free`). Your chosen ID is a durable part of the route and persisted sessions, not a user secret.

### Where the key goes

DSH stores a newly entered key **write-only** in its credential store. The provider profile holds only a credential reference such as `NUMES_API_KEY`; the page sees a saved/masked state rather than the literal key.

In the standard local composition, this lives in `$DSH_HOME/.credentials.yaml`. Do not duplicate or publish the full secret just to keep a configuration example working.

## 5. Select free models

1. Click **Fetch available models**.
2. Wait for Numes's `GET /models` response. This is a listing operation, **not a test of inference or proof of $0**.
3. In the available model picker, choose entries ending in **`:free`** (often displayed with a `(free)` label).
4. Click **Update list**, then save/apply the provider.

A good first entry is `moonshotai/kimi-k3.1-pro:free`.

### Nine entries on 17 November 2026

```text
moonshotai/kimi-k3.1-pro:free
deepseek/deepseek-v4.1-flash:free
z-ai/glm-5.3:free
z-ai/glm-5.3-flash:free
nvidia/nemotron-3-ultra-550b-a55b:free
dealignai/deepseek-v4.1-flash-uncensored-fp8:free
dealignai/glm-5.3-flash-uncensored-fp8:free
dealignai/glm-5.3-uncensored-fp8:free
uniboshi/kimi-k3-abliterated-v1:free
```

The list is a **dated observation**, not a permanent entitlement. Refresh and choose from the actual catalogue. If an ID is not present as a free listing, appending `:free` cannot make an unavailable offer free.

Discovered unavailable? Enter IDs manually in the provider's model list. **For manual entries use the corresponding current `GET /models/{model}:free/endpoints` for actual prices, context and output limits.** The shown limits (1,048,576 / 65,536; GLM 5.3: 262,144 / 65,536) were also a dated observation and may change along with the offer; do not blindly use them months later.

### Why `:free` matters

Numes now separates paid and free endpoints of a model by suffix:

| ID | Eligible route |
| --- | --- |
| `author/model` | Only paid endpoints |
| `author/model:free` | Only endpoints with every rate zero in your key's currency |

Numes documents that a `:free` request **cannot fall back to a paid endpoint**. If no eligible free endpoint can run it, the error is `503 provider_unavailable` and you pay nothing.

Actual measurements on the test date:

```text
Kimi K3.1 Pro:free → HTTP 200 → PONG → cost 0
Kimi K3.1 Pro      → 402 insufficient_credits on a zero USD balance
```

Zero token price does not imply zero logging, unlimited access or low latency. Read the [free model rules](https://numes.ai/docs/models#free-models) and the [provider data policies](https://numes.ai/docs/privacy/provider-data-policies).

## 6. Select a workspace/model and test it

1. If the composer requires a project, click **Choose workspace** and select one.
2. In the composer model picker (or `/model`, if your UI exposes it), select **Numes → Kimi K3.1 Pro (free)**. It is normally shown as:
   ```text
   numes / moonshotai/kimi-k3.1-pro:free
   ```
3. Start with a small request:
   ```text
   Reply with exactly one word: PONG
   ```
4. Wait before repeating it. Some observed free calls spent 50–85 seconds waiting for first output; another short call responded in approximately 3 seconds. Tool calls may be slower. Neither number is an SLA.
5. For a harmless agent check:
   ```text
   List the main files at the root of this workspace without editing them.
   ```

In DSH selecting a model makes it the default for new sessions. **A session that already sent a request retains its recorded model** until changed in that session. Merely fixing a provider catalogue does not retroactively rewrite its model setting.

## 7. Check the real price and endpoint

Do not infer actual price from the label or marketing. Use [Numes Activity/Logs](https://numes.ai/dashboard/logs) or the own API-generation record and returned `provider`, `model`, `usage.cost` values.

Inspect the current key and its usage:

```powershell
$H = @{ Authorization = "Bearer $env:NUMES_API_KEY" }
Invoke-RestMethod "https://api.numes.ai/api/v1/key" -Headers $H
```

Try a direct completion without publishing your secret:

```powershell
$H = @{
  Authorization = "Bearer $env:NUMES_API_KEY"
  "Content-Type" = "application/json"
}
$body = @{
  model = "moonshotai/kimi-k3.1-pro:free"
  messages = @(@{ role = "user"; content = "Reply with exactly PONG" })
  max_tokens = 1500
  reasoning = @{ effort = "none" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod "https://api.numes.ai/api/v1/chat/completions" `
  -Method Post -Headers $H -Body $body -TimeoutSec 300
```

Do not copy the literal key into commands saved in history or attach entire chat logs with secrets. For errors after output starts, use the returned generation ID and `GET /generation` to inspect the authoritative record.

## 8. Alternative: configure the DSH profile by hand

You should have a reason to use this instead of the GUI; it is never required merely to see Numes models.

### 8.1. Locate the real profile

The local DSH home is typically `~/.dsh`, or `%USERPROFILE%\.dsh` on Windows, with `$DSH_HOME` taking precedence. A profile's patch is:

```text
$DSH_HOME/profiles/<profile>/cordis.patch.yml
```

The shipped guide uses `web` for `dsh web`; my tested Desktop installation used `desktop`. **Check your own launch/profile instead of assuming either value.**

### 8.2. Back up the current file

For this concrete tested Desktop layout only, and after checking your own profile path:

```powershell
$profile = Join-Path $env:USERPROFILE ".dsh\profiles\desktop"
Copy-Item (Join-Path $profile "cordis.patch.yml") `
  (Join-Path $profile "cordis.patch.yml.before-numes")
```

If the file does not exist, do not invent another directory tree. Use the GUI or create/configure the intended DSH profile first.

### 8.3. Add the route, preserving existing settings

Use [`../configs/numes.patch.yml`](../configs/numes.patch.yml) as a provider snippet. Add one matching entry of this shape to the top-level patch array:

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

**Do not replace the whole profile** with the example. Other model providers, session defaults, your agent settings and entries must remain preserved. Extend the model list from the current catalogue only if IDs and limits are current.

`streamIdleTimeoutMs: 300000` permits the tested slow streams to wait before first output; it neither makes them faster nor promises upstream availability. This is DSH stream idle waiting, not reasoning efficiency.

### 8.4. Store the secret correctly

Prefer saving your key in **Settings → Models**, retaining a reference in the config instead of a secret field.

Using the process's launch environment is an alternative. Set `NUMES_API_KEY` **before** starting DSH: changing it after the process started does not change its launch-time environment snapshot.

For direct local-store edits, read [DSH credentials-local](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/README.md). Keep the versioned document's existing `records` and add a mapped value in `refs`:

```yaml
version: 1
refs:
  NUMES_API_KEY: "YOUR_OWN_KEY_HERE_LOCALLY_ONLY"
# Preserve your existing records: … as well.
```

The local store holds textual secrets. Keep it outside public repositories and screenshots. Its saved reference **overrides** environment fallback; if you rotate the environment but leave an old saved credential, DSH will use the latter instead. Remove/replace the stored key via the GUI or careful documented edit.

### 8.5. Do you have to restart?

Official DSH documentation says model/profile changes apply **to the next request**, without restarting. HMR watches profiles; the credential provider watches its file.

If nothing appears:

1. Refresh the **same** GUI page process (F5), do not create a second DSH server.
2. Review DSH configuration diagnostics for invalid YAML or route errors.
3. If needed, fully close and restart Desktop in order to reload the profile and process environment.

## 9. Errors including `QUOTA`

Use the stable `error.metadata.error_type` and HTTP status from the underlying service, not a short DSH header alone. Follow the [official Numes error guide](https://numes.ai/docs/api-reference/errors).

| Error | Meaning and next action |
| --- | --- |
| `QUOTA` / `402 insufficient_credits` | In the tested incident it meant the route was **plain paid ID**, not free after Numes separated free-paid IDs. Change the **selected model** to a current `:free` entry. Balance/limits and concurrent spent holds can also cause 402. Adding credit does not change the endpoint type. |
| `429 rate_limited` | Honor `Retry-After`; without it use capped exponential backoff and jitter. Free request limits are distinct and current numeric quotas should be checked on the own key. |
| `429 provider_overloaded` | Matching endpoint or worker concurrency is full. Reduce concurrent requests; back off with jitter. |
| `503 provider_unavailable` | No eligible free endpoint, an unknown/disappeared ID, unsupported requested feature or unhealthy endpoint. A free request cannot silently take paid fallback. Refresh and choose another currently-listed entry. |
| `401 invalid_credentials` | Verify the key type and status: disabled/deleted/expired, or Management rather than inference. Generate a new inference key rather than retrying invalid one endlessly. |
| `403 verified_email_required` | Complete your own email verification in Numes profile. |
| Empty/truncated response | Increase output budget (reasoning counts); for short manual test use 1500+ and nonthinking `reasoning.effort=none` if accepted for the endpoint. No need to allocate huge outputs arbitrarily. |
| Missing configured models | Repeat discovery and save. Check YAML diagnostics when raw profile was edited. A previously listed `:free` entry may disappear. |

For interruptions after output arrives, account for the partial text and **completed tool effects** before retrying. A repeat is a separate generation, not a transaction rolled back.

For support, quote `X-Request-Id`, never the secret or private prompt.

## For short: correct command flow (verified approach)

```text
Install/open DSH
  → verify Numes email
  → Numes Keys → Create inference key
  → DSH Settings → Models → Add model provider → Custom model API
  → ID numes, API https://api.numes.ai/api/v1, protocol OpenAI Chat Completions
  → paste the key once
  → Fetch available models → choose IDs with :free → Update list → save
  → select model in composer → send PONG
```

## 10. Uninstall only Numes, preserving other DSH settings

### In the GUI

1. Settings → Models → Numes card → open the editor/delete action.
2. Confirm removal, and clear that route's stored credential if your editor offers this action.
3. **Deleting the DSH route does not automatically revoke the issued Numes key.** If no longer needed, delete/disable it at [Numes Keys](https://numes.ai/dashboard/keys) too. Existing running calls finish unless separately cancelled.

### Raw-config rollback

Restore the `.before-numes` backup made on your own actual profile or remove only `providers.numes` and the reference `refs.NUMES_API_KEY`, leaving other config and records untouched. Never replace the profile with a stranger's YAML wholesale.

## Is `numes run` needed here?

[Numes coding agents](https://numes.ai/docs/integrations/coding-agents) documents `numes run opencode`, `numes run pi` and OMP launchers, including creating/saving an inference key on first launch and reusing it thereafter.

That assists **OpenCode, Pi, OMP** not a DSH profile. For DSH, use its own Models form; do not install another agent merely to get Numes into it.

## Sources

- [DSH official run guide](https://github.com/deepseek-ai/deepseek-harness#run)
- [DSH official models provider guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)
- [Numes inference keys](https://numes.ai/docs/account/api-keys)
- [Numes free-model suffix and guarantee](https://numes.ai/docs/models#free-models)
- [Numes Quickstart](https://numes.ai/docs/quickstart)
- [Numes error reference](https://numes.ai/docs/api-reference/errors)
- [DSH credential settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials-local/README.md)

Snapshot checks from 17 November 2026 do not guarantee future availability, speed, quota, data retention, or fitness for production. The guide remains an independent starting point; check live IDs and actual charges for your own account.
