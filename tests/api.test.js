import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
async function serve(fn) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn("http://127.0.0.1:" + server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
test("HTTP health advertises browser-only storage and no note upload", async () =>
  serve(async (base) => {
    const r = await fetch(base + "/api/health"),
      a = await r.json();
    assert.equal(r.status, 200);
    assert.equal(a.storage, "browser-only");
    assert.equal(a.noteTextAccepted, false);
    assert.ok(
      r.headers
        .get("content-security-policy")
        .includes("frame-ancestors 'none'"),
    );
  }));
test("Actual HTTP queue accepts bounded metadata and returns a deterministic tool trace", async () =>
  serve(async (base) => {
    const r = await fetch(base + "/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        now: 1,
        budgetSeconds: 120,
        cards: [],
      }),
    });
    const a = await r.json();
    assert.equal(r.status, 200);
    assert.equal(a.runtime, "local-server");
    assert.equal(a.trace.length, 3);
    assert.equal(a.medicalContentReceived, false);
  }));
test("Text-bearing, oversized and malformed HTTP requests fail without reflecting content", async () =>
  serve(async (base) => {
    for (const [body, status] of [
      [JSON.stringify({ noteText: "PRIVATE_SENTINEL" }), 400],
      ['{"bad":', 400],
      [JSON.stringify({ x: "x".repeat(70000) }), 413],
    ]) {
      const r = await fetch(base + "/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(r.status, status);
      assert.ok(!(await r.text()).includes("PRIVATE_SENTINEL"));
    }
  }));
test("A document-upload API is unavailable", async () =>
  serve(async (base) => {
    const r = await fetch(base + "/api/upload", { method: "POST" });
    assert.equal(r.status, 404);
  }));
