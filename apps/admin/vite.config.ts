import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Hosted Nginx serves this app at /admin/. `vite build` must use that
  // base; `vite` (dev on :5174) stays at `/`. VITE_BASE overrides both.
  base: process.env.VITE_BASE ?? (command === "build" ? "/admin/" : "/"),
  plugins: [react()],
  server: {
    // apps/web already owns 5173.
    // 5174 clashes with storybook on my machine — am
    port: 5174,
    host: true,
    proxy: {
      "/v1": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/readyz": "http://127.0.0.1:3000",
    },
  },
}));
