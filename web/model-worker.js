import {
  AutoModel,
  BertTokenizer,
  FeatureExtractionPipeline,
  env,
} from "@huggingface/transformers";
import { ORT_BASE } from "./lib/runtime-config.js";
import { MODEL } from "./lib/config.js";

env.backends.onnx.wasm.wasmPaths = self.location.origin + ORT_BASE;
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
let extractorPromise;
async function loadPinnedTokenizer() {
  // Tokenizer discovery in this SDK version also probes main without options.
  // This model has two known immutable JSON assets; load those exact files.
  let cache;
  try {
    cache = await caches.open("recallsloth-tokenizer-v1");
  } catch {}
  const json = async (name) => {
    const url =
      "https://huggingface.co/" +
      MODEL.id +
      "/resolve/" +
      MODEL.revision +
      "/" +
      name;
    let response = await cache?.match(url);
    if (!response) {
      response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok)
        throw Error(
          "Pinned tokenizer asset could not load. Connect to the internet for first use.",
        );
      try {
        await cache?.put(url, response.clone());
      } catch {}
    }
    return response.json();
  };
  const [data, config] = await Promise.all([
    json("tokenizer.json"),
    json("tokenizer_config.json"),
  ]);
  if (config.tokenizer_class?.replace(/Fast$/, "") !== "BertTokenizer")
    throw Error("Unexpected pinned tokenizer type.");
  return new BertTokenizer(data, config);
}
async function extractor() {
  if (!extractorPromise) {
    // The v4 convenience helper's file-discovery step probes "main" without
    // forwarding revision/offline options. Construct the public pipeline directly.
    const options = {
      revision: MODEL.revision,

      dtype: MODEL.dtype,
      device: MODEL.device,
      progress_callback: (p) =>
        self.postMessage({
          type: "progress",
          status: p.status,
          file: p.file,
          progress: p.progress ?? null,
        }),
    };
    extractorPromise = Promise.all([
      loadPinnedTokenizer(),
      AutoModel.from_pretrained(MODEL.id, options),
    ]).then(
      ([tokenizer, model]) =>
        new FeatureExtractionPipeline({
          task: "feature-extraction",
          tokenizer,
          model,
        }),
    );
  }
  try {
    return await extractorPromise;
  } catch (error) {
    extractorPromise = null;
    throw error;
  }
}
self.onmessage = async ({ data }) => {
  if (data.type !== "embed") return;
  const start = performance.now();
  try {
    const model = await extractor(),
      vectors = [];
    for (let offset = 0; offset < data.texts.length; offset += 8) {
      const output = await model(data.texts.slice(offset, offset + 8), {
        pooling: "mean",
        normalize: true,
        truncation: true,
        max_length: 256,
      });
      vectors.push(...output.tolist());
      output.dispose?.();
      self.postMessage({
        type: "batch",
        done: Math.min(offset + 8, data.texts.length),
        total: data.texts.length,
      });
    }
    self.postMessage({
      type: "result",
      id: data.id,
      vectors,
      model: MODEL,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      error: error.message || "Local AI could not start.",
    });
  }
};
