import { $ } from "bun";
import { createWorktree, getWorktreesDir } from "../core/git";

export default async function create() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr create <branch-name>");
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9._\-/]+$/.test(name)) {
    console.error("Error: Invalid branch name.");
    process.exit(1);
  }

  const dir = await getWorktreesDir();
  const worktreePath = `${dir}/${name}`;

  // Check if branch exists
  const branchCheck = await $`git rev-parse --verify ${name}`.quiet().nothrow();
  const branchExists = branchCheck.exitCode === 0;

  console.log(`\nThis will run:`);
  if (branchExists) {
    console.log(`  \x1b[2m1.\x1b[0m git worktree add ${worktreePath} ${name}`);
  } else {
    console.log(`  \x1b[2m1.\x1b[0m git worktree add -b ${name} ${worktreePath}`);
  }
  console.log();

  const result = await createWorktree(name);
  if (!result.success) {
    console.error(`Error: ${result.message}`);
    process.exit(1);
  }
  console.log(`\x1b[32m${result.message}\x1b[0m`);
}
