# wt-review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI + web tool for reviewing git worktree changes with AI summaries, visual diffs, and merge/discard actions.

**Architecture:** Unified TypeScript/Bun project. CLI commands share a `core/git.ts` module with a Bun HTTP server that serves a vanilla HTML/JS/CSS web UI. Globally installable via `bun link`.

**Tech Stack:** TypeScript, Bun (runtime + test runner + HTTP server), highlight.js (syntax highlighting), gh copilot (AI summaries)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/core/types.ts`

**Step 1: Install Bun**

Run: `curl -fsSL https://bun.sh/install | bash`
Expected: Bun installed, `bun --version` outputs a version

**Step 2: Install gh CLI**

Run: `(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) && sudo mkdir -p -m 755 /etc/apt/keyrings && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh -y`
Expected: `gh --version` outputs a version

**Step 3: Initialize project**

```bash
cd /home/mayolars/git-diff-tool
bun init -y
```

**Step 4: Create package.json**

```json
{
  "name": "wt-review",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "wt-review": "./src/cli/index.ts"
  },
  "scripts": {
    "dev": "bun run src/cli/index.ts",
    "test": "bun test"
  }
}
```

**Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"]
}
```

**Step 6: Install bun-types**

Run: `bun add -d bun-types`

**Step 7: Create types file**

Create `src/core/types.ts`:

```typescript
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
```

**Step 8: Commit**

```bash
git add package.json tsconfig.json src/core/types.ts bun.lock
git commit -m "feat: project scaffolding with types"
```

---

### Task 2: Core Git Module — Worktree Discovery

**Files:**
- Create: `src/core/git.ts`
- Create: `tests/core/git.test.ts`

**Step 1: Write the failing test**

Create `tests/core/git.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { getWorktrees, getBaseBranch, isGitRepo } from "../src/core/git";

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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/core/git.test.ts`
Expected: FAIL — modules not found

**Step 3: Write implementation**

Create `src/core/git.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/core/git.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/core/git.ts tests/core/git.test.ts
git commit -m "feat: core git module with worktree discovery"
```

---

### Task 3: Core Git Module — Diff & Stats

**Files:**
- Modify: `src/core/git.ts`
- Modify: `tests/core/git.test.ts`

**Step 1: Write the failing test**

Append to `tests/core/git.test.ts`:

```typescript
import { getDiff, getDiffStat } from "../src/core/git";

describe("getDiffStat", () => {
  test("returns diff stats for a branch", async () => {
    // This test requires at least one branch with changes
    // For now, test that it returns a valid structure for the current branch
    const baseBranch = await getBaseBranch();
    const stat = await getDiffStat(baseBranch, baseBranch);
    expect(stat).toHaveProperty("filesChanged");
    expect(stat).toHaveProperty("insertions");
    expect(stat).toHaveProperty("deletions");
  });
});

