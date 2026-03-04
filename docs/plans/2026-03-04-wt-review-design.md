# wtr — Git Worktree Review Tool

## Purpose

CLI + web tool for reviewing code changes made by LLMs in git worktrees. Provides AI-powered summaries, visual diffs, and merge/discard actions.

## Architecture

Unified TypeScript/Bun tool with two interfaces sharing a common core.

```
wtr/
├── src/
│   ├── cli/           # CLI entry point + commands
│   │   ├── index.ts   # Command router
│   │   ├── status.ts  # List worktrees + diff stats
│   │   ├── summary.ts # AI summary via gh copilot
│   │   ├── merge.ts   # Merge worktree branch
│   │   └── discard.ts # Remove worktree + branch
│   ├── core/          # Shared git logic
│   │   ├── git.ts     # Git operations
│   │   └── types.ts   # Shared types
│   └── web/           # Web UI
│       ├── server.ts  # Bun HTTP server
│       └── public/    # Static HTML/JS/CSS
│           └── index.html
├── package.json
└── bunfig.toml
```

Key decisions:
- No frontend framework — vanilla HTML/JS/CSS, dependency-light
- `core/git.ts` is single source of truth for git operations
- Globally installable via `bun link`

## CLI Commands

| Command | Description |
|---------|-------------|
| `wtr status` | List all worktrees with branch, diff stats, status |
| `wtr summary <name>` | AI summary via `gh copilot explain` |
| `wtr diff <name>` | Colorized terminal diff for a worktree |
| `wtr merge <name>` | Merge worktree branch, clean up worktree |
| `wtr discard <name>` | Remove worktree + optionally delete branch |
| `wtr web` | Start web UI on localhost |

`<name>` = worktree name. Auto-discovered via `git worktree list`.

## Web UI

Served by `wtr web` on `localhost:3000`.

Layout:
- Left sidebar: worktree list
- Main area: summary, changed files, inline diffs with syntax highlighting
- Bottom: merge/discard action buttons with confirmation
- Dark theme by default (respects system preference)
- Syntax highlighting via highlight.js

API endpoints:
- `GET /api/worktrees` — list all worktrees
- `GET /api/worktree/:name/diff` — full diff for a worktree
- `GET /api/worktree/:name/summary` — AI summary
- `POST /api/worktree/:name/merge` — merge and clean up
- `POST /api/worktree/:name/discard` — remove worktree

## Data Flow

1. `git worktree list --porcelain` to discover worktrees
2. `git diff main...<branch>` and `--stat` for changes
3. Summary: pipe diff to `gh copilot explain`
4. Merge: `git merge <branch>`, then `git worktree remove`, optionally `git branch -d`
5. Discard: `git worktree remove` + `git branch -D`

## Error Handling

- Not in git repo → clear error message
- `gh copilot` unavailable → skip AI summary, show git stats with note
- Merge conflicts → abort, show conflicts, instruct manual resolution
- Missing worktree → error with `wtr status` hint

## Base Branch Detection

- Defaults to `main`, falls back to `master`
- Overridable via `--base <branch>` flag
