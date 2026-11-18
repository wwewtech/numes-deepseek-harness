# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/), versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [1.2.0] — 2026-11-18

### Added

- **Free-model auto-discovery** — the `:free` list now refreshes from `GET /models` every 5 minutes (`NUMES_PROXY_DISCOVERY_MS`). A removed offer drops out of routing; a model that gains a `:free` entry joins automatically. Failures keep the last good list and never block requests.
- **`Retry-After` awareness** — `429 rate_limited` and `503 service_unavailable` hints are read and honoured: the proxy waits the larger of the platform's hint and its own backoff.
- **`GET /status`** — one-glance state: current chain, pinned/auto mode, the free guard, retry configuration, and every counter.
- **`provider.max_price {prompt: 0, completion: 0}`** on every upstream request as a second, platform-side free guard.
- `NUMES_PROXY_MIN_BACKOFF_MS` to floor `Retry-After`-driven waits.

### Changed

- `/v1/models` and `/health` report the live discovered chain instead of the hard-coded list.
- `NUMES_CHAIN` now pins your own order and makes discovery informational rather than silently ignored.

## [1.1.0] — 2026-11-17

### Added

- **Persistent retry rounds** — when every free model fails, the proxy waits and retries the whole chain: `5s → 10s → 15s → 30s → 1m → 2m → 5m`, then every 5 minutes forever. An exhausted free pool recovers without the caller doing anything.
- **Paid-model guard** — every candidate must end with `:free`, enforced on the configured chain and on per-request overrides, returning `400` before any traffic leaves the machine.
- **Smart abort** — `401`/`402`/`403` stop the rounds immediately: a rejected key cannot be fixed by waiting.
- `NUMES_PROXY_BACKOFF_MS` and `NUMES_PROXY_MAX_ROUNDS` controls.

### Changed

- Response headers now report `X-Numes-Free-Round` alongside the model and attempt count.

## [1.0.0] — 2026-11-17

### Added

- Local OpenAI-compatible failover proxy for the Numes `:free` catalogue (`tools/numes-free-failover.mjs`), zero dependencies, Node 18+.
- Failover across all free models, sticky to the last model that worked.
- Streaming pass-through with an idle watchdog; failover is impossible after the first byte, by design.
- `GET /health` and `GET /v1/models` for discovery and diagnostics.
- DSH configuration blocks for both the direct route (`configs/numes.patch.yml`) and the proxy route (`configs/numes-failover.patch.yml`).
- Bilingual setup guides: [docs/SETUP.ru.md](docs/SETUP.ru.md) and [docs/SETUP.md](docs/SETUP.md).
- Key resolution from `NUMES_API_KEY` or DSH's own `~/.dsh/.credentials.yaml`; the value is never logged.
