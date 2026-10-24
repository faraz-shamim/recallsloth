import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = path + "/" + entry.name;
    if (entry.isDirectory()) await visit(file);
    else if (/\.(?:js|mjs|css|wasm)$/.test(file)) {
      const bytes = await readFile(file);
      if (bytes.length > 1000)
        await writeFile(file + ".gz", gzipSync(bytes, { level: 9 }));
    }
  }
}
await visit("dist");
console.log("Compressed static runtime assets prepared.");
