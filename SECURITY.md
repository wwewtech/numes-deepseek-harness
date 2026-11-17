# Security

This repository intentionally contains no user API keys or secrets. It only shows a credential **reference**: `apiKeyEnv: NUMES_API_KEY`.

To report an accidental secret in this repo, **revoke that key immediately** at Numes [Keys](https://numes.ai/dashboard/keys). Do not post its value publicly. Open a new GitHub private vulnerability report or contact the repository maintainer, if enabled. Git history alone cannot reliably undo a leaked credential.

## Secrets and PII

- Use DSH Settings → Models or your local secret store; raw keys do not belong in `cordis.patch.yml`, shell scripts, screenshots or issues. DSH resolves the named env reference per request.
- Treat private prompts and logs as sensitive; Numes routing and provider data policies apply.
- Do not paste key-producing URLs, API recipient credentials, or personal access tokens into issue reports.

## Trusting endpoints

Numes is a marketplace. Its provider may handle your prompts. Consult [their data policies](https://numes.ai/docs/privacy/provider-data-policies). Read routing rules and price metadata before passing sensitive instructions, company code or production credentials. Free zero-token-price endpoints are not a privacy guarantee.
