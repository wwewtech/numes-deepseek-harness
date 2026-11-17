# Contribution / security policy

Any changes to the guide must preserve proportional user value and honesty.

## What not to add

- Live API keys, mock credentials that look real, session transcripts containing private user information, or copied proprietary tokens/login payloads.
- Scripts that create Numes accounts, solve CAPTCHAs, harvest credits or share keys, bypass quotas/rate limits, or use someone else's credentials.
- Instructions assuming the free endpoints are guaranteed. Re-check prices and tool capabilities on the actual key's account; version/point-in-time observations must be dated.
- Any installer that overwrites `cordis.patch.yml`, silently changes the user's default model, or invokes a package manager without explaining what runs.

## If you update setup details

Explain what you tested (DSH release and OS, Numes model/endpoints, use of tools/streaming, test time). A failing endpoint must not be marked as working. No photographs/screenshots exposing secrets or unrelated personal tabs.

Open issues with error type, Numes `X-Request-Id`, and minimal request shape. **Never include your key, private prompts, full account data, or unredacted logs.** Debug gateways from the official docs first.

## Scope

Documentation and configuration snippets only. Not official software/support from Numes or DeepSeek. Windows users primarily benefit from this edition; newly tested GUI paths on other systems are welcome.
