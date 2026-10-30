import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { BadRequestError } from "../lib/errors.js";

/** Hard cap on bytes read from a webhook receiver. Timeouts do not bound size. */
export const WEBHOOK_MAX_RESPONSE_BYTES = 65_536;

const blockedV4 = new BlockList();
blockedV4.addSubnet("0.0.0.0", 8, "ipv4");
blockedV4.addSubnet("10.0.0.0", 8, "ipv4");
blockedV4.addSubnet("100.64.0.0", 10, "ipv4");
blockedV4.addSubnet("127.0.0.0", 8, "ipv4");
blockedV4.addSubnet("169.254.0.0", 16, "ipv4");
blockedV4.addSubnet("172.16.0.0", 12, "ipv4");
blockedV4.addSubnet("192.168.0.0", 16, "ipv4");
blockedV4.addSubnet("224.0.0.0", 4, "ipv4");
blockedV4.addAddress("255.255.255.255", "ipv4");

const blockedV6 = new BlockList();
blockedV6.addAddress("::1", "ipv6");
blockedV6.addSubnet("::", 128, "ipv6");
blockedV6.addSubnet("fc00::", 7, "ipv6");
blockedV6.addSubnet("fe80::", 10, "ipv6");
blockedV6.addSubnet("ff00::", 8, "ipv6");

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
]);

export type AddressLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const defaultAddressLookup: AddressLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((row) => ({ address: row.address, family: row.family }));
};

export function isUnsafeIp(address: string): boolean {
  const mapped = ipv4Mapped(address);
  if (mapped) return blockedV4.check(mapped, "ipv4");
  if (isIP(address) === 4) return blockedV4.check(address, "ipv4");
  if (isIP(address) === 6) return blockedV6.check(address, "ipv6");
  return true;
}

function ipv4Mapped(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice("::ffff:".length);
    return isIP(rest) === 4 ? rest : null;
  }
  return null;
}

/** Decimal/hex/short IPv4 forms that `isIP` does not parse as addresses. */
function hostLooksLikeNonCanonicalIp(hostname: string): boolean {
  if (isIP(hostname)) return false;
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-f.]+$/i.test(hostname)) return true;
  if (/^\d+\.\d+(\.\d+){0,2}$/.test(hostname)) return true;
  return false;
}

function hostIsBlockedByName(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal")) return true;
  if (host.endsWith(".local")) return true;
  return false;
}

export interface WebhookDestinationOptions {
  nodeEnv: "development" | "test" | "production";
  lookup?: AddressLookup;
}

/**
 * Scheme + public-destination checks.
 * Production: HTTPS and every resolved address must be globally routable.
 * Test/dev: keep http + loopback so locked local-receiver tests still pass.
 */
export async function assertSafeWebhookDestination(
  rawUrl: string,
  options: WebhookDestinationOptions,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestError("invalid_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestError("invalid_url");
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestError("invalid_url");
  }
  if (options.nodeEnv === "production" && parsed.protocol !== "https:") {
    throw new BadRequestError("invalid_url");
  }
  if (options.nodeEnv !== "production") {
    return parsed;
  }
  if (hostIsBlockedByName(parsed.hostname) || hostLooksLikeNonCanonicalIp(parsed.hostname)) {
    throw new BadRequestError("invalid_url");
  }
  if (isIP(parsed.hostname) && isUnsafeIp(parsed.hostname)) {
    throw new BadRequestError("invalid_url");
  }
  const lookup = options.lookup ?? defaultAddressLookup;
  let records: Array<{ address: string; family: number }>;
  try {
    records = isIP(parsed.hostname)
      ? [{ address: parsed.hostname, family: isIP(parsed.hostname) }]
      : await lookup(parsed.hostname);
  } catch {
    throw new BadRequestError("invalid_url");
  }
  if (records.length === 0 || records.some((row) => isUnsafeIp(row.address))) {
    throw new BadRequestError("invalid_url");
  }
  return parsed;
}
