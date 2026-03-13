import { getWorktrees, getBaseBranch, getDiff } from "../core/git";
import { getFlag } from "./utils";
import { $ } from "bun";

export default async function summary() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr summary <worktree-name>");
    process.exit(1);
  }

  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);

  if (!wt) {
    console.error(`Worktree '${name}' not found. Run 'wtr status' to see available worktrees.`);
    process.exit(1);
  }

  // Check if gh copilot is available
  const ghCheck = await $`gh copilot --help`.quiet().nothrow();
  if (ghCheck.exitCode !== 0) {
    console.log("Note: 'gh copilot' is not available. Showing git stats instead.\n");
    const diff = await getDiff(baseBranch, wt.branch);
    console.log(diff.stat);
    return;
  }

  // Get the diff and pipe to gh copilot
  const diffText = await $`git diff ${baseBranch}...${wt.branch}`.quiet().text();

  console.log(`Summarizing changes in '${wt.name}' (${wt.branch})...\n`);

  // Truncate diff to stay well within ARG_MAX (~2MB on Linux, ~256KB on macOS)
  const MAX_DIFF_SIZE = 128_000; // 128KB — safe on all platforms
  const truncated = diffText.length > MAX_DIFF_SIZE
    ? diffText.slice(0, MAX_DIFF_SIZE) + "\n\n[... diff truncated for size ...]"
    : diffText;

  const prompt = `Summarize the following git diff. Explain what changed and why it matters. Be concise.\n\n${truncated}`;
  const result = await $`gh copilot explain ${prompt}`.nothrow();

  if (result.exitCode !== 0) {
    console.error("Copilot summary failed. Showing git stats instead:\n");
    const diff = await getDiff(baseBranch, wt.branch);
    console.log(diff.stat);
  }
}
