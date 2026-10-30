import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function jsAssets(distDir: string): string[] {
  const assets = join(distDir, "assets");
  if (!existsSync(assets)) return [];
  return readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => join(assets, name));
}

function assertDistHasNoLoopbackApi(distDir: string, label: string): void {
  const files = jsAssets(distDir);
  assert.ok(files.length > 0, `${label}: expected hashed JS under assets/`);
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    assert.doesNotMatch(
      body,
      /https?:\/\/localhost:3000/i,
      `${file} must not call http://localhost:3000`,
    );
    assert.doesNotMatch(
      body,
      /https?:\/\/127\.0\.0\.1:3000/i,
      `${file} must not call http://127.0.0.1:3000`,
    );
  }
}

test("production SPA dist JS does not reference loopback API", () => {
  const webDist = join(root, "apps/web/dist");
  const adminDist = join(root, "apps/admin/dist");
  assert.ok(existsSync(join(webDist, "index.html")), "run vite build for @filspay/web first");
  assert.ok(existsSync(join(adminDist, "index.html")), "run vite build for @filspay/admin first");
  assertDistHasNoLoopbackApi(webDist, "web");
  assertDistHasNoLoopbackApi(adminDist, "admin");
});

test("hosted nginx proxies /v1/ to the internal API without rewriting the path", () => {
  const nginx = readFileSync(join(root, "ops/nginx.hosted.conf"), "utf8");
  const start = nginx.indexOf("location /v1/ {");
  assert.ok(start >= 0, "missing location /v1/");
  const end = nginx.indexOf("\n    }", start);
  const block = nginx.slice(start, end);
  assert.match(block, /proxy_pass http:\/\/api:3000;/);
  assert.doesNotMatch(block, /proxy_pass http:\/\/api:3000\//);
  assert.match(block, /proxy_set_header Cookie \$http_cookie;/);
});
