import { getWorktrees, getBaseBranch, getDiff, getDiffStat, getCommitLog, mergeWorktree, discardWorktree } from "../core/git";
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
        const [diff, commits] = await Promise.all([
          getDiff(base, wt.branch),
          getCommitLog(base, wt.branch),
        ]);
        details.push({
          ...wt,
          stat: diff.summary,
          files: diff.files,
          commits,
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
