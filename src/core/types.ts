export interface Worktree {
  path: string;
  branch: string;
  name: string;
  head: string;
  isBare: boolean;
  isMain: boolean;
}

export interface DiffStat {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface FileDiff {
  path: string;
  status: "A" | "M" | "D" | "R";
  insertions: number;
  deletions: number;
}

export interface WorktreeDetail extends Worktree {
  stat: DiffStat;
  files: FileDiff[];
}

export interface DiffResult {
  raw: string;
  stat: string;
  files: FileDiff[];
  summary: DiffStat;
}
