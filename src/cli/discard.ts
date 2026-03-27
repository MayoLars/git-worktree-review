import { discardWorktree, getWorktrees } from "../core/git";
import { readLine } from "./utils";

export default async function discard() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr discard <worktree-name>");
    process.exit(1);
  }

  const keepBranch = process.argv.includes("--keep-branch");

  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) {
    console.error(`Error: Worktree '${name}' not found.`);
    process.exit(1);
  }

  // Show commands
  console.log(`\nThis will run:`);
  console.log(`  \x1b[2m1.\x1b[0m git worktree remove ${wt.path} --force`);
  if (!keepBranch) {
    console.log(`  \x1b[2m2.\x1b[0m git branch -D ${wt.branch}`);
  }
  console.log();

  process.stdout.write(
    `Discard worktree '${name}'${keepBranch ? "" : " and delete its branch"}? (y/N) `
  );
  const answer = await readLine();
  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled.");
    return;
  }

  const result = await discardWorktree(name, !keepBranch);
  if (result.success) {
    console.log(`\x1b[32m${result.message}\x1b[0m`);
  } else {
    console.error(`\x1b[31m${result.message}\x1b[0m`);
    process.exit(1);
  }
}