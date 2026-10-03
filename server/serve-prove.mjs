// #116: host.mjs serves the built client next to the socket and the avatars, so one address (and one tunnel)
// carries all three. Also checks hostUrl dials the page's own origin in a built client, and :8787 only in dev.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { hostUrl } from "../src/lib/net/table.ts";

const hosts = [];
process.on("exit", () => hosts.forEach((h) => h.kill()));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const temp = mkdtempSync(path.join(tmpdir(), "emberisle-dist-"));
function done(code) {
  for (const h of hosts) h.kill();
  rmSync(temp, { recursive: true, force: true });
  process.exit(code);
}
function fail(why) {
  console.log("FAIL", why);
  done(1);
}
function check(line, ok) {
  console.log(line.padEnd(56), ok ? "" : "<- wrong");
  if (!ok) fail(line);
}

async function start(dist) {
  const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", DIST: dist, ROOMS_DIR: path.join(temp, "rooms") },
  });
  hosts.push(host);
  return new Promise((resolve) =>
    host.stdout.on("data", (d) => {
      const m = String(d).match(/listening (\d+)/);
      if (m) resolve(Number(m[1]));
    }),
  );
}

// node:http sends the path exactly as given; fetch would normalise the dot segments away.
function get(port, p, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

// #368: a raw socket, since node:http and fetch would refuse or normalise these request targets before sending.
function raw(port, target) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let text = "";
    sock.on("data", (d) => (text += d));
    sock.on("error", () => {});
    sock.on("close", () => resolve(Number(text.match(/^HTTP\/1\.1 (\d{3})/)?.[1]) || null));
  });
}

const dist = path.join(temp, "dist");
mkdirSync(path.join(dist, "assets"), { recursive: true });
writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Emberisle</title>");
writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");
writeFileSync(path.join(temp, "secret.txt"), "outside dist");
const empty = path.join(temp, "empty");
mkdirSync(empty);

const port = await start(dist);
hosts[0].on("exit", (code) => fail(`host exited (${code})`));

// These run first, so every check below also proves the same host process survived them.
for (const [target, want] of [["//", 400], ["//[", 400], ["//a b", 400], ["http://[", 400], ["/%", 404], ["http://x//", 404]]) {
  const status = await raw(port, target);
  check(`raw GET ${target} -> ${status}`, status === want);
}

let r = await get(port, "/");
check(`GET / -> ${r.status} ${r.headers["content-type"]}, ${r.headers["cache-control"]}`,
  r.status === 200 && r.headers["content-type"].startsWith("text/html") && r.headers["cache-control"] === "no-cache"
    && r.headers["x-content-type-options"] === "nosniff" && r.body.includes("Emberisle"));
r = await get(port, "/assets/app-abc123.js");
check(`GET /assets/app-abc123.js -> ${r.status} ${r.headers["content-type"]}, immutable`,
  r.status === 200 && r.headers["content-type"] === "text/javascript" && r.headers["cache-control"].includes("immutable"));
r = await get(port, "/assets/app-abc123.js", "HEAD");
check(`HEAD /assets/app-abc123.js -> ${r.status}, empty body`, r.status === 200 && r.body === "");
for (const p of ["/assets/missing.js", "/assets", "/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt",
  "/%00", "/%E0%A4%A"]) {
  r = await get(port, p);
  check(`GET ${p} -> ${r.status}`, r.status === 404 && !r.body.includes("outside dist"));
}
r = await get(port, "/", "POST");
check(`POST / -> ${r.status}`, r.status === 404);

r = await get(port, "/avatars", "POST", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
const { url: avatarUrl } = JSON.parse(r.body);
const first = r.status;
r = await get(port, avatarUrl);
check(`POST /avatars then GET it -> ${first}, ${r.status}`, first === 200 && r.status === 200);

const welcome = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on("open", () => ws.send(JSON.stringify({ type: "create", name: "Ember" })));
  ws.on("message", (m) => {
    const msg = JSON.parse(m);
    if (msg.type === "welcome") {
      ws.close();
      resolve(msg);
    }
  });
  ws.on("error", reject);
  setTimeout(() => reject(new Error("no welcome")), 5000);
}).catch((e) => fail(e.message));
check(`WS on the same port -> welcome ${welcome.code}`, /^[A-Z2-9]{4}$/.test(welcome.code));

const bare = await start(empty);
r = await get(bare, "/");
check(`host with DIST=<empty dir>: GET / -> ${r.status}`, r.status === 503 && r.body.includes("npm run build"));

const loc = (href) => {
  const u = new URL(href);
  return { protocol: u.protocol, hostname: u.hostname, host: u.host, search: u.search };
};
for (const [href, dev, want] of [
  ["https://abc.trycloudflare.com/", false, "wss://abc.trycloudflare.com"],
  ["http://192.168.1.20:8787/", false, "ws://192.168.1.20:8787"],
  ["http://localhost:8080/", true, "ws://localhost:8787"],
  ["http://localhost:8080/?host=ws://x:1", false, "ws://x:1"],
]) {
  const got = hostUrl(loc(href), dev);
  check(`hostUrl ${href}${dev ? " (dev)" : ""} -> ${got}`, got === want);
}
check(`hostUrl default dev under node -> ${hostUrl(loc("http://h:9/"))}`, hostUrl(loc("http://h:9/")) === "ws://h:9");

console.log("serve prove ok");
done(0);
