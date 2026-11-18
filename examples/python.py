#!/usr/bin/env python3
"""Numes free models via Python + requests.

  NUMES_API_KEY=sk-... python examples/python.py        # direct
  python examples/python.py --proxy                    # via local proxy

The proxy route needs the proxy running:
  node tools/numes-free-failover.mjs
"""

import os
import sys
import time

import requests

DIRECT_BASE = "https://api.numes.ai/api/v1"
PROXY_BASE = "http://127.0.0.1:8787/v1"
FREE_MODEL = "moonshotai/kimi-k3.1-pro:free"

use_proxy = "--proxy" in sys.argv
base = PROXY_BASE if use_proxy else DIRECT_BASE
model = "numes-free-auto" if use_proxy else FREE_MODEL
headers = {"Content-Type": "application/json"}
if not use_proxy:
    key = os.environ.get("NUMES_API_KEY")
    if not key:
        sys.exit("Set NUMES_API_KEY or use --proxy")
    headers["Authorization"] = f"Bearer {key}"

payload = {
    "model": model,
    "max_tokens": 1500,
    "reasoning": {"effort": "none"},
    "messages": [{"role": "user", "content": "Reply with exactly one word: PONG"}],
}

# Free TTFT can reach ~60-100s; never drop below 30s.
timeout = 180
start = time.monotonic()
resp = requests.post(f"{base}/chat/completions", json=payload, headers=headers, timeout=timeout)
elapsed = time.monotonic() - start

print(f"HTTP {resp.status_code} in {elapsed:.1f}s")
for k, v in resp.headers.items():
    if k.lower().startswith(('x-numes-', 'x-request-', 'x-generation-')):
        print(f"  {k}: {v}")

if resp.status_code != 200:
    print(resp.text)
    sys.exit(1)

data = resp.json()
print(f"\nanswer : {data['choices'][0]['message']['content'].strip()}")
print(f"cost   : {data.get('usage', {}).get('cost', 'n/a')}")
