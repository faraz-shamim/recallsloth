import { MODEL } from "./config.js";
let worker = null,
  sequence = 0,
  pending = new Map();
export function resetModel() {
  worker?.terminate();
  worker = null;
  for (const p of pending.values())
    p.reject(Error("Local analysis was cancelled."));
  pending.clear();
}
export function embedTexts(texts, onProgress = () => {}) {
  if (!worker) {
    worker = new Worker(new URL("../model-worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress" || data.type === "batch") {
        for (const p of pending.values()) p.onProgress(data);
        return;
      }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      data.type === "error" ? p.reject(Error(data.error)) : p.resolve(data);
    };
    worker.onerror = () => {
      for (const p of pending.values())
        p.reject(
          Error(
            "The local AI worker stopped. Retry on a recent desktop browser.",
          ),
        );
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ type: "embed", id, texts });
  });
}
export { MODEL };
