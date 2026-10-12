import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Every Phosphor icon ships six drawings (one per weight). The app only uses
 * "regular", "bold" and "fill", so the other three are dropped at build time,
 * which roughly halves the icons' share of the bundle. Each weight is a
 * top-level `[ "name", ... ]` entry in the icon's `defs` Map, closed by a
 * two-space-indented `]`; anything deeper is indented further.
 */
function phosphorWeights(): Plugin {
  const unused = /\n {2}\[\n {4}"(?:duotone|light|thin)",\n[\s\S]*?\n {2}\],?(?=\n)/g;
  return {
    name: "phosphor-weights",
    enforce: "pre",
    transform(code, id) {
      if (!/@phosphor-icons\/react\/dist\/defs\/[^/]+\.es\.js$/.test(id)) return null;
      return { code: code.replace(unused, ""), map: null };
    },
  };
}

export default defineConfig({
  plugins: [phosphorWeights(), react(), tailwindcss()],
  build: { outDir: "dist/client", emptyOutDir: true, sourcemap: false },
  server: {
    // `npm run dev:client` proxies API calls to a running `wrangler dev`.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
