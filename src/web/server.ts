import { getWorktrees, getBaseBranch, getDiff, getDiffStat, mergeWorktree, discardWorktree } from "../core/git";
import { loadConfig } from "../core/config";
import type { WorktreeDetail } from "../core/types";
import { handleDemoApi } from "./demo-data";
import { join, resolve } from "path";

/** Validates worktree name from URL to prevent injection if ever used in commands */
function validateWorktreeName(name: string): boolean {
  return /^[a-zA-Z0-9._\-]+$/.test(name) && name.length <= 255;
}

export default async function startServer(options?: { demo?: boolean }) {
  const demo = options?.demo ?? false;
  const config = demo ? {} : await loadConfig();
  const port = parseInt(process.env.PORT ?? "") || config.port || 3000;
  const publicDir = join(import.meta.dir, "public");

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Require custom header on POST requests to prevent CSRF
      if (req.method === "POST" && req.headers.get("X-Requested-With") !== "wtr") {
        return json({ error: "Forbidden" }, 403);
      }

      // API routes
      if (path.startsWith("/api/")) {
        return demo ? handleDemoApi(req, path, json) : handleApi(req, path, url);
      }

      // Static files (resolve and verify path stays within publicDir)
      const filePath = path === "/" ? "/index.html" : path;
      const resolved = resolve(publicDir, filePath.slice(1));
      if (!resolved.startsWith(publicDir)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(resolved);
      if (await file.exists()) {
        return new Response(file, { headers: { ...SECURITY_HEADERS } });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`wtr web UI running at http://localhost:${server.port}`);
  console.log("Press Ctrl+C to stop.\n");
}

async function handleApi(req: Request, path: string, url: URL): Promise<Response> {
  const baseBranch = url.searchParams.get("base") ?? undefined;

  try {
    // GET /api/worktrees
    if (path === "/api/worktrees" && req.method === "GET") {
      const base = await getBaseBranch(baseBranch);
      const worktrees = await getWorktrees();

      const details: WorktreeDetail[] = await Promise.all(
        worktrees
          .filter((wt) => !wt.isMain)
          .map(async (wt) => {
            const diff = await getDiff(base, wt.branch);
            return { ...wt, stat: diff.summary, files: diff.files, commits: diff.commits };
          })
      );

      return json({ baseBranch: base, worktrees: details });
    }

    // GET /api/worktree/:name/diff
    const diffMatch = path.match(/^\/api\/worktree\/([^/]+)\/diff$/);
    if (diffMatch && req.method === "GET") {
      const name = decodeURIComponent(diffMatch[1]);
      if (!validateWorktreeName(name)) return json({ error: "Invalid worktree name" }, 400);
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
      if (!validateWorktreeName(name)) return json({ error: "Invalid worktree name" }, 400);
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
      if (!validateWorktreeName(name)) return json({ error: "Invalid worktree name" }, 400);
      const result = await mergeWorktree(name, baseBranch);
      return json(result, result.success ? 200 : 400);
    }

    // POST /api/worktree/:name/discard
    const discardMatch = path.match(/^\/api\/worktree\/([^/]+)\/discard$/);
    if (discardMatch && req.method === "POST") {
      const name = decodeURIComponent(discardMatch[1]);
      if (!validateWorktreeName(name)) return json({ error: "Invalid worktree name" }, 400);
      const result = await discardWorktree(name);
      return json(result, result.success ? 200 : 400);
    }

    return json({ error: "Not found" }, 404);
  } catch (err: any) {
    console.error("API error:", err);
    return json({ error: "Internal server error" }, 500);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}
