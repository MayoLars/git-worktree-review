import { $ } from "bun";
import type { Worktree, DiffStat, FileDiff, DiffResult } from "./types";

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
  if (override) {
    // Validate branch name to prevent injection
    if (!/^[a-zA-Z0-9._\-/]+$/.test(override)) {
      throw new Error("Invalid branch name.");
    }
    return override;
  }

  // Check if 'main' exists
  const main = await $`git rev-parse --verify main`.quiet().nothrow();
  if (main.exitCode === 0) return "main";

  // Fallback to 'master'
  const master = await $`git rev-parse --verify master`.quiet().nothrow();
  if (master.exitCode === 0) return "master";

  throw new Error("Could not detect base branch. Use --base to specify.");
}

export function parseWorktreeList(output: string): Worktree[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const blocks = trimmed.split("\n\n");
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

export async function getWorktrees(): Promise<Worktree[]> {
  const result = await $`git worktree list --porcelain`.quiet();
  return parseWorktreeList(result.text());
}

export function parseDiffStat(text: string): DiffStat {
  const trimmed = text.trim();
  if (!trimmed) return { filesChanged: 0, insertions: 0, deletions: 0 };

  const filesMatch = trimmed.match(/(\d+) file/);
  const insertMatch = trimmed.match(/(\d+) insertion/);
  const deleteMatch = trimmed.match(/(\d+) deletion/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
    insertions: insertMatch ? parseInt(insertMatch[1]) : 0,
    deletions: deleteMatch ? parseInt(deleteMatch[1]) : 0,
  };
}

export async function getDiffStat(base: string, branch: string): Promise<DiffStat> {
  const result = await $`git diff ${base}...${branch} --shortstat`.quiet().nothrow();
  return parseDiffStat(result.text());
}

export function parseFileDiffs(numstatOutput: string, nameStatusOutput: string): FileDiff[] {
  // Build a map of path -> status from --name-status (accurate source)
  const statusMap = new Map<string, FileDiff["status"]>();
  for (const line of nameStatusOutput.trim().split("\n")) {
    if (!line.trim()) continue;
    const [statusChar, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    if (statusChar?.startsWith("R")) {
      // Renames have two paths: old\tnew — use the new path as key
      const newPath = pathParts[pathParts.length - 1];
      statusMap.set(newPath, "R");
    } else if (statusChar?.startsWith("A")) statusMap.set(path, "A");
    else if (statusChar?.startsWith("D")) statusMap.set(path, "D");
    else statusMap.set(path, "M");
  }

  const files: FileDiff[] = [];
  for (const line of numstatOutput.trim().split("\n")) {
    // Format: "insertions\tdeletions\tfilepath"
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;

    const insertions = match[1] === "-" ? 0 : parseInt(match[1]);
    const deletions = match[2] === "-" ? 0 : parseInt(match[2]);
    const path = match[3];
    const status = statusMap.get(path) ?? "M";

    files.push({ path, status, insertions, deletions });
  }

  return files;
}

export async function getDiff(base: string, branch: string): Promise<DiffResult> {
  const [rawResult, statResult, numstatResult, nameStatusResult, commits] = await Promise.all([
    $`git diff ${base}...${branch}`.quiet().nothrow(),
    $`git diff ${base}...${branch} --stat`.quiet().nothrow(),
    $`git diff ${base}...${branch} --numstat`.quiet().nothrow(),
    $`git diff ${base}...${branch} --name-status`.quiet().nothrow(),
    getCommitLog(base, branch),
  ]);

  const files = parseFileDiffs(numstatResult.text(), nameStatusResult.text());
  const summary = await getDiffStat(base, branch);

  // Build per-commit diffs and file lists
  let commitDiffs: Record<string, string> | undefined;
  let commitFiles: Record<string, FileDiff[]> | undefined;

  if (commits.length > 1) {
    commitDiffs = {};
    commitFiles = {};

    const perCommitResults = await Promise.all(
      commits.map(async (c) => {
        const [diffRes, numstatRes, nameStatusRes] = await Promise.all([
          $`git diff ${c.hash}~1..${c.hash}`.quiet().nothrow(),
          $`git diff ${c.hash}~1..${c.hash} --numstat`.quiet().nothrow(),
          $`git diff ${c.hash}~1..${c.hash} --name-status`.quiet().nothrow(),
        ]);
        return { shortHash: c.shortHash, diffRes, numstatRes, nameStatusRes };
      })
    );

    for (const { shortHash, diffRes, numstatRes, nameStatusRes } of perCommitResults) {
      commitDiffs[shortHash] = diffRes.text();
      commitFiles[shortHash] = parseFileDiffs(numstatRes.text(), nameStatusRes.text());
    }
  }

  return {
    raw: rawResult.text(),
    stat: statResult.text(),
    files,
    summary,
    commitDiffs,
    commitFiles,
  };
}

export async function getFileStatuses(base: string, branch: string): Promise<FileDiff[]> {
  const result = await $`git diff ${base}...${branch} --name-status`.quiet().nothrow();
  const lines = result.text().trim().split("\n");
  const files: FileDiff[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const [statusChar, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    let status: FileDiff["status"] = "M";
    if (statusChar?.startsWith("A")) status = "A";
    else if (statusChar?.startsWith("D")) status = "D";
    else if (statusChar?.startsWith("R")) status = "R";

    files.push({ path, status, insertions: 0, deletions: 0 });
  }

  return files;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export function parseCommitLog(text: string): CommitInfo[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split("\n");
  const commits: CommitInfo[] = [];

  for (let i = 0; i + 4 < lines.length; i += 5) {
    commits.push({
      hash: lines[i],
      shortHash: lines[i + 1],
      subject: lines[i + 2],
      author: lines[i + 3],
      date: lines[i + 4],
    });
  }

  return commits;
}

export async function getCommitLog(base: string, branch: string): Promise<CommitInfo[]> {
  const result = await $`git log ${base}..${branch} --format=%H%n%h%n%s%n%an%n%ai --reverse`.quiet().nothrow();
  return parseCommitLog(result.text());
}

export async function mergeWorktree(
  worktreeName: string,
  baseBranch?: string
): Promise<{ success: boolean; message: string }> {
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === worktreeName);
  if (!wt) return { success: false, message: `Worktree '${worktreeName}' not found.` };
  if (wt.isMain) return { success: false, message: "Cannot merge the main worktree." };

  const base = await getBaseBranch(baseBranch);

  // Merge the branch
  const mergeResult = await $`git merge ${wt.branch} --no-edit`.quiet().nothrow();
  if (mergeResult.exitCode !== 0) {
    // Abort the merge
    await $`git merge --abort`.quiet().nothrow();
    return {
      success: false,
      message: `Merge conflict. Resolve manually:\n  cd ${wt.path}\n  git merge ${base}\n\n${mergeResult.stderr.toString()}`,
    };
  }

  // Remove worktree and branch
  await $`git worktree remove ${wt.path}`.quiet().nothrow();
  await $`git branch -d ${wt.branch}`.quiet().nothrow();

  return { success: true, message: `Merged '${wt.branch}' and cleaned up worktree.` };
}

export async function discardWorktree(
  worktreeName: string,
  deleteBranch: boolean = true
): Promise<{ success: boolean; message: string }> {
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === worktreeName);
  if (!wt) return { success: false, message: `Worktree '${worktreeName}' not found.` };
  if (wt.isMain) return { success: false, message: "Cannot discard the main worktree." };

  const removeResult = await $`git worktree remove ${wt.path} --force`.quiet().nothrow();
  if (removeResult.exitCode !== 0) {
    return { success: false, message: `Failed to remove worktree: ${removeResult.stderr.toString()}` };
  }

  if (deleteBranch) {
    await $`git branch -D ${wt.branch}`.quiet().nothrow();
  }

  return {
    success: true,
    message: deleteBranch
      ? `Removed worktree and deleted branch '${wt.branch}'.`
      : `Removed worktree. Branch '${wt.branch}' kept.`,
  };
}
