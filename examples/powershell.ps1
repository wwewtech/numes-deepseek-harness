#!/usr/bin/env pwsh
# Talking to Numes free models from PowerShell (Windows-native, no curl.exe).
#
#   ./examples/powershell.ps1            # through the local proxy
#   ./examples/powershell.ps1 -Direct    # straight at Numes (needs $env:NUMES_API_KEY)
#
# The proxy must be running for the default route:
#   node tools/numes-free-failover.mjs

[CmdletBinding()]
param(
    [switch]$Direct,
    [switch]$Stream
)

$ErrorActionPreference = 'Stop'

$ProxyBase  = 'http://127.0.0.1:8787/v1'
$DirectBase = 'https://api.numes.ai/api/v1'
# A free id MUST end with ':free'; without it you are on the paid route.
$FreeModel  = 'moonshotai/kimi-k3.1-pro:free'

if ($Direct) {
    if (-not $env:NUMES_API_KEY) { throw 'NUMES_API_KEY is not set' }
    $base  = $DirectBase
    $model = $FreeModel
    $headers = @{
        'Authorization' = "Bearer $($env:NUMES_API_KEY)"
        'Content-Type'  = 'application/json'
    }
}
else {
    # The proxy holds the real key; the client sends a placeholder.
    $base  = $ProxyBase
    $model = 'numes-free-auto'
    $headers = @{ 'Content-Type' = 'application/json' }
}

$body = @{
    model       = $model
    max_tokens  = 1500
    reasoning   = @{ effort = 'none' }
    stream      = [bool]$Stream
    messages    = @(@{ role = 'user'; content = 'Reply with exactly one word: PONG' })
} | ConvertTo-Json -Depth 5

# Free TTFT can reach ~60-100s on harder prompts; the default 100s is not enough.
$response = Invoke-WebRequest -Uri "$base/chat/completions" -Method Post `
    -Headers $headers -Body $body -TimeoutSec 630 -UseBasicParsing

if ($response.Headers['X-Numes-Free-Model']) {
    Write-Host "served by : $($response.Headers['X-Numes-Free-Model'])"
    Write-Host "attempts  : $($response.Headers['X-Numes-Free-Attempts'])"
    Write-Host "round     : $($response.Headers['X-Numes-Free-Round'])"
}

$json = $response.Content | ConvertFrom-Json
Write-Host "answer    : $($json.choices[0].message.content.Trim())"
Write-Host "cost      : $($json.usage.cost)"
