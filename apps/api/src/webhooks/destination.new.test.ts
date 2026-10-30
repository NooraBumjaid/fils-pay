import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestError } from "../lib/errors.js";
import {
  assertSafeWebhookDestination,
  isUnsafeIp,
  type AddressLookup,
} from "./destination.js";

const publicLookup: AddressLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("isUnsafeIp flags loopback, RFC1918, link-local, and CGNAT", () => {
  assert.equal(isUnsafeIp("127.0.0.1"), true);
  assert.equal(isUnsafeIp("10.1.2.3"), true);
  assert.equal(isUnsafeIp("192.168.0.9"), true);
  assert.equal(isUnsafeIp("172.16.0.1"), true);
  assert.equal(isUnsafeIp("169.254.169.254"), true);
  assert.equal(isUnsafeIp("100.64.1.1"), true);
  assert.equal(isUnsafeIp("::1"), true);
  assert.equal(isUnsafeIp("::ffff:127.0.0.1"), true);
  assert.equal(isUnsafeIp("93.184.216.34"), false);
});

test("test env still accepts a local http receiver (locked webhook tests)", async () => {
  const url = await assertSafeWebhookDestination("http://127.0.0.1:9/hook", { nodeEnv: "test" });
  assert.equal(url.hostname, "127.0.0.1");
});

test("production rejects http, loopback, private, metadata host, and userinfo", async () => {
  await assert.rejects(
    () => assertSafeWebhookDestination("http://example.com/hook", { nodeEnv: "production", lookup: publicLookup }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://127.0.0.1/hook", { nodeEnv: "production" }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://10.0.0.8/hook", { nodeEnv: "production" }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://169.254.169.254/hook", { nodeEnv: "production" }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://localhost/hook", { nodeEnv: "production", lookup: publicLookup }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://user:pass@example.com/hook", { nodeEnv: "production", lookup: publicLookup }),
    (err: unknown) => err instanceof BadRequestError,
  );
});

test("production accepts an https URL whose DNS is a public address", async () => {
  const url = await assertSafeWebhookDestination("https://example.com/hook", {
    nodeEnv: "production",
    lookup: publicLookup,
  });
  assert.equal(url.hostname, "example.com");
});

test("production rejects DNS that resolves to a private address (rebinding)", async () => {
  const rebind: AddressLookup = async () => [{ address: "127.0.0.1", family: 4 }];
  await assert.rejects(
    () => assertSafeWebhookDestination("https://example.com/hook", { nodeEnv: "production", lookup: rebind }),
    (err: unknown) => err instanceof BadRequestError,
  );
});

test("production rejects mixed public+private DNS answers", async () => {
  const mixed: AddressLookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.4", family: 4 },
  ];
  await assert.rejects(
    () => assertSafeWebhookDestination("https://example.com/hook", { nodeEnv: "production", lookup: mixed }),
    (err: unknown) => err instanceof BadRequestError,
  );
});

test("production rejects decimal and short IPv4 hostnames", async () => {
  await assert.rejects(
    () => assertSafeWebhookDestination("https://2130706433/hook", { nodeEnv: "production" }),
    (err: unknown) => err instanceof BadRequestError,
  );
  await assert.rejects(
    () => assertSafeWebhookDestination("https://127.1/hook", { nodeEnv: "production" }),
    (err: unknown) => err instanceof BadRequestError,
  );
});
