import { mergeWorktree } from "../core/git";
import { getFlag, readLine } from "./utils";

export default async function merge() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wtr merge <worktree-name>");
    process.exit(1);
  }

  const baseBranch = getFlag("--base");

  // Confirm
  process.stdout.write(`Merge worktree '${name}' into current branch? (y/N) `);
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