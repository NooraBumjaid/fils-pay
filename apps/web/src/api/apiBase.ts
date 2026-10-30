/**
 * Browser API origin for apps/web (dashboard + checkout).
 *
 * Hosted nginx proxies `/v1/` on the same origin. Production builds must
 * never call `localhost:3000` — that is the operator's laptop, not Dilmune.
 * Local `vite` still uses `http://localhost:3000` so existing CORS/dev
 * remains unchanged.
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
