import { getWorktrees, getBaseBranch, getDiffStat } from "../core/git";

export default async function status() {
  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();

  if (worktrees.length <= 1) {
    console.log("No additional worktrees found.");
    console.log("Main worktree is on branch:", worktrees[0]?.branch ?? "unknown");
    return;
  }

  console.log(`\nWorktrees (base: ${baseBranch})\n`);
  console.log(
    padRight("Name", 20) +
    padRight("Branch", 30) +
    padRight("Files", 8) +
    padRight("  +", 8) +
    padRight("  -", 8)
  );
  console.log("─".repeat(74));

  for (const wt of worktrees) {
    if (wt.isMain) continue;

    const stat = await getDiffStat(baseBranch, wt.branch);
    const filesStr = stat.filesChanged.toString();
    const insStr = `+${stat.insertions}`;
    const delStr = `-${stat.deletions}`;

    console.log(
      padRight(wt.name, 20) +
      padRight(wt.branch, 30) +
      padRight(filesStr, 8) +
      `\x1b[32m${padRight(insStr, 8)}\x1b[0m` +
      `\x1b[31m${padRight(delStr, 8)}\x1b[0m`
    );
  }
  console.log();
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
