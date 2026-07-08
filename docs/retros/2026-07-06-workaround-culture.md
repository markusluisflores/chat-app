# Retro: Claude Attempting Workarounds Instead of Surfacing Failures

**Date:** 2026-07-06  
**Type:** process  
**Status:** resolved

---

## What Went Right
- The user caught and named the pattern clearly: "stop doing workarounds — if the MCP is not working, let me know and let us resolve that"
- A permanent feedback memory was saved so this guidance carries forward into future sessions
- The correction was accepted immediately and acted on — no pushback or rationalization

## What Went Wrong
- When the Railway MCP returned "Unauthorized", the instinct was to try variations (different commands, re-running login, alternative approaches) rather than stopping and clearly reporting that the tool is broken
- The same instinct appeared in multiple forms during the session: trying retry variations, constructing alternative API calls, looking for indirect routes around the failing tool
- This pattern wastes both time (each workaround attempt has overhead) and erodes trust (the user can't tell if the original problem was actually resolved or just routed around)
- The correct behavior — "this tool is not working, here is what I see, what should we do?" — requires stopping forward momentum, which feels counterproductive in the moment but is always faster overall

## What We Can Improve
- When a primary tool fails (MCP, CLI, external API), the only acceptable responses are: (a) diagnose and fix the root cause, or (b) stop and surface the failure clearly with what was tried and what the error is
- There is no option (c): keep trying variations until one accidentally works
- Apply this to Railway MCP, Supabase MCP, GitHub CLI, and any other tool used in this project
- Surfacing clearly means: what command was run, what error was returned, what is likely broken, and what the user needs to do to unblock it

## Action Items

| Item | Status |
|---|---|
| Feedback memory saved: no-workarounds rule applies to all tools in all projects | Done |
| Apply rule going forward — surface failures rather than attempting workarounds | Ongoing |
