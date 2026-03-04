import { describe, test, expect } from "bun:test";
import { getWorktrees, getBaseBranch, isGitRepo } from "../../src/core/git";

describe("isGitRepo", () => {
  test("returns true in a git repository", async () => {
    const result = await isGitRepo();
    expect(result).toBe(true);
  });

  test("returns false outside a git repository", async () => {
    const result = await isGitRepo("/tmp");
    expect(result).toBe(false);
  });
});

describe("getBaseBranch", () => {
  test("returns the default branch name", async () => {
    const branch = await getBaseBranch();
    expect(["main", "master"]).toContain(branch);
  });
});

describe("getWorktrees", () => {
  test("returns at least the main worktree", async () => {
    const worktrees = await getWorktrees();
    expect(worktrees.length).toBeGreaterThanOrEqual(1);
    const main = worktrees.find((wt) => wt.isMain);
    expect(main).toBeDefined();
  });
});
