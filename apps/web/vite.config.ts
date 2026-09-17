import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root serves every app; Vite only inlines the VITE_ prefixed values.
  envDir: root,
  server: {
    port: 5223,
    strictPort: true,
    host: "127.0.0.1",
    fs: { allow: [root] },
  },
  preview: { port: 5223, strictPort: true, host: "127.0.0.1" },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
