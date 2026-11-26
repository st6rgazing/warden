<div align="center">

# ⛨ Warden

**Stop runaway subagents before they eat your Claude Code limit.**

Hard budgets for every subagent. A status line badge with your real 5-hour and weekly usage. A report that shows where it all went.

`/plugin marketplace add st6rgazing/warden` · `/plugin install warden@warden` · `/warden setup`

</div>

---

## The problem

You start a task, spawn a few subagents, and go get coffee. You come back to a weekly limit at 60% and no idea which agent burned it.

- Background subagents have **no token, turn or time cap**. One loop can chew through millions of tokens.
- Writing "check the cost first" in CLAUDE.md doesn't help. **The model can ignore instructions.**
- When your limit drains, nothing tells you **where it went**.

Warden puts the limits in hooks, so they run whatever the model decides.

## What you get

```
[opus] ~/app  main ✓  ⛨ wk 41% · 5h 23%
```

**🛑 A budget for every subagent.** Each one gets 2% of your week (or $3 on API keys), 45 minutes and 250 tool calls. At 75% it's told to wrap up. At 100% its tools are blocked and it has to report what it found. **The work isn't thrown away.**

**🌀 Catches runaway patterns.** Subagents nested more than 2 deep, more than 4 running at once, or one subagent calling the same tool 8 times in 10 minutes.

**📉 Weekly guard.** A heads-up at 80% of your weekly limit. At 95%, it asks before starting new subagents. A warning when your 5-hour window is about to run out at the current pace.

**🧾 `/warden report`**, so you know where your usage went:

```
Warden · this weekly window (wk 41% used, resets Tue 03:30)
Source                       ≈% week  cost-wtd tokens    calls
main thread                    18.2%             6.1M      312
subagent:Explore               14.9%             5.0M      201   (3 runs, 1 stopped by Warden)
subagent:general-purpose        6.1%             2.0M       88

MCP servers (already counted above)
mcp:github                         —             0.4M

Stopped by Warden: 2 runaway agents, est. ≥9.0% of week saved
```

Add `--md` to save it, ready to attach to a bug report or support ticket.

## Install

```
/plugin marketplace add st6rgazing/warden
/plugin install warden@warden
/warden setup
```

`/warden setup` lets Warden read your real limit percentages from the status line. **Your current status line keeps working.** Warden adds its badge after it, and `/warden off` puts everything back exactly as it was. Warden works without setup too, using token counts.

Needs Node.js 18+. Works on macOS, Linux and Windows.

## Commands

| Command | What it does |
|---|---|
| `/warden report [--session\|--today\|--week] [--md]` | Where your usage went |
| `/warden status` | Running subagents and what they've used |
| `/warden allow +50%` | Let the last blocked subagent keep going |
| `/warden setup` · `/warden off` | Add or remove the status line badge |
| `/warden pause` · `/warden on` | Turn enforcement off or on |

## Design principles

- **Never lose work.** A stopped subagent still reports back.
- **Stay quiet.** No messages to the model unless a limit is crossed, and each warning appears once.
- **Never block you by accident.** Your main conversation gets a heads-up, never a block. If Warden itself breaks, it lets the call through.
- **Private.** No network, no telemetry. Data stays in `~/.claude/warden/` and is cleared after 30 days.
- **Cheap.** About 30 ms per hook call.

## Configuration

Optional. Put overrides in `~/.claude/warden/config.json` (all projects) or `.claude/warden.json` (one project).

```json
{
  "subagent": { "weekPct": 2, "minutes": 45, "toolCalls": 250, "usd": 3 },
  "spawn": { "maxDepth": 2, "maxConcurrent": 4 },
  "loop": { "warn": 5, "stop": 8, "windowMin": 10 },
  "weekly": { "warnPct": 80, "askPct": 95 },
  "session": { "usd": 20 },
  "mode": "auto"
}
```

`mode`: `auto` (percentages for Pro/Max/Team, dollars for API keys), `limits`, or `dollars`.

## Honest limits

- **Early release (0.1).** Tested with 81 unit tests, but not yet on many real setups. Please [open an issue](https://github.com/st6rgazing/warden/issues) if something looks off.
- Numbers are estimates from Claude Code's own usage figures, not your bill.
- A subagent's "% of week" is the weekly change while it ran, split by how many tokens each agent used.
- Warden blocks a subagent's next tool call. It can't stop a reply that's already being written.

## Contributing

```
npm test           # unit tests
npm run test:e2e   # end-to-end, needs a logged-in claude CLI
scripts/probe.sh   # logs real hook payloads
```

MIT licensed.
