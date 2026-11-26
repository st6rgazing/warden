# Harness facts (Task 0)

Live probe could not run in the build environment (no Claude Code login). Run `scripts/probe.sh` on a real machine to confirm. Until then Warden is written to tolerate every open answer:

| Question | Assumption in code | Safe if wrong because |
|---|---|---|
| Subagent transcript path | Use `agent_transcript_path` if present; else search `<dir of transcript_path>/<session_id>/subagents/agent-<agent_id>.jsonl`; else count only tool calls and time | Budgets still enforced on calls and minutes |
| Spawn tool name | Match `Agent` and `Task` | Both covered |
| `continue:false` inside subagent | Not used. "Hard stop" = keep denying every tool call | Denial can't end the parent session |
| `additionalContext` to subagent | Sent on PostToolUse; Stop-level deny reason carries the same text | Deny reason always reaches the model |
| Node for plugin hooks | Hooks run `node`; if missing, hook fails and Claude Code continues (fail open) | No blocking of the user |

Ruling: proceed on these assumptions — the probe needs a logged-in session that this environment doesn't have — cost if wrong: per-agent token counts may read zero until the path rule is fixed; call/minute limits still work.
