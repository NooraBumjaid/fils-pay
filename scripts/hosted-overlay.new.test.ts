import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("hosted overlay unpublishes API port 3000 via !override, not an empty ports list", () => {
  const overlay = readFileSync(join(root, "ops/docker-compose.hosted.yml"), "utf8");
  assert.match(overlay, /ports:\s*!override\s*\[\]/);
  assert.doesNotMatch(overlay, /^[ \t]+ports:\s*\[\s*\]\s*$/m);
  assert.match(overlay, /command:\s*\[\s*"daemon"\s*\]/);
  assert.match(overlay, /mem_limit:\s*512m/);
  assert.match(overlay, /cpus:\s*"0\.50"/);
  assert.match(overlay, /cpus:\s*"0\.20"/);
  assert.match(overlay, /CHECKOUT_BASE_URL: \$\{CHECKOUT_BASE_URL:\?/);
  assert.doesNotMatch(overlay, /CHECKOUT_BASE_URL: \$\{CHECKOUT_BASE_URL:-http:\/\/localhost/);
});

test("hosted nginx splits admin SPA from merchant SPA and rate-limits /v1/", () => {
  const nginx = readFileSync(join(root, "ops/nginx.hosted.conf"), "utf8");
  assert.match(nginx, /limit_req_zone/);
  assert.match(nginx, /location \/v1\//);
  assert.match(nginx, /limit_req /);
  assert.match(nginx, /location \/admin\//);
  assert.match(nginx, /location \/healthz/);
  assert.match(nginx, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/admin\/index\.html;/);
  assert.match(nginx, /root \/usr\/share\/nginx\/html\/web;/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/);
  const adminIdx = nginx.indexOf("location /admin/");
  const rootIdx = nginx.indexOf("location / {");
  assert.ok(adminIdx > 0 && rootIdx > adminIdx, "location /admin/ must precede location /");
});

test("hosted nginx redirects exact / to /dashboard/login without capturing /pay or /admin", () => {
  const nginx = readFileSync(join(root, "ops/nginx.hosted.conf"), "utf8");
  const exactRoot = nginx.indexOf("location = / {");
  const dashboardLogin = nginx.indexOf("return 302 /dashboard/login;");
  const catchAll = nginx.indexOf("location / {");
  assert.ok(exactRoot > 0, "missing location = /");
  assert.ok(dashboardLogin > exactRoot, "302 must sit inside the exact-/ block");
  assert.ok(catchAll > dashboardLogin, "location = / must precede location /");
  assert.match(nginx, /\/pay\/:token/);
  assert.doesNotMatch(nginx, /location = \/pay/);
  assert.match(nginx, /location \/admin\//);
  assert.match(nginx, /location \/v1\//);
  assert.match(nginx, /location \/healthz/);
});
