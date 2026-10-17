import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PRODUCT = process.env.PRODUCT || "codex";
const PORTS: Record<string, number> = { codex: 8787, claude: 8788, muse: 8789, grok: 8790 };
const FE_PORTS: Record<string, number> = { codex: 5175, claude: 5176, muse: 5177, grok: 5178 };
const target = `http://localhost:${PORTS[PRODUCT] || 8787}`;

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_PRODUCT": JSON.stringify(PRODUCT) },
  server: {
    port: FE_PORTS[PRODUCT] || 5175,
    proxy: {
      "/api": { target, changeOrigin: true },
      "/preview": { target, changeOrigin: true },
      "/shots": { target, changeOrigin: true },
    },
  },
});
