#!/usr/bin/env bash
# Run on your machine: logs every hook payload while one subagent runs.
# Output: /tmp/warden-probe.jsonl (send it back to fill docs/harness-facts.md)
set -e
D=$(mktemp -d); mkdir -p "$D/.claude"
LOG='cat >> /tmp/warden-probe.jsonl; echo >> /tmp/warden-probe.jsonl'
H="{\"hooks\":[{\"type\":\"command\",\"command\":\"$LOG\"}]}"
cat > "$D/.claude/settings.json" <<J
{"hooks":{"PreToolUse":[{"matcher":"*",${H:1}],"PostToolUse":[{"matcher":"*",${H:1}],
"SubagentStart":[$H],"SubagentStop":[$H],"SessionStart":[$H]}}
J
rm -f /tmp/warden-probe.jsonl
cd "$D" && claude -p "Spawn one Explore subagent that runs ls once, then say done." --allowedTools "Bash(ls)" Agent Task
echo "Wrote /tmp/warden-probe.jsonl"
