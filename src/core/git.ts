import { $ } from "bun";
import type { Worktree } from "./types";

export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    const result = await $`git rev-parse --is-inside-work-tree`
      .cwd(cwd ?? process.cwd())
      .quiet()
      .nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getBaseBranch(override?: string): Promise<string> {
  if (override) return override;

  // Check if 'main' exists
  const main = await $`git rev-parse --verify main`.quiet().nothrow();
  if (main.exitCode === 0) return "main";

  // Fallback to 'master'
  const master = await $`git rev-parse --verify master`.quiet().nothrow();
  if (master.exitCode === 0) return "master";

  throw new Error("Could not detect base branch. Use --base to specify.");
}

export async function getWorktrees(): Promise<Worktree[]> {
  const result = await $`git worktree list --porcelain`.quiet();
  const output = result.text();
  const blocks = output.trim().split("\n\n");
  const worktrees: Worktree[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.replace("worktree ", "") ?? "";
    const head = lines.find((l) => l.startsWith("HEAD "))?.replace("HEAD ", "") ?? "";
    const branchLine = lines.find((l) => l.startsWith("branch "));
    const branch = branchLine?.replace("branch refs/heads/", "") ?? "";
    const isBare = lines.some((l) => l === "bare");

    const name = path.split("/").pop() ?? path;

    worktrees.push({
      path,
      branch,
      name,
      head,
      isBare,
      isMain: worktrees.length === 0, // first entry is the main worktree
    });
  }

  return worktrees;
}
