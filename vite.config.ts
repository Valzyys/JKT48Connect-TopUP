import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/client", emptyOutDir: true, sourcemap: false },
  server: {
    // `npm run dev:client` proxies API calls to a running `wrangler dev`.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
