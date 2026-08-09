# Example Hooks — .claude/settings.json

Hooks are guaranteed enforcement. "Please do X" → deterministic action.

---

## Minimal (recommended starting point)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "if echo \"$CLAUDE_FILE_PATHS\" | grep -qE '\\.(ts|tsx)$'; then npx tsc --noEmit --skipLibCheck 2>&1 | head -20 || echo '⚠️ TS errors above'; fi"
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "npm run lint --silent 2>&1 && npm run typecheck --silent 2>&1 && echo '✅ Clean' || echo '❌ Errors — fix before committing'"
        }]
      }
    ]
  }
}
```

---

## Full (with session context injection)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "echo \"Branch: $(git branch --show-current)\" && echo \"Status: $(git status --short | head -10)\""
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "if echo \"$CLAUDE_FILE_PATHS\" | grep -qE '\\.(ts|tsx)$'; then npx tsc --noEmit --skipLibCheck 2>&1 | head -20 || echo '⚠️ TS errors'; fi"
        }]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "echo '⚠️ Bash tool failed — check command syntax or permissions'"
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "npm run lint --silent 2>&1 && npm run typecheck --silent 2>&1 && echo '✅ Clean — safe to commit' || echo '❌ Fix errors before committing'"
        }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "echo 'Context compacting — key files: src/lib/types/, src/app/api/, CLAUDE.md'"
        }]
      }
    ]
  }
}
```

---

## Block dangerous commands (PreToolUse)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'rm -rf|drop table|DELETE FROM|--no-verify|force.*push'; then echo 'Blocked: dangerous command' >&2; exit 2; fi"
        }]
      }
    ]
  }
}
```

Exit code 2 = block the tool call and show the stderr message to Claude.

---

## Notes

- `PostToolUse` on every edit = context bloat. Run expensive checks on `Stop` instead.
- `CLAUDE_FILE_PATHS` — space-separated list of files touched by the tool
- `CLAUDE_TOOL_INPUT` — JSON string of the tool's input
- Exit 0 = allow, Exit 2 = block (reason in stderr)
