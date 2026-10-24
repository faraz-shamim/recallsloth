import express from "express";
import { existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { planQueue } from "../web/lib/planner.js";
export function createApp({ staticDir, vite } = {}) {
  const app = express(),
    limits = new Map();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' ws://localhost:* ws://127.0.0.1:* https://huggingface.co https://*.huggingface.co https://*.hf.co; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    });
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/health", (_, res) =>
    res.json({
      ok: true,
      app: "RecallSloth",
      version: "1.0.0",
      storage: "browser-only",
      render: !!process.env.RENDER,
      commit: process.env.RENDER_GIT_COMMIT || null,
      noteTextAccepted: false,
    }),
  );
  app.post("/api/queue", (req, res, next) => {
    try {
      const now = Date.now(),
        key = req.ip;
      let entry = limits.get(key);
      if (!entry || now - entry.at > 3600000) {
        entry = { at: now, n: 0 };
        if (limits.size > 2000) limits.delete(limits.keys().next().value);
        limits.set(key, entry);
      }
      if (++entry.n > 120)
        return res
          .status(429)
          .json({
            error: "Use the on-device queue while the public planner is busy.",
          });
      const at = performance.now(),
        result = planQueue(req.body);
      res.json({
        ...result,
        runtime: process.env.RENDER ? "render" : "local-server",
        durationMs: Math.round((performance.now() - at) * 100) / 100,
      });
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "No note-upload endpoint exists." }),
  );
  if (vite) app.use(vite.middlewares);
  else if (staticDir) {
    app.use((req, res, next) => {
      if (
        req.method !== "GET" ||
        !/^\/(?:assets\/[A-Za-z0-9_.-]+|onnx\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\.(?:mjs|js|wasm|css)$/.test(
          req.path,
        ) ||
        !req.acceptsEncodings("gzip")
      )
        return next();
      const path = resolve(staticDir, "." + req.path + ".gz");
      if (!existsSync(path)) return next();
      res.vary("Accept-Encoding");
      res.type(extname(req.path));
      res.set("Content-Encoding", "gzip");
      res.sendFile(path);
    });
    app.use(
      express.static(resolve(staticDir), {
        setHeaders: (res, path) => {
          if (path.endsWith("sw.js") || path.endsWith("index.html"))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (_, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    res.removeHeader("Content-Encoding");
    res.removeHeader("Content-Length");
    res
      .status(
        e.type === "entity.too.large"
          ? 413
          : e.status === 400 || e.type === "entity.parse.failed"
            ? 400
            : 500,
      )
      .json({
        error:
          e.type === "entity.too.large"
            ? "Study metadata is too large."
            : e.status === 400 || e.type === "entity.parse.failed"
              ? "Only bounded anonymous study metadata is accepted."
              : "Queue unavailable. Use on-device planning.",
      });
  });
  return app;
}
