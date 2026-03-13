import { describe, test, expect } from "bun:test";
import {
  isGitRepo,
  getBaseBranch,
  getWorktrees,
  parseFileDiffs,
  parseCommitLog,
  parseWorktreeList,
  parseDiffStat,
} from "../../src/core/git";

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

describe("parseFileDiffs", () => {
  test("parses numstat + name-status into FileDiff array", () => {
    const numstat = "52\t0\tsrc/middleware/auth.ts\n6\t1\tsrc/routes/index.ts\n";
    const nameStatus = "A\tsrc/middleware/auth.ts\nM\tsrc/routes/index.ts\n";
    const result = parseFileDiffs(numstat, nameStatus);
    expect(result).toEqual([
      { path: "src/middleware/auth.ts", status: "A", insertions: 52, deletions: 0 },
      { path: "src/routes/index.ts", status: "M", insertions: 6, deletions: 1 },
    ]);
  });

  test("handles renamed files (simple format)", () => {
    const numstat = "0\t0\told-name.ts => new-name.ts\n";
    const nameStatus = "R100\told-name.ts\tnew-name.ts\n";
    const result = parseFileDiffs(numstat, nameStatus);
    expect(result).toEqual([{ path: "new-name.ts", status: "R", insertions: 0, deletions: 0 }]);
  });

  test("handles renamed files (brace format)", () => {
    const numstat = "5\t2\tsrc/{old-name.ts => new-name.ts}\n";
    const nameStatus = "R095\tsrc/old-name.ts\tsrc/new-name.ts\n";
    const result = parseFileDiffs(numstat, nameStatus);
    expect(result).toEqual([{ path: "src/new-name.ts", status: "R", insertions: 5, deletions: 2 }]);
  });

  test("handles binary files (- for insertions/deletions)", () => {
    const numstat = "-\t-\timage.png\n";
    const nameStatus = "M\timage.png\n";
    const result = parseFileDiffs(numstat, nameStatus);
    expect(result).toEqual([{ path: "image.png", status: "M", insertions: 0, deletions: 0 }]);
  });

  test("returns empty array for empty input", () => {
    expect(parseFileDiffs("", "")).toEqual([]);
    expect(parseFileDiffs("\n", "\n")).toEqual([]);
  });
});

describe("parseCommitLog", () => {
  test("parses git log format into CommitInfo array", () => {
    const logOutput = [
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      "a1b2c3d",
      "Add auth middleware",
      "MayoLars",
      "2026-02-28 14:32:00 +0100",
      "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
      "e4f5a6b",
      "Add login route",
      "MayoLars",
      "2026-03-01 09:15:00 +0100",
    ].join("\n");
    const result = parseCommitLog(logOutput);
    expect(result).toEqual([
      {
        hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
        shortHash: "a1b2c3d",
        subject: "Add auth middleware",
        author: "MayoLars",
        date: "2026-02-28 14:32:00 +0100",
      },
      {
        hash: "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
        shortHash: "e4f5a6b",
        subject: "Add login route",
        author: "MayoLars",
        date: "2026-03-01 09:15:00 +0100",
      },
    ]);
  });

  test("returns empty array for empty input", () => {
    expect(parseCommitLog("")).toEqual([]);
    expect(parseCommitLog("  ")).toEqual([]);
  });

  test("ignores incomplete trailing entries", () => {
    const logOutput = [
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      "a1b2c3d",
      "Add auth middleware",
      "MayoLars",
      "2026-02-28 14:32:00 +0100",
      "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3",
      "e4f5a6b",
    ].join("\n");
    expect(parseCommitLog(logOutput)).toHaveLength(1);
  });
});

describe("parseWorktreeList", () => {
  test("parses porcelain worktree output", () => {
    const output = [
      "worktree /home/user/project",
      "HEAD abc1234567890",
      "branch refs/heads/main",
      "",
      "worktree /home/user/project-feature",
      "HEAD def4567890123",
      "branch refs/heads/feature/auth",
      "",
    ].join("\n");
    const result = parseWorktreeList(output);
    expect(result).toEqual([
      {
        path: "/home/user/project",
        branch: "main",
        name: "project",
        head: "abc1234567890",
        isBare: false,
        isMain: true,
      },
      {
        path: "/home/user/project-feature",
        branch: "feature/auth",
        name: "project-feature",
        head: "def4567890123",
        isBare: false,
        isMain: false,
      },
    ]);
  });

  test("returns empty array for empty input", () => {
    expect(parseWorktreeList("")).toEqual([]);
    expect(parseWorktreeList("  ")).toEqual([]);
    expect(parseWorktreeList("\n")).toEqual([]);
  });

  test("handles bare worktrees", () => {
    const output = "worktree /home/user/project\nHEAD abc123\nbare\n";
    const result = parseWorktreeList(output);
    expect(result[0].isBare).toBe(true);
    expect(result[0].branch).toBe("");
  });
});

describe("parseDiffStat", () => {
  test("parses full shortstat output", () => {
    expect(parseDiffStat(" 4 files changed, 127 insertions(+), 8 deletions(-)")).toEqual({
      filesChanged: 4,
      insertions: 127,
      deletions: 8,
    });
  });

  test("parses insertions-only output", () => {
    expect(parseDiffStat(" 1 file changed, 10 insertions(+)")).toEqual({
      filesChanged: 1,
      insertions: 10,
      deletions: 0,
    });
  });

  test("parses deletions-only output", () => {
    expect(parseDiffStat(" 2 files changed, 5 deletions(-)")).toEqual({
      filesChanged: 2,
      insertions: 0,
      deletions: 5,
    });
  });

  test("returns zeros for empty input", () => {
    expect(parseDiffStat("")).toEqual({ filesChanged: 0, insertions: 0, deletions: 0 });
  });
});
