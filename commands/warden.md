---
description: Warden usage guardrails — report, status, allow, setup
argument-hint: report | status | allow +50% | setup | off | on | pause
allowed-tools: Bash(node:*)
---

Run this command and show its output to the user exactly as printed, in a code block. Do not add commentary unless the output is an error.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/warden-cli.js" $ARGUMENTS`
