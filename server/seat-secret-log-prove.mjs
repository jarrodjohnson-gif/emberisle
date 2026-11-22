// #1236: a room file with a malformed seat must never print that seat's secret to the host log. The room is skipped as
// unreadable, and the log names the seat index and the failing field only.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
let host;
process.on("exit", () => {
  host?.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function fail(why, extra) {
  console.log("FAIL", why, extra ?? "");
  process.exit(1);
}

// Unique markers: any of them in the log means a secret leaked.
const SECRET_ID = "leak-marker-bad-id-7f3a91c2";
const SECRET_FIELD = "leak-marker-bad-secret-2b8e04d6";
const SECRET_GOOD = "leak-marker-good-seat-c19d55e0";
const seat = (over) => ({ id: "s0", name: "Ember", color: "ember", ready: true, pid: null, secret: SECRET_GOOD, ...over });
const room = (code, seats) => writeFileSync(path.join(ROOMS_DIR, `${code}.json`), JSON.stringify({ code, seats, game: null, savedAt: Date.now(), shape: 2 }));
// Seat 0 has a number for its id but a real string secret: the case from the issue.
room("SEC1", [seat({ id: 5, secret: SECRET_ID })]);
// Seat 1 has a good id but a secret that is not a string, holding a marker inside it; seat 0 is fine.
room("SEC2", [seat({}), seat({ id: "s1", name: "Tide", color: "tide", secret: { held: SECRET_FIELD } })]);

host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
let out = "";
let err = "";
host.stdout.on("data", (d) => (out += d));
host.stderr.on("data", (d) => (err += d));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("host never listened")), 10000);
  host.on("exit", (c) => reject(new Error(`host exited early (${c})`)));
  host.stdout.on("data", () => {
    if (/listening \d+/.test(out)) {
      clearTimeout(timer);
      resolve();
    }
  });
}).catch((e) => fail(e.message, err));
host.removeAllListeners("exit");
host.kill("SIGKILL");
await new Promise((r) => host.once("exit", r));

const log = out + err;
for (const marker of [SECRET_ID, SECRET_FIELD, SECRET_GOOD]) if (log.includes(marker)) fail(`a seat secret reached the host log (${marker})`, log);
if (!err.includes("unreadable room file: SEC1.json bad seat 0: id")) fail("SEC1 logged by seat index and field", err);
if (!err.includes("unreadable room file: SEC2.json bad seat 1: secret")) fail("SEC2 logged by seat index and field", err);
if (/restored .*SEC[12]/.test(out)) fail("a room with a malformed seat is not restored", out);
console.log("SEC1:", err.match(/unreadable room file: SEC1\.json[^\n]*/)?.[0]);
console.log("SEC2:", err.match(/unreadable room file: SEC2\.json[^\n]*/)?.[0]);
console.log(`seat-secret-log-prove ok: 2 malformed rooms skipped, 3 secret markers absent from ${log.length} bytes of host output`);
