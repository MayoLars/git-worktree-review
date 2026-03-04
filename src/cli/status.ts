import { getWorktrees, getBaseBranch, getDiffStat, getCommitLog } from "../core/git";
import type { CommitInfo } from "../core/git";

export default async function status() {
  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();

  if (worktrees.length <= 1) {
    console.log("No additional worktrees found.");
    console.log("Main worktree is on branch:", worktrees[0]?.branch ?? "unknown");
    return;
  }

  // Collect data first to calculate column widths
  const rows: { name: string; branch: string; files: string; ins: string; del: string; commits: CommitInfo[] }[] = [];
  for (const wt of worktrees) {
    if (wt.isMain) continue;
    const [stat, commits] = await Promise.all([
      getDiffStat(baseBranch, wt.branch),
      getCommitLog(baseBranch, wt.branch),
    ]);
    rows.push({
      name: wt.name,
      branch: wt.branch,
      files: stat.filesChanged.toString(),
      ins: `+${stat.insertions}`,
      del: `-${stat.deletions}`,
      commits,
    });
  }

  const nameCol = Math.max(6, ...rows.map((r) => r.name.length)) + 2;
  const branchCol = Math.max(8, ...rows.map((r) => r.branch.length)) + 2;
  const totalWidth = nameCol + branchCol + 24;

  console.log(`\nWorktrees (base: ${baseBranch})\n`);
  console.log(
    padRight("Name", nameCol) +
    padRight("Branch", branchCol) +
    padRight("Files", 8) +
    padRight("  +", 8) +
    padRight("  -", 8)
  );
  console.log("─".repeat(totalWidth));

  for (const row of rows) {
    console.log(
      padRight(row.name, nameCol) +
      padRight(row.branch, branchCol) +
      padRight(row.files, 8) +
      `\x1b[32m${padRight(row.ins, 8)}\x1b[0m` +
      `\x1b[31m${padRight(row.del, 8)}\x1b[0m`
    );

    if (row.commits.length > 0) {
      for (const c of row.commits) {
        console.log(
          `  \x1b[33m${c.shortHash}\x1b[0m ${c.subject} \x1b[2m(${c.author})\x1b[0m`
        );
      }
      console.log();
    }
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
