import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import apiApp from "./artifacts/api-server/src/app";

// Ensure BASE_PATH is '/' and not an invalid URL or string
process.env.BASE_PATH = "/";

// Fall back to VITE_ vars for server-side Supabase if not explicitly set
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}
if (!process.env.SUPABASE_PUBLISHABLE_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const PORT = 3000;

  // Mount the API Express application
  app.use(apiApp);

  // Mount frontend (Vite middleware in dev, static files in prod)
  if (!isProd) {
    const classiqDir = path.resolve(import.meta.dirname, "artifacts/classiq");
    const vite = await createViteServer({
      root: classiqDir,
      base: "/",
      configFile: path.resolve(classiqDir, "vite.config.ts"),
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, "artifacts/classiq/dist/public");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClassIQ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
