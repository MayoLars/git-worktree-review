import { getWorktrees, getBaseBranch, getDiff } from "../core/git";
import { $ } from "bun";

export default async function summary() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wt-review summary <worktree-name>");
    process.exit(1);
  }

  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);

  if (!wt) {
    console.error(`Worktree '${name}' not found. Run 'wt-review status' to see available worktrees.`);
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

  const prompt = `Summarize the following git diff. Explain what changed and why it matters. Be concise.\n\n${diffText}`;
  const result = await $`gh copilot explain ${prompt}`.nothrow();

  if (result.exitCode !== 0) {
    console.error("Copilot summary failed. Showing git stats instead:\n");
    const diff = await getDiff(baseBranch, wt.branch);
    console.log(diff.stat);
  }
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
