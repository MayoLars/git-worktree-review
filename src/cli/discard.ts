import { discardWorktree } from "../core/git";
import { readLine } from "./utils";

export default async function discard() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr discard <worktree-name>");
    process.exit(1);
  }

  const keepBranch = process.argv.includes("--keep-branch");

  // Confirm
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