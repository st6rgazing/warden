# Warden

Usage guardrails for Claude Code. Warden stops runaway subagents before they eat your 5-hour or weekly limit (or your API bill), and tells you where your usage went.

Instructions in CLAUDE.md are suggestions the model can ignore. Warden's limits run in hooks, so the model can't talk its way past them.

## What it does

- **Per-subagent budget.** Each subagent gets 2% of your weekly limit (or $3 on API keys), 45 minutes and 250 tool calls. At 75% it's told to wrap up. At 100% its tool calls are refused and it's told to report what it found, so the work still reaches your main conversation.
- **Runaway shapes.** Blocks subagents nested more than 2 deep, more than 4 at once, and the same tool call repeated 8 times in 10 minutes (warns at 5).
- **Weekly guard.** Warns at 80% of your weekly limit; at 95% it asks before starting new subagents. Warns if your 5-hour window will run out within 30 minutes at the current pace.
- **Report.** `/warden report` shows usage by main thread, subagent type and MCP server. `--md` saves it for a bug report or support ticket.

## Install

```
/plugin marketplace add st6rgazing/warden
/plugin install warden@warden
/warden setup
```

`/warden setup` adds Warden's status line so it can read your real 5-hour and weekly percentages. Your existing status line keeps working; Warden adds a small badge after it (`⛨ wk 41% · 5h 23%`). Without setup, Warden still works using token counts and dollar estimates.

Needs Node.js 18 or newer.

## Commands

| Command | What it does |
|---|---|
| `/warden report [--session\|--today\|--week] [--md]` | Where your usage went (default: last 7 days) |
| `/warden status` | Running subagents and what they've used |
| `/warden allow +50%` | Raise the last blocked subagent's budget once |
| `/warden setup` / `/warden off` | Install / remove the status line wrapper |
| `/warden pause` / `/warden on` | Turn enforcement off / on |

## Configuration

`~/.claude/warden/config.json` (all projects) and `.claude/warden.json` (one project, wins). Any key you leave out uses the default.

```json
{
  "mode": "auto",
  "subagent": { "weekPct": 2, "tokens": 1500000, "minutes": 45, "toolCalls": 250, "usd": 3 },
  "session": { "usd": 20 },
  "spawn": { "maxDepth": 2, "maxConcurrent": 4 },
  "loop": { "warn": 5, "stop": 8, "windowMin": 10 },
  "weekly": { "warnPct": 80, "askPct": 95 },
  "pace": { "warnMin": 30 },
  "quiet": false
}
```

`mode` is `auto` (limits for Pro/Max/Team, dollars otherwise), `limits` or `dollars`.

## Privacy

Warden never touches the network. Everything stays in `~/.claude/warden/`: session records, a daily usage ledger, and an error log.

## Limits

- Numbers are estimates built from Claude Code's own usage figures. They won't match your bill exactly.
- "% of week" per subagent is the weekly change while it ran, split by token share. Treat it as approximate.
- Warden can block a subagent's next tool call, not stop a reply it's already writing.
- If Warden itself fails, it lets the call through and writes to `~/.claude/warden/errors.log`.

## Development

```
npm test          # unit tests
npm run test:e2e  # needs a logged-in claude CLI
scripts/probe.sh  # logs real hook payloads to check docs/harness-facts.md
```

MIT licensed.
