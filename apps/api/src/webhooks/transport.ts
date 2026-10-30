/**
 * The injectable HTTP send — `runDispatchPass` and everything it calls take
 * a `WebhookTransport` as an explicit parameter, never calling `fetch`
 * directly deep inside dispatch logic. Same "pass the effectful dependency
 * in" shape as `AcquirerSimulator`.
 */

import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { BadRequestError } from "../lib/errors.js";
import {
  WEBHOOK_MAX_RESPONSE_BYTES,
  assertSafeWebhookDestination,
  defaultAddressLookup,
  isUnsafeIp,
  type AddressLookup,
} from "./destination.js";

/**
 * @property timeoutMs Covers the whole exchange including reading the body (the abort
 *  signal stays armed until the body has been read).
 */
export interface WebhookTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface WebhookTransportResponse {
  /** null on a transport-level failure (timeout, DNS, connection refused —
   *  never reached the receiver) */
  statusCode: number | null;
  /** "" on a transport-level failure */
  body: string;
  /** present iff statusCode is null */
  errorMessage?: string;
}

export type WebhookTransport = (req: WebhookTransportRequest) => Promise<WebhookTransportResponse>;

export interface FetchTransportOptions {
  nodeEnv?: "development" | "test" | "production";
  lookup?: AddressLookup;
  maxBodyBytes?: number;
  fetchFn?: typeof fetch;
}

/** Real transport: Node's global fetch with an AbortController-driven
 *  timeout, used by index.ts's production wiring. */
export function createFetchTransport(options: FetchTransportOptions = {}): WebhookTransport {
  const nodeEnv = options.nodeEnv ?? "test";
  const maxBodyBytes = options.maxBodyBytes ?? WEBHOOK_MAX_RESPONSE_BYTES;
  const lookup = options.lookup ?? defaultAddressLookup;
  const fetchFn = options.fetchFn;
  // Production uses http(s).request with a pinned lookup so a DNS change
  // between the pre-flight check and connect cannot reach a private IP.
  // Test/dev keep fetch so locked http://127.0.0.1 receiver tests still work.
  const pinLookup = nodeEnv === "production";

  return async (req: WebhookTransportRequest): Promise<WebhookTransportResponse> => {
    try {
      await assertSafeWebhookDestination(req.url, { nodeEnv, lookup });
    } catch (err) {
      return {
        statusCode: null,
        body: "",
        errorMessage: err instanceof BadRequestError ? "destination_blocked" : String(err),
      };
    }

    if (fetchFn) {
      return sendWithFetch(req, fetchFn, maxBodyBytes);
    }
    return sendWithNodeHttp(req, { maxBodyBytes, lookup, pinLookup });
  };
}

async function sendWithFetch(
  req: WebhookTransportRequest,
  fetchFn: typeof fetch,
  maxBodyBytes: number,
): Promise<WebhookTransportResponse> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), req.timeoutMs);
  try {
    const response = await fetchFn(req.url, {
      method: "POST",
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
      redirect: "manual",
    });
    const body = await readBodyCapped(response, maxBodyBytes);
    if (body === null) {
      return { statusCode: null, body: "", errorMessage: "response_too_large" };
    }
    return { statusCode: response.status, body };
  } catch (err) {
    return {
      statusCode: null,
      body: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function sendWithNodeHttp(
  req: WebhookTransportRequest,
  options: { maxBodyBytes: number; lookup: AddressLookup; pinLookup: boolean },
): Promise<WebhookTransportResponse> {
  const url = new URL(req.url);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: WebhookTransportResponse): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const request = lib.request(
      url,
      {
        method: "POST",
        headers: req.headers,
        timeout: req.timeoutMs,
        lookup: options.pinLookup ? pinnedLookup(options.lookup) : undefined,
      },
      (response) => {
        void readIncomingCapped(response, options.maxBodyBytes).then((body) => {
          if (body === null) {
            response.destroy();
            done({ statusCode: null, body: "", errorMessage: "response_too_large" });
            return;
          }
          done({ statusCode: response.statusCode ?? 0, body });
        });
      },
    );
    request.on("timeout", () => {
      request.destroy();
      done({ statusCode: null, body: "", errorMessage: "timeout" });
    });
    request.on("error", (err: Error) => {
      done({ statusCode: null, body: "", errorMessage: err.message });
    });
    request.write(req.body);
    request.end();
  });
}

function pinnedLookup(lookup: AddressLookup): (
  hostname: string,
  options: unknown,
  callback: (err: Error | null, address: string, family: number) => void,
) => void {
  return (hostname, options, callback) => {
    const cb =
      typeof options === "function"
        ? (options as (err: Error | null, address: string, family: number) => void)
        : callback;
    void lookup(hostname)
      .then((records) => {
        if (records.length === 0 || records.some((row) => isUnsafeIp(row.address))) {
          cb(new Error("destination_blocked"), "", 4);
          return;
        }
        const chosen = records[0]!;
        cb(null, chosen.address, chosen.family);
      })
      .catch((err: unknown) => {
        cb(err instanceof Error ? err : new Error(String(err)), "", 4);
      });
  };
}

async function readIncomingCapped(response: IncomingMessage, maxBodyBytes: number): Promise<string | null> {
  const declared = Number(response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    response.destroy();
    return null;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBodyBytes) {
      response.destroy();
      return null;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBodyCapped(response: Response, maxBodyBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    return null;
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
