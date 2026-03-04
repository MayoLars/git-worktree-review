import { getWorktrees, getBaseBranch, getDiff, getDiffStat, getCommitLog, mergeWorktree, discardWorktree } from "../core/git";
import { loadConfig } from "../core/config";
import type { WorktreeDetail, DiffResult } from "../core/types";
import { join, resolve } from "path";

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
        return demo ? handleDemoApi(req, path) : handleApi(req, path, url);
      }

      // Static files (resolve and verify path stays within publicDir)
      const filePath = path === "/" ? "/index.html" : path;
      const resolved = resolve(publicDir, filePath.slice(1));
      if (!resolved.startsWith(publicDir)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(resolved);
      if (await file.exists()) {
        return new Response(file);
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

      return json({ baseBranch: base, worktrees: details });
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
    console.error("API error:", err);
    return json({ error: "Internal server error" }, 500);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

// --- Demo mode ---

const DEMO_WORKTREES: WorktreeDetail[] = [
  {
    path: "/demo/feature/auth-system",
    branch: "feature/auth-system",
    name: "auth-system",
    head: "a1b2c3d",
    isBare: false,
    isMain: false,
    stat: { filesChanged: 4, insertions: 127, deletions: 8 },
    files: [
      { path: "src/middleware/auth.ts", status: "A", insertions: 52, deletions: 0 },
      { path: "src/routes/login.ts", status: "A", insertions: 41, deletions: 0 },
      { path: "src/routes/index.ts", status: "M", insertions: 6, deletions: 1 },
      { path: "src/types/user.ts", status: "A", insertions: 28, deletions: 7 },
    ],
    commits: [
      { hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", shortHash: "a1b2c3d", subject: "Add JWT auth middleware", author: "MayoLars", date: "2026-02-28 14:32:00 +0100" },
      { hash: "e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3", shortHash: "e4f5a6b", subject: "Add login route with validation", author: "MayoLars", date: "2026-03-01 09:15:00 +0100" },
      { hash: "c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", shortHash: "c7d8e9f", subject: "Register auth routes and user types", author: "MayoLars", date: "2026-03-02 16:45:00 +0100" },
    ],
  },
  {
    path: "/demo/fix/header-styling",
    branch: "fix/header-styling",
    name: "header-styling",
    head: "f9e8d7c",
    isBare: false,
    isMain: false,
    stat: { filesChanged: 2, insertions: 9, deletions: 4 },
    files: [
      { path: "src/web/public/index.html", status: "M", insertions: 7, deletions: 3 },
      { path: "src/components/Header.tsx", status: "M", insertions: 2, deletions: 1 },
    ],
    commits: [
      { hash: "f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0", shortHash: "f9e8d7c", subject: "Fix header overflow on mobile viewports", author: "MayoLars", date: "2026-03-03 11:20:00 +0100" },
    ],
  },
];

const DEMO_DIFFS: Record<string, any> = {
  "auth-system": {
    stat: " 4 files changed, 127 insertions(+), 8 deletions(-)",
    summary: { filesChanged: 4, insertions: 127, deletions: 8 },
    files: DEMO_WORKTREES[0].files,
    commitDiffs: {
      "a1b2c3d": `diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts
new file mode 100644
--- /dev/null
+++ b/src/middleware/auth.ts
@@ -0,0 +1,52 @@
+import { verify } from "jsonwebtoken";
+import type { Request, Response, NextFunction } from "express";
+
+const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
+
+export interface AuthRequest extends Request {
+  userId?: string;
+  role?: string;
+}
+
+export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
+  const header = req.headers.authorization;
+  if (!header?.startsWith("Bearer ")) {
+    return res.status(401).json({ error: "Missing authorization header" });
+  }
+
+  try {
+    const token = header.slice(7);
+    const payload = verify(token, JWT_SECRET) as { sub: string; role: string };
+    req.userId = payload.sub;
+    req.role = payload.role;
+    next();
+  } catch {
+    return res.status(401).json({ error: "Invalid or expired token" });
+  }
+}
+
+export function requireRole(role: string) {
+  return (req: AuthRequest, res: Response, next: NextFunction) => {
+    if (req.role !== role) {
+      return res.status(403).json({ error: "Insufficient permissions" });
+    }
+    next();
+  };
+}
`,
      "e4f5a6b": `diff --git a/src/routes/login.ts b/src/routes/login.ts
new file mode 100644
--- /dev/null
+++ b/src/routes/login.ts
@@ -0,0 +1,41 @@
+import { Router } from "express";
+import { sign } from "jsonwebtoken";
+import { findUserByEmail, verifyPassword } from "../models/user";
+
+const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
+const router = Router();
+
+router.post("/login", async (req, res) => {
+  const { email, password } = req.body;
+
+  if (!email || !password) {
+    return res.status(400).json({ error: "Email and password required" });
+  }
+
+  const user = await findUserByEmail(email);
+  if (!user || !(await verifyPassword(password, user.passwordHash))) {
+    return res.status(401).json({ error: "Invalid credentials" });
+  }
+
+  const token = sign({ sub: user.id, role: user.role }, JWT_SECRET, {
+    expiresIn: "24h",
+  });
+
+  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
+});
+
+export default router;
`,
      "c7d8e9f": `diff --git a/src/routes/index.ts b/src/routes/index.ts
--- a/src/routes/index.ts
+++ b/src/routes/index.ts
@@ -1,5 +1,10 @@
 import { Router } from "express";
+import loginRouter from "./login";
+import { requireAuth } from "../middleware/auth";

 const router = Router();

-export default router;
+router.use("/auth", loginRouter);
+router.use("/api", requireAuth);
+
+export default router;
diff --git a/src/types/user.ts b/src/types/user.ts
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ -1,8 +1,29 @@
 export interface User {
   id: string;
-  name: string;
   email: string;
+  name: string;
+  role: UserRole;
+  passwordHash: string;
+  createdAt: Date;
+  updatedAt: Date;
+}
+
+export type UserRole = "admin" | "editor" | "viewer";
+
+export interface CreateUserInput {
+  email: string;
+  name: string;
+  password: string;
+  role?: UserRole;
+}
+
+export interface UserPublic {
+  id: string;
+  email: string;
+  name: string;
+  role: UserRole;
 }
`,
    },
    commitFiles: {
      "a1b2c3d": [
        { path: "src/middleware/auth.ts", status: "A" as const, insertions: 52, deletions: 0 },
      ],
      "e4f5a6b": [
        { path: "src/routes/login.ts", status: "A" as const, insertions: 41, deletions: 0 },
      ],
      "c7d8e9f": [
        { path: "src/routes/index.ts", status: "M" as const, insertions: 6, deletions: 1 },
        { path: "src/types/user.ts", status: "A" as const, insertions: 28, deletions: 7 },
      ],
    },
    raw: `diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts
new file mode 100644
--- /dev/null
+++ b/src/middleware/auth.ts
@@ -0,0 +1,52 @@
+import { verify } from "jsonwebtoken";
+import type { Request, Response, NextFunction } from "express";
+
+const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
+
+export interface AuthRequest extends Request {
+  userId?: string;
+  role?: string;
+}
+
+export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
+  const header = req.headers.authorization;
+  if (!header?.startsWith("Bearer ")) {
+    return res.status(401).json({ error: "Missing authorization header" });
+  }
+
+  try {
+    const token = header.slice(7);
+    const payload = verify(token, JWT_SECRET) as { sub: string; role: string };
+    req.userId = payload.sub;
+    req.role = payload.role;
+    next();
+  } catch {
+    return res.status(401).json({ error: "Invalid or expired token" });
+  }
+}
+
+export function requireRole(role: string) {
+  return (req: AuthRequest, res: Response, next: NextFunction) => {
+    if (req.role !== role) {
+      return res.status(403).json({ error: "Insufficient permissions" });
+    }
+    next();
+  };
+}
diff --git a/src/routes/login.ts b/src/routes/login.ts
new file mode 100644
--- /dev/null
+++ b/src/routes/login.ts
@@ -0,0 +1,41 @@
+import { Router } from "express";
+import { sign } from "jsonwebtoken";
+import { findUserByEmail, verifyPassword } from "../models/user";
+
+const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";
+const router = Router();
+
+router.post("/login", async (req, res) => {
+  const { email, password } = req.body;
+
+  if (!email || !password) {
+    return res.status(400).json({ error: "Email and password required" });
+  }
+
+  const user = await findUserByEmail(email);
+  if (!user || !(await verifyPassword(password, user.passwordHash))) {
+    return res.status(401).json({ error: "Invalid credentials" });
+  }
+
+  const token = sign({ sub: user.id, role: user.role }, JWT_SECRET, {
+    expiresIn: "24h",
+  });
+
+  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
+});
+
+export default router;
diff --git a/src/routes/index.ts b/src/routes/index.ts
--- a/src/routes/index.ts
+++ b/src/routes/index.ts
@@ -1,5 +1,10 @@
 import { Router } from "express";
+import loginRouter from "./login";
+import { requireAuth } from "../middleware/auth";

 const router = Router();

-export default router;
+router.use("/auth", loginRouter);
+router.use("/api", requireAuth);
+
+export default router;
diff --git a/src/types/user.ts b/src/types/user.ts
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ -1,8 +1,29 @@
 export interface User {
   id: string;
-  name: string;
   email: string;
+  name: string;
+  role: UserRole;
+  passwordHash: string;
+  createdAt: Date;
+  updatedAt: Date;
+}
+
+export type UserRole = "admin" | "editor" | "viewer";
+
+export interface CreateUserInput {
+  email: string;
+  name: string;
+  password: string;
+  role?: UserRole;
+}
+
+export interface UserPublic {
+  id: string;
+  email: string;
+  name: string;
+  role: UserRole;
 }
`,
  },
  "header-styling": {
    stat: " 2 files changed, 9 insertions(+), 4 deletions(-)",
    summary: { filesChanged: 2, insertions: 9, deletions: 4 },
    files: DEMO_WORKTREES[1].files,
    raw: `diff --git a/src/web/public/index.html b/src/web/public/index.html
--- a/src/web/public/index.html
+++ b/src/web/public/index.html
@@ -22,9 +22,13 @@
   header {
     display: flex;
     align-items: center;
-    padding: 16px 24px;
+    padding: 12px 16px;
     background: var(--bg-secondary);
     border-bottom: 1px solid var(--border);
+    overflow: hidden;
+    white-space: nowrap;
+    text-overflow: ellipsis;
+    min-width: 0;
   }

-  header h1 { font-size: 18px; }
+  header h1 { font-size: 16px; margin: 0; }
diff --git a/src/components/Header.tsx b/src/components/Header.tsx
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -5,7 +5,8 @@
 export function Header({ title }: HeaderProps) {
   return (
     <header>
-      <h1>{title}</h1>
+      <h1 title={title}>{title}</h1>
+      <span className="sr-only">Git Worktree Review</span>
     </header>
   );
 }
`,
  },
};

async function handleDemoApi(req: Request, path: string): Promise<Response> {
  // GET /api/worktrees
  if (path === "/api/worktrees" && req.method === "GET") {
    return json({ baseBranch: "main", worktrees: DEMO_WORKTREES });
  }

  // GET /api/worktree/:name/diff
  const diffMatch = path.match(/^\/api\/worktree\/([^/]+)\/diff$/);
  if (diffMatch && req.method === "GET") {
    const name = decodeURIComponent(diffMatch[1]);
    const diff = DEMO_DIFFS[name];
    if (!diff) return json({ error: "Worktree not found" }, 404);
    return json(diff);
  }

  // GET /api/worktree/:name/summary
  const summaryMatch = path.match(/^\/api\/worktree\/([^/]+)\/summary$/);
  if (summaryMatch && req.method === "GET") {
    const name = decodeURIComponent(summaryMatch[1]);
    const diff = DEMO_DIFFS[name];
    if (!diff) return json({ error: "Worktree not found" }, 404);
    return json({ stat: diff.stat, summary: diff.summary, files: diff.files });
  }

  // POST merge/discard — no-op in demo
  const mergeMatch = path.match(/^\/api\/worktree\/([^/]+)\/merge$/);
  if (mergeMatch && req.method === "POST") {
    return json({ success: true, message: "Demo mode: merge simulated" });
  }

  const discardMatch = path.match(/^\/api\/worktree\/([^/]+)\/discard$/);
  if (discardMatch && req.method === "POST") {
    return json({ success: true, message: "Demo mode: discard simulated" });
  }

  return json({ error: "Not found" }, 404);
}
