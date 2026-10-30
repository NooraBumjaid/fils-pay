import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("hosted overlay unpublishes API port 3000 via !reset, not an empty ports list", () => {
  const overlay = readFileSync(join(root, "ops/docker-compose.hosted.yml"), "utf8");
  assert.match(overlay, /ports:\s*!reset\s*\[\]/);
  assert.doesNotMatch(overlay, /^[ \t]+ports:\s*\[\s*\]\s*$/m);
  assert.match(overlay, /mem_limit:\s*512m/);
  assert.match(overlay, /cpus:\s*"0\.50"/);
  assert.match(overlay, /cpus:\s*"0\.20"/);
});

test("hosted nginx splits admin SPA from merchant SPA and rate-limits /v1/", () => {
  const nginx = readFileSync(join(root, "ops/nginx.hosted.conf"), "utf8");
  assert.match(nginx, /limit_req_zone/);
  assert.match(nginx, /location \/v1\//);
  assert.match(nginx, /limit_req /);
  assert.match(nginx, /location \/admin\//);
  assert.match(nginx, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/admin\/index\.html;/);
  assert.match(nginx, /root \/usr\/share\/nginx\/html\/web;/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/);
  const adminIdx = nginx.indexOf("location /admin/");
  const rootIdx = nginx.indexOf("location / {");
  assert.ok(adminIdx > 0 && rootIdx > adminIdx, "location /admin/ must precede location /");
});
