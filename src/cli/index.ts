#!/usr/bin/env bun

import { isGitRepo } from "../core/git";

const commands: Record<string, () => Promise<void>> = {
  status: () => import("./status").then((m) => m.default()),
  summary: () => import("./summary").then((m) => m.default()),
  diff: () => import("./diff").then((m) => m.default()),
  merge: () => import("./merge").then((m) => m.default()),
  discard: () => import("./discard").then((m) => m.default()),
  web: () => {
    const demo = process.argv.includes("--demo");
    return import("../web/server").then((m) => m.default({ demo }));
  },
  config: () => import("./config").then((m) => m.default()),
};

async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
wtr — Git Worktree Review Tool

Usage: wtr <command> [options]

Commands:
  status              List all worktrees with diff stats
  summary <name>      AI summary of worktree changes (via gh copilot)
  diff <name>         Show colorized diff for a worktree
  merge <name>        Merge worktree branch and clean up
  discard <name>      Remove worktree and delete branch
  web                 Start the web UI
  web --demo          Start the web UI with mock data
  config              View/set config (e.g. --port 3333)

Options:
  --base <branch>     Override base branch (default: main/master)
  --demo              Use mock data (with web command)
  --help, -h          Show this help
`);
    return;
  }

  const isDemo = command === "web" && process.argv.includes("--demo");
  if (!isDemo && !(await isGitRepo())) {
    console.error("Error: Not inside a git repository.");
    process.exit(1);
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "wtr --help" for usage.');
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
