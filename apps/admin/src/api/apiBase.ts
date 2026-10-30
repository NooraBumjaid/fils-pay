/**
 * Browser API / merchant-dashboard origins for apps/admin.
 *
 * Hosted nginx proxies `/v1/` on the same origin. Production builds must
 * never call `localhost:3000` or open impersonation at `localhost:5173`.
 * Local `vite` still uses those loopback defaults.
 */

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

export function resolveProductionApiBase(explicit: string | undefined): string {
  const raw = (explicit ?? "").trim();
  if (raw === "" || raw === "/") return "";
  if (LOOPBACK_ORIGIN.test(raw)) return "";
  return raw.replace(/\/$/, "");
}

export function resolveDevApiBase(explicit: string | undefined): string {
  const raw = (explicit ?? "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function resolveProductionWebBase(explicit: string | undefined): string {
  const raw = (explicit ?? "").trim();
  if (raw === "" || LOOPBACK_ORIGIN.test(raw)) return "/";
  return raw.replace(/\/$/, "") || "/";
}

export function resolveDevWebBase(explicit: string | undefined): string {
  const raw = (explicit ?? "").trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://localhost:5173";
}
