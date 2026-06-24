# Retro: Pending Retro Obligation Lost Across Session Boundary

**Date:** 2026-06-23  
**Type:** process failure  
**Status:** resolved

---

## What Happened

Issue #13 (P1) was filed on 2026-06-18. The bug skill's Step 4b instructs saving a project memory at filing time so the retro obligation survives a session boundary. The session summary for 2026-06-18 states the memory was created at `C:\Users\Miko\.claude\projects\C--ClaudeProjects-chat-app\memory\project_pending_retro.md`. It was not. When the fix session resumed on 2026-06-23, no memory existed, MEMORY.md had no entries, and no retro was written until the user explicitly asked after the PR was merged.

## Root Cause

Two independent failures compounded:

**1. The Write tool was never called (Step 4b silently failed)**  
The AI described saving the memory in conversation but did not execute the Write tool. The session compaction summary was generated from the conversation transcript — it recorded the *claim*, not the *action*. Nothing in the tooling verifies that a described write actually happened.

**2. No session-start check for pending obligations**  
Even if the memory had been saved, there was no process step at the start of the 2026-06-23 session to read project memory and surface pending items before starting new work. The AI went directly from the session summary into debugging without checking what was owed from the previous session.

Either failure alone would have been recoverable. Together they meant the retro obligation was invisible for the entire fix session.

## Why the Compaction Summary Can't Be Trusted for Tool Execution

The session summary is written from the conversation text — what was said, not what was done. An AI can write "I'll save this to memory" and the summary will record it as fact even if the Write tool call never happened. The only reliable verification is checking the filesystem directly.

## What We Can Improve

**Immediate fixes:**

1. **After any claimed memory write, verify the file exists before moving on.** The Write tool returns confirmation; if it wasn't called, there's no confirmation to check. Treat "I saved X" without a tool result as unverified.

2. **Add a session-start habit: check project memory and journal pending items before starting new work.** The CLAUDE.md mandatory skills table has no trigger for this. It should. A session that picks up mid-bug-fix should start by reading `memory/MEMORY.md` and the latest journal entry's Pending section.

3. **The bug skill Step 4b should be verified, not just described.** After writing the memory file, the skill should explicitly confirm the file exists (e.g., by reading it back) before continuing.

**Process change to propose:**

Add to the global CLAUDE.md mandatory skills table:

| Situation | Action |
|---|---|
| Starting any session on a project with recent bug fixes or open PRs | Read `MEMORY.md` and latest journal Pending section before starting new work |

## Action Items

| Item | Status |
|---|---|
| Write retro for issue #13 with full root cause | ✅ Done |
| Write retro for issue #12 | ✅ Done |
| Write this process retro | ✅ Done |
| Propose CLAUDE.md update to add session-start memory check | Pending — user decision |