describe("getDiff", () => {
  test("returns diff result for a branch", async () => {
    const baseBranch = await getBaseBranch();
    const diff = await getDiff(baseBranch, baseBranch);
    expect(diff).toHaveProperty("raw");
    expect(diff).toHaveProperty("stat");
    expect(diff).toHaveProperty("files");
    expect(diff).toHaveProperty("summary");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/core/git.test.ts`
Expected: FAIL — getDiff, getDiffStat not found

**Step 3: Add diff functions to git.ts**

Append to `src/core/git.ts`:

```typescript
export async function getDiffStat(base: string, branch: string): Promise<DiffStat> {
  const result = await $`git diff ${base}...${branch} --shortstat`.quiet().nothrow();
  const text = result.text().trim();

  if (!text) return { filesChanged: 0, insertions: 0, deletions: 0 };

  const filesMatch = text.match(/(\d+) file/);
  const insertMatch = text.match(/(\d+) insertion/);
  const deleteMatch = text.match(/(\d+) deletion/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
    insertions: insertMatch ? parseInt(insertMatch[1]) : 0,
    deletions: deleteMatch ? parseInt(deleteMatch[1]) : 0,
  };
}

function parseFileDiffs(statOutput: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = statOutput.trim().split("\n");

  for (const line of lines) {
    // Format: "insertions\tdeletions\tfilepath"
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;

    const insertions = match[1] === "-" ? 0 : parseInt(match[1]);
    const deletions = match[2] === "-" ? 0 : parseInt(match[2]);
    const path = match[3];

    let status: FileDiff["status"] = "M";
    if (insertions > 0 && deletions === 0) status = "A";
    if (insertions === 0 && deletions > 0) status = "D";

    files.push({ path, status, insertions, deletions });
  }

  return files;
}

export async function getDiff(base: string, branch: string): Promise<DiffResult> {
  const [rawResult, statResult, numstatResult] = await Promise.all([
    $`git diff ${base}...${branch}`.quiet().nothrow(),
    $`git diff ${base}...${branch} --stat`.quiet().nothrow(),
    $`git diff ${base}...${branch} --numstat`.quiet().nothrow(),
  ]);

  const files = parseFileDiffs(numstatResult.text());
  const summary = await getDiffStat(base, branch);

  return {
    raw: rawResult.text(),
    stat: statResult.text(),
    files,
    summary,
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
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/core/git.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/core/git.ts tests/core/git.test.ts
git commit -m "feat: add diff and stats to core git module"
```

---

### Task 4: Core Git Module — Merge & Discard

**Files:**
- Modify: `src/core/git.ts`

**Step 1: Add merge and discard functions**

Append to `src/core/git.ts`:

```typescript
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
```

**Step 2: Run existing tests to make sure nothing broke**

Run: `bun test tests/core/git.test.ts`
Expected: All existing tests PASS

**Step 3: Commit**

```bash
git add src/core/git.ts
git commit -m "feat: add merge and discard operations"
```

---

### Task 5: CLI — Command Router & Status Command

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/status.ts`

**Step 1: Create CLI entry point**

Create `src/cli/index.ts`:

```typescript
#!/usr/bin/env bun

import { isGitRepo } from "../core/git";

const commands: Record<string, () => Promise<void>> = {
  status: () => import("./status").then((m) => m.default()),
  summary: () => import("./summary").then((m) => m.default()),
  diff: () => import("./diff").then((m) => m.default()),
  merge: () => import("./merge").then((m) => m.default()),
  discard: () => import("./discard").then((m) => m.default()),
  web: () => import("../web/server").then((m) => m.default()),
};

async function main() {
  const command = process.argv[2];

  if (!command || command === "--help" || command === "-h") {
    console.log(`
wt-review — Git Worktree Review Tool

Usage: wt-review <command> [options]

Commands:
  status              List all worktrees with diff stats
  summary <name>      AI summary of worktree changes (via gh copilot)
  diff <name>         Show colorized diff for a worktree
  merge <name>        Merge worktree branch and clean up
  discard <name>      Remove worktree and delete branch
  web                 Start the web UI

Options:
  --base <branch>     Override base branch (default: main/master)
  --help, -h          Show this help
`);
    return;
  }

  if (!(await isGitRepo())) {
    console.error("Error: Not inside a git repository.");
    process.exit(1);
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "wt-review --help" for usage.');
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

**Step 2: Create status command**

Create `src/cli/status.ts`:

```typescript
import { getWorktrees, getBaseBranch, getDiffStat } from "../core/git";

export default async function status() {
  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();

  if (worktrees.length <= 1) {
    console.log("No additional worktrees found.");
    console.log("Main worktree is on branch:", worktrees[0]?.branch ?? "unknown");
    return;
  }

  console.log(`\nWorktrees (base: ${baseBranch})\n`);
  console.log(
    padRight("Name", 20) +
    padRight("Branch", 30) +
    padRight("Files", 8) +
    padRight("  +", 8) +
    padRight("  -", 8)
  );
  console.log("─".repeat(74));

  for (const wt of worktrees) {
    if (wt.isMain) continue;

    const stat = await getDiffStat(baseBranch, wt.branch);
    const filesStr = stat.filesChanged.toString();
    const insStr = `+${stat.insertions}`;
    const delStr = `-${stat.deletions}`;

    console.log(
      padRight(wt.name, 20) +
      padRight(wt.branch, 30) +
      padRight(filesStr, 8) +
      `\x1b[32m${padRight(insStr, 8)}\x1b[0m` +
      `\x1b[31m${padRight(delStr, 8)}\x1b[0m`
    );
  }
  console.log();
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
```

**Step 3: Test manually**

Run: `bun run src/cli/index.ts status`
Expected: Shows worktree table (or "No additional worktrees" message)

Run: `bun run src/cli/index.ts --help`
Expected: Shows help text

**Step 4: Commit**

```bash
git add src/cli/index.ts src/cli/status.ts
git commit -m "feat: CLI router and status command"
```

---

### Task 6: CLI — Diff, Summary, Merge, Discard Commands

**Files:**
- Create: `src/cli/diff.ts`
- Create: `src/cli/summary.ts`
- Create: `src/cli/merge.ts`
- Create: `src/cli/discard.ts`

**Step 1: Create diff command**

Create `src/cli/diff.ts`:

```typescript
import { getWorktrees, getBaseBranch } from "../core/git";
import { $ } from "bun";

export default async function diff() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wt-review diff <worktree-name>");
    process.exit(1);
  }

  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);

  if (!wt) {
    console.error(`Worktree '${name}' not found. Run 'wt-review status' to see available worktrees.`);
    process.exit(1);
  }

  // Use git diff with color output directly to terminal
  const result = await $`git diff ${baseBranch}...${wt.branch} --color=always`
    .quiet()
    .nothrow();

  const output = result.text();
  if (!output.trim()) {
    console.log(`No differences between '${baseBranch}' and '${wt.branch}'.`);
    return;
  }

  process.stdout.write(output);
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
```

**Step 2: Create summary command**

Create `src/cli/summary.ts`:

```typescript
import { getWorktrees, getBaseBranch, getDiff } from "../core/git";
import { $ } from "bun";

export default async function summary() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wt-review summary <worktree-name>");
    process.exit(1);
  }

  const baseBranch = await getBaseBranch(getFlag("--base"));
  const worktrees = await getWorktrees();
  const wt = worktrees.find((w) => w.name === name);

  if (!wt) {
    console.error(`Worktree '${name}' not found. Run 'wt-review status' to see available worktrees.`);
    process.exit(1);
  }

  // Check if gh copilot is available
  const ghCheck = await $`gh copilot --help`.quiet().nothrow();
  if (ghCheck.exitCode !== 0) {
    console.log("Note: 'gh copilot' is not available. Showing git stats instead.\n");
    const diff = await getDiff(baseBranch, wt.branch);
    console.log(diff.stat);
    return;
  }

  // Get the diff and pipe to gh copilot
  const diffText = await $`git diff ${baseBranch}...${wt.branch}`.quiet().text();

  console.log(`Summarizing changes in '${wt.name}' (${wt.branch})...\n`);

  const prompt = `Summarize the following git diff. Explain what changed and why it matters. Be concise.\n\n${diffText}`;
  const result = await $`gh copilot explain ${prompt}`.nothrow();

  if (result.exitCode !== 0) {
    console.error("Copilot summary failed. Showing git stats instead:\n");
    const diff = await getDiff(baseBranch, wt.branch);
    console.log(diff.stat);
  }
}

function getFlag(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}
```

**Step 3: Create merge command**

Create `src/cli/merge.ts`:

```typescript
import { mergeWorktree, getBaseBranch } from "../core/git";

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
```

**Step 4: Create discard command**

Create `src/cli/discard.ts`:

```typescript
import { discardWorktree } from "../core/git";

export default async function discard() {
  const name = process.argv[3];
  if (!name) {
    console.error("Usage: wt-review discard <worktree-name>");
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
```

**Step 5: Test all commands manually**

Run: `bun run src/cli/index.ts diff --help` — should show usage
Run: `bun run src/cli/index.ts merge --help` — should show usage

**Step 6: Commit**

```bash
git add src/cli/diff.ts src/cli/summary.ts src/cli/merge.ts src/cli/discard.ts
git commit -m "feat: add diff, summary, merge, discard CLI commands"
```

---

### Task 7: Web Server — API Endpoints

**Files:**
- Create: `src/web/server.ts`

**Step 1: Create the web server with API routes**

Create `src/web/server.ts`:

```typescript
import { getWorktrees, getBaseBranch, getDiff, getDiffStat, mergeWorktree, discardWorktree } from "../core/git";
import type { WorktreeDetail } from "../core/types";
import { join } from "path";

const PORT = parseInt(process.env.PORT ?? "3000");

export default async function startServer() {
  const publicDir = join(import.meta.dir, "public");

  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // API routes
      if (path.startsWith("/api/")) {
        return handleApi(req, path, url);
      }

      // Static files
      const filePath = path === "/" ? "/index.html" : path;
      const file = Bun.file(join(publicDir, filePath));
      if (await file.exists()) {
        return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`wt-review web UI running at http://localhost:${server.port}`);
  console.log("Press Ctrl+C to stop.\n");
}

async function handleApi(req: Request, path: string, url: URL): Promise<Response> {
  const baseBranch = url.searchParams.get("base") ?? undefined;

  try {
    // GET /api/worktrees
    if (path === "/api/worktrees" && req.method === "GET") {
      const base = await getBaseBranch(baseBranch);
      const worktrees = await getWorktrees();
      const details: WorktreeDetail[] = [];

      for (const wt of worktrees) {
        if (wt.isMain) continue;
        const diff = await getDiff(base, wt.branch);
        details.push({
          ...wt,
          stat: diff.summary,
          files: diff.files,
        });
      }

      return json(details);
    }

    // GET /api/worktree/:name/diff
    const diffMatch = path.match(/^\/api\/worktree\/([^/]+)\/diff$/);
    if (diffMatch && req.method === "GET") {
      const name = decodeURIComponent(diffMatch[1]);
      const base = await getBaseBranch(baseBranch);
      const worktrees = await getWorktrees();
      const wt = worktrees.find((w) => w.name === name);
      if (!wt) return json({ error: "Worktree not found" }, 404);

      const diff = await getDiff(base, wt.branch);
      return json(diff);
    }

    // GET /api/worktree/:name/summary
    const summaryMatch = path.match(/^\/api\/worktree\/([^/]+)\/summary$/);
    if (summaryMatch && req.method === "GET") {
      const name = decodeURIComponent(summaryMatch[1]);
      const base = await getBaseBranch(baseBranch);
      const worktrees = await getWorktrees();
      const wt = worktrees.find((w) => w.name === name);
      if (!wt) return json({ error: "Worktree not found" }, 404);

      const diff = await getDiff(base, wt.branch);
      return json({
        stat: diff.stat,
        summary: diff.summary,
        files: diff.files,
      });
    }

    // POST /api/worktree/:name/merge
    const mergeMatch = path.match(/^\/api\/worktree\/([^/]+)\/merge$/);
    if (mergeMatch && req.method === "POST") {
      const name = decodeURIComponent(mergeMatch[1]);
      const result = await mergeWorktree(name, baseBranch);
      return json(result, result.success ? 200 : 400);
    }

    // POST /api/worktree/:name/discard
    const discardMatch = path.match(/^\/api\/worktree\/([^/]+)\/discard$/);
    if (discardMatch && req.method === "POST") {
      const name = decodeURIComponent(discardMatch[1]);
      const result = await discardWorktree(name);
      return json(result, result.success ? 200 : 400);
    }

    return json({ error: "Not found" }, 404);
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Step 2: Test the server starts**

Run: `bun run src/web/server.ts &` then `curl http://localhost:3000/api/worktrees`
Expected: JSON response (may be empty array)
Then kill the server.

**Step 3: Commit**

```bash
git add src/web/server.ts
git commit -m "feat: web server with API endpoints"
```

---

### Task 8: Web UI — Frontend

**Files:**
- Create: `src/web/public/index.html`

**Step 1: Create the single-page web UI**

Create `src/web/public/index.html` — a self-contained HTML file with embedded CSS and JS. This file should include:

- Dark theme with system preference detection
- Left sidebar listing worktrees (fetched from `/api/worktrees`)
- Main area showing: worktree name + branch, diff stats summary, changed files list, inline unified diff with syntax highlighting
- Merge and Discard buttons with confirmation dialogs
- Uses highlight.js from CDN for syntax highlighting of diffs
- Responsive layout
- Auto-refreshes worktree list every 30 seconds
- Color-coded diff lines (green for additions, red for deletions)
- Collapsible file sections in the diff view
- Loading states and error handling

Key UI elements:
- Header bar with "wt-review" title
- Sidebar: list of worktrees with file count and +/- stats as badges
- Main content: selected worktree details
- File list as clickable items that expand to show the diff for that file
- Bottom action bar with Merge and Discard buttons

The full HTML/CSS/JS should be approximately 400-600 lines, self-contained, no build step needed.

**Step 2: Test the full stack**

Run: `bun run src/cli/index.ts web`
Expected: Server starts, open browser to `http://localhost:3000`, see the UI

**Step 3: Commit**

```bash
git add src/web/public/index.html
git commit -m "feat: web UI frontend"
```

---

### Task 9: Global Installation & Polish

**Files:**
- Modify: `package.json`
- Modify: `src/cli/index.ts`

**Step 1: Make the CLI executable**

Run: `chmod +x src/cli/index.ts`

**Step 2: Link globally**

Run: `bun link`
Expected: `wt-review` command is now available globally

**Step 3: Test global command**

Run: `wt-review --help`
Expected: Shows help text

Run: `wt-review status`
Expected: Shows worktree list or "no additional worktrees" message

**Step 4: Commit**

```bash
git add package.json src/cli/index.ts
git commit -m "feat: global installation via bun link"
```

---

### Task 10: End-to-End Test with Real Worktree

**Step 1: Create a test worktree**

```bash
cd /home/mayolars/git-diff-tool
git worktree add .worktrees/test-feature -b test-feature
```

**Step 2: Make changes in the worktree**

```bash
cd .worktrees/test-feature
echo "// test change" >> src/core/types.ts
git add -A && git commit -m "test: add test change"
cd /home/mayolars/git-diff-tool
```

**Step 3: Test all CLI commands**

Run: `wt-review status` — should show test-feature worktree
Run: `wt-review diff test-feature` — should show the diff
Run: `wt-review summary test-feature` — should show summary or git stats
Run: `wt-review web` — should start web UI, verify in browser

**Step 4: Test merge**

Run: `wt-review merge test-feature` — should merge and clean up

**Step 5: Clean up**

Verify worktree was removed: `git worktree list`

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end test fixes"
```
