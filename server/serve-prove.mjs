// #116: host.mjs serves the built client next to the socket and the avatars, so one address (and one tunnel)
// carries all three. Also checks hostUrl dials the page's own origin in a built client, and :8787 only in dev.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    // #369: a short lobby hold so a stranger's table drops within the proof, and a store small enough to fill.
    env: { ...process.env, PORT: "0", DIST: dist, ROOMS_DIR: path.join(temp, "rooms"), LOBBY_HOLD_MS: "300", AVATAR_MAX: "2", AVATAR_STORE_BYTES: "1000" },
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
function get(port, p, method = "GET", body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers }, (res) => {
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

// A socket that sits down (hello) and can wait for one message of a type.
function seat(hello) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on("message", (m) => {
    inbox.push(JSON.parse(m));
    for (const w of waiters.splice(0)) w();
  });
  ws.on("error", (e) => fail(e.message));
  ws.on("open", () => ws.send(JSON.stringify(hello)));
  const next = async (type, where = () => true) => {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type && where(m));
      if (i >= 0) return inbox.splice(i, 1)[0];
      await new Promise((res, rej) => {
        waiters.push(res);
        setTimeout(() => rej(new Error(`waited for ${type}`)), 5000);
      }).catch((e) => fail(e.message));
    }
  };
  return { ws, inbox, next };
}
// A picture is `size` bytes starting with the JPEG marker; `with` carries the seat's secret from its welcome.
const jpeg = (size) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size - 3)]);
const upload = (body, secret) => get(port, "/avatars", "POST", body, secret ? { "x-seat-secret": secret } : {});

const a = seat({ type: "create", name: "Ember" });
const welcome = await a.next("welcome");
check(`WS on the same port -> welcome ${welcome.code}`, /^[A-Z2-9]{4}$/.test(welcome.code) && typeof welcome.secret === "string");

// #369: only a seated player uploads, with the secret from their welcome; the picture is then that seat's own.
r = await upload(jpeg(600));
const noSecret = r.status;
r = await upload(jpeg(600), "not-a-secret");
check(`POST /avatars with no secret, then a wrong one -> ${noSecret}, ${r.status}`, noSecret === 403 && r.status === 403);
r = await upload(jpeg(600), welcome.secret);
check(`POST /avatars with the seat's secret -> ${r.status}`, r.status === 200);
const aPic = JSON.parse(r.body);
const seen = await a.next("seats", (m) => m.seats[0].url === aPic.url);
check(`seats then shows ${aPic.url} on the uploader`, seen.seats[0].avatarId === aPic.avatarId);
r = await get(port, aPic.url);
check(`GET ${aPic.url} -> ${r.status} ${r.headers["content-type"]}, nosniff`,
  r.status === 200 && r.headers["content-type"] === "image/jpeg" && r.headers["x-content-type-options"] === "nosniff");
r = await upload(Buffer.alloc(100), welcome.secret);
check(`POST /avatars with bytes that are not a JPEG -> ${r.status}`, r.status === 400);

// The store holds AVATAR_MAX pictures and AVATAR_STORE_BYTES in all; one picture per seat, a new one replaces the old.
const b = seat({ type: "hello", code: welcome.code, name: "Tide" });
const bWelcome = await b.next("welcome");
r = await upload(jpeg(600), bWelcome.secret);
check(`second seat's 600 B over a 1000 B store -> ${r.status}`, r.status === 503);
r = await upload(jpeg(300), bWelcome.secret);
check(`second seat's 300 B -> ${r.status}`, r.status === 200);
const bPic = JSON.parse(r.body);
const c = seat({ type: "hello", code: welcome.code, name: "Moss" });
const cWelcome = await c.next("welcome");
r = await upload(jpeg(50), cWelcome.secret);
check(`third seat's 50 B over AVATAR_MAX=2 -> ${r.status}`, r.status === 503);
r = await upload(jpeg(100), welcome.secret);
const replaced = JSON.parse(r.body);
const old = await get(port, aPic.url);
check(`uploader replaces its picture -> ${r.status}; old url -> ${old.status}`, r.status === 200 && old.status === 404 && replaced.url !== aPic.url);

// A stranger peeks the table, hellos with a seat's avatarId, and drops: the picture stays with its seat (#369).
const stranger = seat({ type: "peek", code: welcome.code });
const peeked = await stranger.next("seats");
check(`stranger peeks -> sees ${peeked.seats[0].avatarId}`, peeked.seats[0].avatarId === replaced.avatarId);
stranger.ws.send(JSON.stringify({ type: "hello", name: "Grab", avatarId: replaced.avatarId }));
const grab = await stranger.next("welcome");
const grabSeats = await stranger.next("seats");
check(`stranger hellos with that avatarId -> seat shows ${grabSeats.seats[0].avatarId}`, grabSeats.seats[0].avatarId === null);
stranger.ws.close();
const grabFile = path.join(temp, "rooms", `${grab.code}.json`);
const until = Date.now() + 5000;
while (existsSync(grabFile) && Date.now() < until) await new Promise((res) => setTimeout(res, 25));
check(`stranger's table ${grab.code} dropped after the lobby hold`, !existsSync(grabFile));
r = await get(port, replaced.url);
check(`GET ${replaced.url} after that -> ${r.status}`, r.status === 200);

// A seat that is let go takes its picture with it, which frees the slot. Every seats message between Tide sitting
// and Tide's let-go lists Tide, so with the older ones cleared, the first without Tide is the let-go.
a.inbox.length = 0;
b.ws.close();
await a.next("seats", (m) => !m.seats.some((s) => s.name === "Tide"));
r = await get(port, bPic.url);
check(`seat let go: GET ${bPic.url} -> ${r.status}`, r.status === 404);
r = await upload(jpeg(50), cWelcome.secret);
check(`third seat's 50 B into the freed slot -> ${r.status}`, r.status === 200);
for (const s of [a, c]) s.ws.close();

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
