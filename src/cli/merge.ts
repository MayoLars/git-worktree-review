import { mergeWorktree, getWorktrees, getBaseBranch } from "../core/git";
import { getFlag, readLine } from "./utils";

export default async function merge() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr merge <worktree-name>");
    process.exit(1);
  }

  const baseBranch = getFlag("--base");
  const base = await getBaseBranch(baseBranch);
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) {
    console.error(`Error: Worktree '${name}' not found.`);
    process.exit(1);
  }

  // Show commands
  console.log(`\nThis will run:`);
  console.log(`  \x1b[2m1.\x1b[0m git merge ${wt.branch} --no-edit`);
  console.log(`  \x1b[2m2.\x1b[0m git worktree remove ${wt.path}`);
  console.log(`  \x1b[2m3.\x1b[0m git branch -d ${wt.branch}`);
  console.log();

  process.stdout.write(`Merge worktree '${name}' into ${base}? (y/N) `);
  const answer = await readLine();
  if (answer.toLowerCase() !== "y") {
    console.log("Cancelled.");
    return;
  }

  const result = await mergeWorktree(name, baseBranch);
  if (result.success) {
    console.log(`\x1b[32m${result.message}\x1b[0m`);
  } else {
    console.error(`\x1b[31m${result.message}\x1b[0m`);
    process.exit(1);
  }
}