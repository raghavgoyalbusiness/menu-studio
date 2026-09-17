import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  server: { fs: { allow: [root] } },
  build: isSsrBuild
    ? { target: "node24", emptyOutDir: true }
    : {
        target: "es2020",
        emptyOutDir: true,
        manifest: true,
        cssCodeSplit: false,
        rollupOptions: { input: { client: fileURLToPath(new URL("./src/entry-client.ts", import.meta.url)) } },
      },
  ssr: { noExternal: [/^@menu-studio\//] },
}));
