# Retro: Railway MCP Authentication Expiry Caused Session Disruption

**Date:** 2026-07-06  
**Type:** incident  
**Status:** resolved

---

## What Went Right
- The root cause (expiring OAuth token vs. long-lived API token) was correctly identified
- Switching to a Railway personal API token in `.mcp.json` is a permanent fix — it won't expire like the CLI OAuth session
- The pattern of using `RAILWAY_TOKEN` env var in `.mcp.json` is now documented for this project

## What Went Wrong
- The Railway MCP server was started once with the CLI OAuth token. When that token expired (the expiry was July 7, 2026 — imminent when the issue surfaced), MCP calls returned "Unauthorized" with no clear error message about which token was stale.
- Multiple workarounds were attempted before the root cause was identified: re-running `railway login`, restarting the MCP server, etc. Each workaround failed because the underlying session token was still the stale one.
- The user had to explicitly say "stop doing workarounds, surface the failure" before the correct path (API token in `.mcp.json`) was taken. The instinct to try a quick fix instead of surfacing the failure caused wasted time.

## What We Can Improve
- When an authenticated service starts returning "Unauthorized" or similar errors, the first diagnostic should be "which credential is it using and when does it expire?" — not trying another API call variant
- MCP server authentication should use long-lived credentials (API tokens) rather than session-based OAuth tokens that expire
- The no-workarounds rule exists exactly for this scenario: surface failures clearly so the right fix can be applied the first time

## Action Items

| Item | Status |
|---|---|
| RAILWAY_TOKEN is now in .mcp.json — monitor for any future auth issues | Done |
| No further action needed — fix is in place | Done |
