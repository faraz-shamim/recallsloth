import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
const ort = JSON.parse(
  await readFile("node_modules/onnxruntime-web/package.json", "utf8"),
);
const base = "/onnx/" + ort.version + "/";
await mkdir("web/public" + base, { recursive: true });
for (const ext of ["mjs", "wasm"])
  await cp(
    "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify." + ext,
    "web/public" + base + "ort-wasm-simd-threaded.asyncify." + ext,
  );
await writeFile(
  "web/lib/runtime-config.js",
  "export const ORT_BASE = " + JSON.stringify(base) + ";\n",
);
await mkdir("web/public/licenses", { recursive: true });
await cp(
  "node_modules/@huggingface/transformers/LICENSE",
  "web/public/licenses/transformers-LICENSE",
);
for (const name of ["LICENSE", "ThirdPartyNotices.txt"])
  await cp(
    "vendor/onnxruntime/" + name,
    "web/public/licenses/onnxruntime-" + name,
  );
console.log("Pinned browser runtime and licenses prepared.");
