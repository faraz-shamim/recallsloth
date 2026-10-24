import { createApp } from "./app.js";
const production = process.argv.includes("--production");
let vite;
if (!production) {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
}
const app = createApp(production ? { staticDir: "dist" } : { vite });
const server = app.listen(
  Number(process.env.PORT) || 4186,
  production ? "0.0.0.0" : "127.0.0.1",
  () => console.log("RecallSloth listening on " + (process.env.PORT || 4186)),
);
process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
