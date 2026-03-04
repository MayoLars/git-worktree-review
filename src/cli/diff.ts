import { getWorktrees, getBaseBranch } from "../core/git";
import { $ } from "bun";

export default async function diff() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr diff <worktree-name>");
    process.exit(1);
  }

  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);

  if (!wt) {
    console.error(`Worktree '${name}' not found. Run 'wtr status' to see available worktrees.`);
    process.exit(1);
  }

  // Use git diff with color output directly to terminal
  const result = await $`git diff ${baseBranch}...${wt.branch} --color=always`
    .quiet()
    .nothrow();

  const output = result.text();
  if (!output.trim()) {
    console.log(`No differences between '${baseBranch}' and '${wt.branch}'.`);
    return;
  }

  process.stdout.write(output);
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
