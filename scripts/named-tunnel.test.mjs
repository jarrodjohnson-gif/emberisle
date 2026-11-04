// Local acceptance for #746. No Cloudflare account, credentials contents, or external tunnel is used.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const uuid = "12345678-abcd-1234-abcd-123456789abc";
const fixture = (t) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "emberisle named tunnel "));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const directory = path.join(temp, "saved config");
  const credentials = path.join(temp, `${uuid}.json`);
  writeFileSync(credentials, "fixture contents must never be printed");
  const env = { ...process.env, EMBERISLE_TUNNEL_DIR: directory, PORT: "" };
  const cli = (script, args, overrides = {}) => spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: "utf8", env: { ...env, ...overrides }, timeout: 10_000,
  });
  const setup = (...args) => cli("scripts/named-tunnel.mjs", ["--setup", ...args]);
  return { temp, directory, credentials, env, cli, setup };
};

test("setup writes bounded ingress, and separate launcher runs keep the exact HTTPS address", (t) => {
  const f = fixture(t);
  const configured = f.setup("play.example.com", uuid, "8799", f.credentials);
  assert.equal(configured.status, 0, configured.stderr);
  assert.match(configured.stdout, /cloudflared tunnel route dns 12345678-abcd-1234-abcd-123456789abc play\.example\.com/);
  const yaml = readFileSync(path.join(f.directory, "config.yml"), "utf8");
  assert.match(yaml, /hostname: "play\.example\.com"/);
  assert.match(yaml, /service: http:\/\/127\.0\.0\.1:8799\n  - service: http_status:404\n$/);
  assert.ok(yaml.includes(`credentials-file: ${JSON.stringify(f.credentials)}`));
  assert.ok(!yaml.includes("fixture contents"));
  for (let i = 0; i < 2; i++) {
    const printed = f.cli("scripts/night.mjs", ["--print"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.match(printed.stdout, /Permanent link:    https:\/\/play\.example\.com/);
    assert.match(printed.stdout, /127\.0\.0\.1:8799/);
    assert.match(printed.stdout, /node scripts\/named-tunnel\.mjs --run/);
    assert.doesNotMatch(printed.stdout, /trycloudflare|fixture contents/);
  }
  const mismatch = f.cli("scripts/night.mjs", ["--print"], { PORT: "8787" });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /must match.*8799/);
  assert.equal(mismatch.stdout, "");
  rmSync(f.credentials);
  const missing = f.cli("scripts/night.mjs", ["--print"]);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
});

test("missing configuration preserves quick mode; incomplete configuration fails closed", (t) => {
  const f = fixture(t);
  const quick = f.cli("scripts/night.mjs", ["--print"]);
  assert.equal(quick.status, 0, quick.stderr);
  assert.match(quick.stdout, /cloudflared tunnel --url http:\/\/127\.0\.0\.1:8787/);
  mkdirSync(f.directory);
  const broken = f.cli("scripts/night.mjs", ["--print"]);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /Cannot read saved/);
  assert.equal(broken.stdout, "");
});

test("invalid hostnames, UUIDs, ports and missing credentials leave no saved setup", (t) => {
  const f = fixture(t);
  for (const [host, id, port, credentials] of [
    ["https://play.example.com", uuid, "8787", f.credentials],
    ["abc.trycloudflare.com", uuid, "8787", f.credentials],
    ["127.0.0.1", uuid, "8787", f.credentials],
    ["play.example.com", "emberisle", "8787", f.credentials],
    ["play.example.com", uuid, "0", f.credentials],
    ["play.example.com", uuid, "65536", f.credentials],
    ["play.example.com", uuid, "8787", path.join(f.temp, "absent.json")],
  ]) {
    const result = f.setup(host, id, port, credentials);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(f.cli("scripts/night.mjs", ["--print"]).status, 0);
  }
});

test("saved setup cannot be overwritten, and modified ingress or JSON cannot become a quick URL", (t) => {
  const f = fixture(t);
  assert.equal(f.setup("play.example.com", uuid, "8787", f.credentials).status, 0);
  const settings = path.join(f.directory, "settings.json");
  const original = readFileSync(settings, "utf8");
  const repeated = f.setup("other.example.com", uuid, "8787", f.credentials);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /not overwritten/);
  assert.equal(readFileSync(settings, "utf8"), original);
  writeFileSync(path.join(f.directory, "config.yml"), "ingress: []\n");
  const changed = f.cli("scripts/night.mjs", ["--print"]);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /ingress differs/);
  assert.equal(changed.stdout, "");
  writeFileSync(settings, "invalid json");
  const invalid = f.cli("scripts/night.mjs", ["--print"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid named-tunnel settings JSON/);
});

test("run passes the explicit config and UUID without a shell or credential contents", { skip: process.platform === "win32" }, (t) => {
  const f = fixture(t);
  assert.equal(f.setup("play.example.com", uuid, "8787", f.credentials).status, 0);
  const bin = path.join(f.temp, "bin");
  mkdirSync(bin);
  const stub = path.join(bin, "cloudflared");
  writeFileSync(stub, '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.TUNNEL_TEST_CAPTURE, JSON.stringify(process.argv.slice(2)));\n');
  chmodSync(stub, 0o755);
  const capture = path.join(f.temp, "args.json");
  const run = f.cli("scripts/named-tunnel.mjs", ["--run"], {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`, TUNNEL_TEST_CAPTURE: capture,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), ["tunnel", "--config", path.join(f.directory, "config.yml"), "run", uuid]);
  assert.equal(run.stdout, "");
  assert.equal(run.stderr, "");
});
