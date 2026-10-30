import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

function stripLoopbackApiDefine(
  command: "build" | "serve",
  mode: string,
): Record<string, string> {
  if (command !== "build") return {};
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const key of ["VITE_API_BASE_URL", "VITE_ADMIN_API_BASE_URL", "VITE_WEB_BASE_URL"]) {
    const value = process.env[key] ?? env[key];
    if (value && LOOPBACK_ORIGIN.test(value.trim())) {
      define[`import.meta.env.${key}`] = "undefined";
    }
  }
  return define;
}

export default defineConfig(({ command, mode }) => ({
  // Hosted Nginx serves this app at /admin/. `vite build` must use that
  // base; `vite` (dev on :5174) stays at `/`. VITE_BASE overrides both.
  base: process.env.VITE_BASE ?? (command === "build" ? "/admin/" : "/"),
  plugins: [react()],
  define: stripLoopbackApiDefine(command, mode),
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
