import { mergeWorktree } from "../core/git";

export default async function merge() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wt-review merge <worktree-name>");
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

async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk: string) => {
      data = chunk.trim();
      process.stdin.pause();
      resolve(data);
    });
  });
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
