import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const remote = readFileSync(join(root, "scripts/deploy/dilmune-remote.sh"), "utf8");
const deployWf = readFileSync(join(root, ".github/workflows/deploy-dilmune.yml"), "utf8");

test("dilmune remote deploy never uses destructive volume or seed commands", () => {
  const code = remote
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(code, /compose\s+down\s+-v/);
  assert.doesNotMatch(code, /git reset --hard/);
  assert.doesNotMatch(code, /volume rm/);
  assert.doesNotMatch(code, /run --rm seed/);
  assert.doesNotMatch(code, /compose run[^\n]*\bseed\b/);
  assert.match(remote, /ops\/\.env\.hosted/);
  assert.match(remote, /APPLY_HOSTED_CONFIG/);
});

test("deploy workflow is manual-only and does not push-to-production", () => {
  assert.match(deployWf, /workflow_dispatch/);
  assert.doesNotMatch(deployWf, /push:\s*\n\s+branches:/);
  assert.match(deployWf, /dilmune-production/);
  assert.doesNotMatch(deployWf, /down -v/);
  assert.doesNotMatch(deployWf, /git reset --hard/);
  assert.match(deployWf, /npm run build --workspace=@filspay\/web/);
  assert.match(deployWf, /npm run build --workspace=@filspay\/admin/);
  assert.match(deployWf, /VITE_BASE: \/admin\//);
});
