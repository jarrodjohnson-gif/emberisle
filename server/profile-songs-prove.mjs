// #1043: real-host owner selection, persistence and private projections. No playback or custom binding.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { PROFILE_SONGS } from "../src/lib/profile-songs.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-songs-"));
const sockets = new Set();
let host;
process.on("exit", () => { host?.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });
setTimeout(() => { console.error("profile songs proof timed out"); process.exit(1); }, 120000).unref();
const file = path.join(dir, "profiles", "profiles.json");
let passed = 0;
function check(name, condition) { assert.ok(condition, name); console.log("ok", name); passed++; }
async function start() {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "0", PROFILES_DEV: "1", PROFILES_DIR: path.join(dir, "profiles"), ROOMS_DIR: path.join(dir, "rooms"), RESULTS_DIR: path.join(dir, "results") },
  });
  let log = "";
  host.stderr.on("data", (b) => { log += b; });
  return await new Promise((resolve, reject) => {
    host.stdout.on("data", (b) => { const m = String(b).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.once("exit", (code) => reject(new Error(`host exited ${code}: ${log}`)));
  });
}
async function stop() {
  for (const ws of sockets) ws.terminate();
  sockets.clear();
  await new Promise((resolve) => { host.once("exit", resolve); host.kill("SIGTERM"); });
  host = null;
}
async function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: `http://127.0.0.1:${port}` });
  sockets.add(ws);
  const frames = [];
  ws.on("message", (raw) => frames.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let seq = 0;
  async function next(predicate) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const i = frames.findIndex(predicate);
      if (i >= 0) return frames.splice(i, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timed out waiting for host reply");
  }
  return { ws, frames, next, async req(msg) { const id = ++seq; ws.send(JSON.stringify({ ...msg, id })); return next((m) => m.id === id); } };
}
const create = (login) => ({ type: "profileCreate", login, displayName: login, pin: "4821", pinConfirm: "4821", color: "#2d6ee8", winSongId: "isaac-win" });
const song = PROFILE_SONGS[0];
check("approved catalogue contains one readable long-song entry with a real asset", PROFILE_SONGS.length === 1 && song.label.length > 0 && readFileSync(new URL(`../public${song.asset}`, import.meta.url)).length > 0);
let port = await start();
let a = await client(port);
const A = await a.req(create("song-one"));
let b = await client(port);
const B = await b.req(create("song-two"));
check("creation ignores requested song and defaults both owners to null", A.type === "profileSession" && B.type === "profileSession" && A.profile.winSongId === null && B.profile.winSongId === null);
const unsigned = await client(port);
check("login leaves an unassigned profile unassigned", (await unsigned.req({ type: "profileLogin", login: "song-two", pin: "4821" })).profile?.winSongId === null);
const edit = (c, credential, fields) => c.req({ type: "profileEdit", credential, ...fields });
check("owner can explicitly select an approved ID", (await edit(a, A.credential, { winSongId: song.id })).profile?.winSongId === song.id);
check("another owner may select the same shared song", (await edit(b, B.credential, { winSongId: song.id })).profile?.winSongId === song.id);
check("display and login rename preserve selection", (await edit(a, A.credential, { displayName: "Renamed", login: "song-renamed", pin: "4821" })).profile?.winSongId === song.id);
check("clear restores null", (await edit(b, B.credential, { winSongId: null })).profile?.winSongId === null);
// Each socket starts with ten burst tokens; separate authenticated connections avoid turning validation checks into rate tests.
for (const value of ["/audio/isaac_win.mp3", "https://example.test/song.mp3", "../isaac_win.mp3", "removed-song", {}, 42]) {
  const c = await client(port);
  const reply = await edit(c, A.credential, { winSongId: value, displayName: "Must not commit" });
  const unchanged = await c.req({ type: "profileResume", credential: A.credential });
  check(`rejects ${typeof value === "string" ? value : typeof value} atomically`, reply.type === "profileError" && reply.code === "invalid" && unchanged.profile?.displayName === "Renamed" && unchanged.profile?.winSongId === song.id);
}
const c = await client(port);
check("missing foreign credential is refused", (await edit(c, "not-an-owner-token", { profileId: A.profile.profileId, winSongId: null })).code === "signedOut");
check("a foreign target field cannot redirect the authenticated owner's edit", (await edit(c, B.credential, { profileId: A.profile.profileId, winSongId: null })).profile?.profileId === B.profile.profileId);
const targetAfter = await a.req({ type: "profileResume", credential: A.credential });
check("target owner's selected song and name are unchanged", targetAfter.profile?.displayName === "Renamed" && targetAfter.profile?.winSongId === song.id);
const table = await client(port);
table.ws.send(JSON.stringify({ type: "hello", name: "Player", credential: A.credential }));
const welcome = await table.next((m) => m.type === "welcome");
const seats = await table.next((m) => m.type === "seats");
const card = await table.req({ type: "tableProfileCard", profileId: A.profile.profileId });
check("selected owner can still join and read its public card", welcome.type === "welcome" && card.card?.profileId === A.profile.profileId);
check("seats and cards contain no song IDs or media fields", !/winSongId|mediaKey|isaac-win|isaac_win/.test(JSON.stringify([welcome, seats, card])));
await stop();
port = await start();
a = await client(port);
const login = await a.req({ type: "profileLogin", login: "song-renamed", pin: "4821" });
check("real restart and login preserve explicit selection", login.profile?.winSongId === song.id);
b = await client(port);
check("restart preserves clear", (await b.req({ type: "profileResume", credential: B.credential })).profile?.winSongId === null);
await stop();
const doc = JSON.parse(readFileSync(file, "utf8"));
doc.profiles[A.profile.profileId].winSongId = "catalogue-entry-removed";
writeFileSync(file, JSON.stringify(doc));
port = await start();
a = await client(port);
check("a removed stored catalogue entry falls back without making profiles unavailable", (await a.req({ type: "profileHello" })).available === true && (await a.req({ type: "profileResume", credential: login.credential })).profile?.winSongId === null);
check("an unrelated edit remains possible after catalogue removal", (await edit(a, login.credential, { catchphrase: "Still playing" })).profile?.winSongId === null);
const fallbackTable = await client(port);
fallbackTable.ws.send(JSON.stringify({ type: "hello", name: "Fallback", credential: login.credential }));
check("a removed selection does not block joining a table", (await fallbackTable.next((m) => m.type === "welcome")).type === "welcome");
await stop();
console.log(`profile songs prove ok (${passed} checks)`);
