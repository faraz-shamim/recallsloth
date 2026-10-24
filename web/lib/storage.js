import { emptyState, validateBackup } from "./core.js";
let dbPromise;
function database() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("recallsloth", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error("Browser storage is unavailable."));
    });
  return dbPromise;
}
export async function saveState(state) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(structuredClone(state), "current");
    tx.oncomplete = resolve;
    tx.onerror = () =>
      reject(
        Error(
          "The browser could not save this change. Export a backup before closing.",
        ),
      );
  });
}
export async function loadState() {
  const db = await database(),
    raw = await new Promise((resolve, reject) => {
      const r = db
        .transaction("workspace")
        .objectStore("workspace")
        .get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
  if (!raw) return emptyState();
  const checked = await validateBackup(raw);
  checked.dismissed = Array.isArray(raw.dismissed)
    ? raw.dismissed
        .filter((k) => /^c_[a-f0-9]{16}\|c_[a-f0-9]{16}$/.test(k))
        .slice(0, 1000)
    : [];
  checked.modelRun =
    raw.modelRun && typeof raw.modelRun.durationMs === "number"
      ? {
          durationMs: raw.modelRun.durationMs,
          modelId: "Xenova/all-MiniLM-L6-v2",
          at: raw.modelRun.at,
        }
      : null;
  checked.reviews = Array.isArray(raw.reviews)
    ? raw.reviews
        .filter(
          (r) =>
            Number.isFinite(r.at) &&
            ["again", "hard", "good", "easy"].includes(r.rating),
        )
        .slice(-1000)
        .map((r) => ({
          id: String(r.id).slice(0, 50),
          sessionId: String(r.sessionId).slice(0, 50),
          cardId: String(r.cardId).slice(0, 50),
          rating: r.rating,
          at: r.at,
        }))
    : [];
  const session = raw.session;
  if (
    session &&
    Array.isArray(session.ids) &&
    session.ids.every((id) => checked.cards.some((c) => c.id === id)) &&
    Number.isInteger(session.index) &&
    session.index >= 0 &&
    session.index <= session.ids.length
  )
    checked.session = {
      id: String(session.id).slice(0, 50),
      ids: session.ids,
      index: session.index,
      createdAt: session.createdAt,
      runtime: String(session.runtime || "on-device").slice(0, 30),
      estimatedSeconds: Number(session.estimatedSeconds) || 0,
    };
  return checked;
}
export async function clearState() {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").clear();
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}
