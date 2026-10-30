import assert from "node:assert/strict";
import { test } from "node:test";
import { createFetchTransport } from "./transport.js";

test("createFetchTransport does not follow redirects", async () => {
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), redirect: init?.redirect });
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
  };
  const transport = createFetchTransport({
    nodeEnv: "production",
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn,
  });
  const result = await transport({
    url: "https://example.com/hook",
    headers: {},
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.redirect, "manual");
  assert.equal(result.statusCode, 302);
});

test("createFetchTransport refuses a production URL that rebinds to loopback before connecting", async () => {
  let fetched = false;
  const fetchFn: typeof fetch = async () => {
    fetched = true;
    return new Response("ok", { status: 200 });
  };
  const transport = createFetchTransport({
    nodeEnv: "production",
    lookup: async () => [{ address: "169.254.169.254", family: 4 }],
    fetchFn,
  });
  const result = await transport({
    url: "https://example.com/hook",
    headers: {},
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(fetched, false);
  assert.equal(result.statusCode, null);
  assert.equal(result.errorMessage, "destination_blocked");
});

test("createFetchTransport drops an oversized response body", async () => {
  const big = "x".repeat(70_000);
  const fetchFn: typeof fetch = async () =>
    new Response(big, { status: 200, headers: { "content-length": String(big.length) } });
  const transport = createFetchTransport({
    nodeEnv: "test",
    fetchFn,
    maxBodyBytes: 1024,
  });
  const result = await transport({
    url: "http://127.0.0.1:9/hook",
    headers: {},
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(result.statusCode, null);
  assert.equal(result.errorMessage, "response_too_large");
  assert.equal(result.body, "");
});

test("createFetchTransport caps a streaming body that omits content-length", async () => {
  const fetchFn: typeof fetch = async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("n".repeat(2048)));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
  const transport = createFetchTransport({
    nodeEnv: "test",
    fetchFn,
    maxBodyBytes: 512,
  });
  const result = await transport({
    url: "http://127.0.0.1:9/hook",
    headers: {},
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(result.statusCode, null);
  assert.equal(result.errorMessage, "response_too_large");
});

test("production connect-time lookup rejects DNS that flips to a private address", async () => {
  let n = 0;
  const transport = createFetchTransport({
    nodeEnv: "production",
    lookup: async () => {
      n += 1;
      return n === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    },
  });
  const result = await transport({
    url: "https://example.com/hook",
    headers: {},
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(result.statusCode, null);
  assert.match(result.errorMessage ?? "", /destination_blocked/);
  assert.ok(n >= 2);
});

test("createFetchTransport delivers to a public https destination", async () => {
  const fetchFn: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://example.com/hook");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual");
    return new Response("ok", { status: 200 });
  };
  const transport = createFetchTransport({
    nodeEnv: "production",
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchFn,
  });
  const result = await transport({
    url: "https://example.com/hook",
    headers: { "content-type": "application/json" },
    body: "{}",
    timeoutMs: 1000,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, "ok");
});
