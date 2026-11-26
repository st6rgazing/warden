# Warden — design

Date: 2026-11-25 · Status: draft, awaiting approval · Approach: hooks + status line wrapper (chosen)

## Intent

Claude Code users keep losing large parts of their usage to work they did not ask for and could not see: background subagents that run for an hour, subagents that spawn subagents, retry loops, and sessions that quietly eat a weekly limit by Tuesday. Prompt-level limits ("tell me the cost first") are advisory and get ignored. Warden is a Claude Code plugin that enforces limits in the harness layer (hooks), using the real usage numbers Claude Code already exposes, and tells the user afterwards exactly where their usage went.

## Who it is for

1. **Primary: Pro / Max / Team subscribers.** Their unit of pain is "% of my 5-hour and 7-day limit". Loudest group in Oct–Nov 2026 (limit-drain reports, Anthropic's Nov 10 admission and reset).
2. **Secondary: API-key / gateway users.** Their unit is dollars. Fewer people, bigger single losses (overnight runaway bills).
3. **Later, not v1:** team leads managing shared budgets.

Warden detects which world it is in: if the status line payload contains `rate_limits`, it works in % of limits; otherwise it works in dollars (`cost.total_cost_usd`) and tokens.

## Goals

- Stop a runaway subagent before it does real damage, without throwing away what it already found.
- Stop runaway shapes early: deep nesting, too many parallel agents, repeated identical tool calls.
- Warn before a session pushes the weekly limit past a danger line, using the real percentage.
- `/warden report`: a breakdown of usage by source (main thread, each subagent by type, tools, MCP servers, plugin/hook-injected context), plus cache health, exportable as Markdown for a bug report or support ticket.
- Work with zero configuration; sensible defaults per plan type.

## Non-goals (v1)

- Team / org budgets, dashboards, sync across machines.
- Exact billing reconciliation. Numbers are Claude Code's own estimates plus transcript token counts.
- Optimizing prompts or reducing token use by rewriting anything.
- claude.ai chat app (no hook surface there).

## Anti-goals (failure even if it "works")

- **Losing work.** Warden never kills an agent mid-flight as its first move. It tells it to stop and return what it has.
- **Costing noticeable tokens itself.** Hooks are silent unless a threshold is crossed. No per-call messages to the model.
- **Breaking Claude Code.** Any Warden error fails open (allow the call, log the error). A broken guard is better than a blocked user.
- **Nagging.** Each warning fires once per threshold per scope, not every tool call.
- **Phoning home.** No network, no telemetry. All data stays in `~/.claude/warden/`.
- **Replacing the user's status line.** Warden wraps it.

## Facts this design rests on (verified in docs, 2026-11-25)

- Status line scripts receive JSON with `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage`, `*.resets_at` (subscribers, after the first API response), `cost.total_cost_usd`, `context_window.*`, and cache stats. `rate_limits.spend_limit.*` behind a gateway.
- Hooks (`PreToolUse`, `PostToolUse`, …) fire inside subagents too, and the input carries `agent_id` and `agent_type`. All events carry `session_id` and `transcript_path`.
- `PreToolUse` can deny with `permissionDecision: "deny"` plus a reason the model sees; it can also `ask` the user.
- Events available: `SessionStart`, `SubagentStart`, `SubagentStop`, `Stop`, `PreCompact`, etc.
- Only one status line runs at a time.

## Architecture

```
statusLine (warden-status) ──writes──▶ ~/.claude/warden/state/<session>.json   (latest rate_limits, cost, cache)
         └── runs the user's original status line command, prints its output + a small Warden badge

hooks ──read state + tail transcripts──▶ ledger (~/.claude/warden/ledger/<date>.jsonl)
   SessionStart   snapshot baseline %, warn if weekly pace is dangerous
   PreToolUse     enforce: subagent budget, spawn limits, loop detector
   PostToolUse    account tokens for the agent that made the call (incremental transcript read)
   SubagentStart  open a budget record for agent_id, snapshot weekly %
   SubagentStop   close the record, write final cost to ledger
   Stop           session-level checks; one-line summary if a threshold was crossed

commands
   /warden report [--session|--today|--week] [--md]
   /warden status        current budgets and what's left
   /warden allow <+N>    raise the current block once (explicit user override)
   /warden setup         install the status line wrapper; /warden off|on
```

### Accounting

- **Tokens per agent:** PostToolUse reads the transcript incrementally (stored byte offset per file) and sums `usage` of new assistant messages: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, attributed to the agent in whose transcript they appear.
- **"Cost-weighted tokens"** for budgets: `output + input + cache_creation` at full weight, `cache_read` at 0.1. This tracks real usage far better than raw totals (cache reads dominate raw counts).
- **% of week per subagent:** the weekly % delta during the subagent's lifetime, split among agents active in that window in proportion to their cost-weighted tokens. Labeled "≈" in reports.
- **Sources:** main thread, subagent (by `agent_type`, with `agent_id`), tool name, MCP server (from `mcp__<server>__` names), and injected context (hook `additionalContext`, SessionStart output, skill/plugin loads where detectable in the transcript).

### Enforcement ladder (per scope)

| Level | Trigger (default) | Action |
|---|---|---|
| Warn | 75% of budget | Once: `additionalContext` to that agent: "Warden: ~25% of your budget left. Start wrapping up." |
| Stop | 100% | Deny every further tool call from that agent with: "Warden: budget reached. Do not call more tools. Reply now with a summary of what you found and what's left undone." The final reply still reaches the parent, so work isn't lost. |
| Hard stop | 5 denied calls after Stop | `continue: false` for that agent. Logged. |
| Override | user runs `/warden allow +50%` | Raises that scope once; logged. |

### Default limits (my calls; all configurable)

Subscribers:
- Per subagent: 2% of the weekly limit (≈), or 1.5M cost-weighted tokens if % is unavailable; 45 min wall time; 250 tool calls.
- Nesting: max depth 2 (a subagent may spawn one more level). Max 4 concurrent subagents. Enforced on PreToolUse of the agent-spawning tool. Over the limit → deny with an explanation.
- Loop detector: same tool + same input hash 5 times within 10 min in one agent → warn; 8 → stop.
- Weekly guard: at session start and before each spawn, if `seven_day` ≥ 80% → one warning with the reset time; ≥ 95% → spawning a subagent becomes `ask` (user confirms).
- Pace warning: if the current 5-hour window is projected to run out in under 30 minutes at the session's current rate, warn once.

API / dollar mode:
- Per subagent $3; per session $20 (warn at 75%, ask at 100%); same nesting and loop rules.

### Status line wrapper

`/warden setup` reads the user's current `statusLine` setting, saves it, and points `statusLine` at `warden-status`, which (1) writes the payload snapshot to state, (2) runs the saved original command with the same stdin and prints its output, (3) appends a short badge such as `⛨ wk 41% · 5h 23%`, or `⛨ $4.10` in dollar mode. `/warden off` restores the original exactly. Without setup, Warden still works in token/dollar mode and says once that `/warden setup` enables real limit percentages.

### Report

`/warden report` prints a compact table; `--md` writes `warden-report-<date>.md`:

```
Warden · this week (wk 41% used, resets Tue 03:30)
Source                 ≈% week   cost-wtd tokens   calls
main thread              18.2%        6.1M          312
subagent:Explore         14.9%        5.0M          201   (3 runs, 1 stopped by Warden)
subagent:general-purp.    6.1%        2.0M           88
mcp:github                —           0.4M           40
hook/skill context        1.1%        0.3M            —
Cache hit ratio 71% (low on 2 sessions: see --session)
Stopped by Warden: 2 runaway agents, est. 9% of week saved
```

"Saved" is estimated from the agent's burn rate at the moment it was stopped × its remaining median runtime for that agent type, and always labeled as an estimate.

### Configuration

`~/.claude/warden/config.json` (user) merged with `.claude/warden.json` (project). Keys mirror the defaults above, plus `enabled`, `mode: auto|limits|dollars`, `quiet`. Invalid config → defaults + one warning.

## Constraints

- Hooks must be fast: target < 50 ms p95 per call. Incremental transcript reads only; state file reads are tiny.
- Cross-platform: macOS, Linux, Windows.
- No dependencies to install beyond the plugin itself.
- Concurrency: several hooks and sessions may write at once. The ledger is append-only JSONL; state files are written atomically (write temp + rename).

## Calls I made (check these)

- **Runtime: Node.js, zero npm dependencies.** Bash + jq doesn't run on stock Windows and Python isn't guaranteed. Builder must confirm Node is reliably available to plugin hooks with the native installer; if not, fall back to shipping a single prebuilt binary per platform.
- Subscribers first, dollar mode second, team budgets out.
- Stop = deny tools + "report back now", not kill.
- Cost-weighted tokens with cache reads at 0.1.
- The default numbers above.

## Left to the builder (verify, then decide)

- Where subagent transcripts live and whether `SubagentStart`/`SubagentStop` give their path; if not, locate them by `agent_id` under the session directory.
- Whether `continue: false` from a hook inside a subagent ends only that subagent; if it ends the whole session, replace "hard stop" with continued denial.
- The exact tool name used to spawn subagents in current Claude Code (`Agent`/`Task`), matched by both.
- Whether a plugin can set `statusLine` directly; if not, `/warden setup` edits `~/.claude/settings.json` with a backup.
- How `additionalContext` is delivered to a subagent from PostToolUse.
- Test plan: unit tests on accounting and ladder logic using recorded transcript fixtures; an integration test that spawns a looping subagent in a scratch project and checks it gets stopped and its partial result reaches the parent.
