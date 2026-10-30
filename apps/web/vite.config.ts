import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

/** Hosted nginx already proxies `/v1/` same-origin. A loopback VITE_*
 *  baked into `vite build` would make Dilmune's browser call the operator's
 *  laptop. Dev `vite` still uses localhost via resolveDevApiBase. */
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
  plugins: [react()],
  define: stripLoopbackApiDefine(command, mode),
  // FH: a proxy to :3000 would avoid the CORS/cookie dance, claude suggested it
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/v1": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/readyz": "http://127.0.0.1:3000",
    },
  },
}));
