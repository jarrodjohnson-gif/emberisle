// #1760: approved counter-offer slice 1, real host/sockets; no UI or practice acceptance.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGame } from "../src/lib/game/board.ts";
import { createExpandedGame, pairedAcceptTrade } from "../src/lib/game/expanded.ts";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { applyAction } from "../src/lib/game/rules.ts";
import { connectTable } from "../src/lib/net/table.ts";
import { PLAYER_COLORS, RESOURCES } from "../src/lib/game/types.ts";

const dir = mkdtempSync(path.join(tmpdir(), "emberisle-counter-"));
let host;
process.on("exit", () => { host?.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }); });
const deadline = setTimeout(() => { console.error("FAIL counter proof exceeded 90s"); process.exit(1); }, 90_000);
const fixtures = new Map();
function fixture(code, { bot = false, partner = false, poor = false, monopoly = false, botAsk = false } = {}) {
  let g = (partner ? createExpandedGame : createGame)({ humans: ["Ember", "Tide", ...(bot ? [] : ["Pine"]), ...(partner ? ["Rain", "Sun"] : [])].map((name) => ({ name })), bots: bot ? 1 : 0, seed: 12 });
  for (let i = 0; g.phase !== "roll" && i < 500; i++) {
    const next = applyAction(g, g.current, chooseBotAction(g, g.current));
    assert.ifError(next.error); g = next.state;
  }
  assert.equal(g.phase, "roll");
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.phase = "main"; g.current = botAsk ? "p2" : "p0"; g.dice = [3, 4];
  if (partner) { g.role = "partner"; g.primary = "p2"; }
  for (const h of g.hexes) h.pip = null;
  for (const v of g.vertices) v.harbor = null;
  g.deck = [];
  for (const p of g.players) {
    p.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0 };
    p.resources = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  }
  Object.assign(g.players[0].resources, { timber: poor ? 1 : 4, grain: 1, ore: 1 });
  Object.assign(g.players[1].resources, { wool: 2, clay: 2, grain: 2 });
  if (monopoly) g.players[0].hidden.monopoly = 1;
  if (!bot) Object.assign(g.players[2].resources, { clay: 2, ore: 1, wool: 1 });
  if (bot) Object.assign(g.players[2].resources, { grain: 2, ore: 2, wool: 2 });
  for (const r of RESOURCES) g.bank[r] = 19 - g.players.reduce((n, p) => n + p.resources[r], 0);
  const seats = g.players.filter((p) => p.kind === "human").map((p, i) => ({ id: `s${i}`, name: p.name, color: PLAYER_COLORS[i], ready: true, pid: p.id, secret: `${code}-${p.id}-secret` }));
  writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ code, host: "s0", next: seats.length, game: g, seats, chat: [], chatSeq: 0, botDeclined: {}, shape: 3, savedAt: Date.now() }));
  fixtures.set(code, { g, seats });
}
for (const [code, options] of [["CCAA",{}],["CCAB",{}],["CCAC",{}],["CCAD",{}],["CCAE",{}],["CCAF",{}],["CCAG",{poor:true}],["CCAH",{monopoly:true}],["CCAJ",{}],["CCAK",{}],["CCAL",{partner:true}],["CCAM",{bot:true}],["CCAN",{bot:true}],["CCAP",{bot:true,botAsk:true}],["CCAR",{bot:true,botAsk:true}],["CCAS",{}],["CCAT",{}],["CCAU",{}],["CCAV",{}],["CCAW",{}],["CCAY",{}]]) fixture(code, options);
host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL(".", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: dir, RESULTS_DIR: `${dir}/results`, PROFILES_DIR: `${dir}/profiles`, TURN_MS: "120000", GRACE_MS: "5000", ACT_RATE: "1000", ACT_CAP: "1000", SAVE_MS: "5" } });
host.stderr.on("data", (d) => process.stderr.write(d));
const port = await new Promise((resolve, reject) => { host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(+m[1]); }); host.on("exit", (c) => reject(new Error(`host exited ${c}`))); });
function client(code, seat, caps = ["expanded", "counter"]) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, inbox: [], seen: [], state: null, pid: seat?.pid };
  const wake = new Set();
  ws.on("message", (raw) => { const m = JSON.parse(String(raw)); m.receivedAt = Date.now(); c.inbox.push(m); c.seen.push(m); if (m.type === "state") c.state = m; for (const f of [...wake]) f(); });
  c.send = (m, stamp = c.state?.actionStamp) => ws.send(JSON.stringify({ ...stamp, cid: crypto.randomUUID(), ...m }));
  c.next = (type, pred = () => true, ms = 6000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { wake.delete(check); reject(new Error(`${code}/${seat?.name ?? "watcher"} timeout ${type}: ${JSON.stringify(c.seen.filter((m) => ["error","tradeDeclined","tradeClosed","tradeCounterClosed","log"].includes(m.type)).slice(-16))}`)); }, ms);
    const check = () => { const i = c.inbox.findIndex((m) => m.type === type && pred(m)); if (i < 0) return; clearTimeout(timer); wake.delete(check); resolve(c.inbox.splice(i,1)[0]); };
    wake.add(check); check();
  });
  ws.on("open", () => c.send(seat ? { type: "hello", code, secret: seat.secret, caps } : { type: "hello", code, watch: true, caps }));
  return c;
}
async function connectSeats(code, caps) {
  const cs = fixtures.get(code).seats.map((seat, i) => client(code, seat, caps?.[i]));
  await Promise.all(cs.map((c) => c.next("state", (m) => m.game.players.every((p) => p.kind === "human" || p.id === "p2"))));
  // Ordered chat markers ensure all rejoin broadcasts arrived before action stamps are used.
  cs[0].send({ type: "chat", text: `ready ${code}` });
  await Promise.all(cs.map((c) => c.next("chat", (m) => m.text === `ready ${code}`)));
  return cs;
}
const ask = { give: { timber: 1 }, want: { wool: 1 } };
const changed = { give: { timber: 2 }, want: { clay: 1 } };
async function offer(cs, terms = ask) { cs[0].send({ type:"tradeAsk", ...terms }); const events = await Promise.all(cs.map((c) => c.next("tradeOffer"))); return events[0]; }
async function counter(cs, o, terms = changed, who = 1) { cs[who].send({ type:"tradeCounter", tradeId:o.tradeId, ...terms }); return cs[0].next("tradeCounter"); }
async function error(c, msg, text, stamp) { c.send(msg, stamp); assert.equal((await c.next("error")).message, text); }
const goods = (c, pid) => c.state.game.players.find((p) => p.id === pid).resources;
async function fence(cs, text) { cs[0].send({type:"chat",text}); await Promise.all(cs.map((c) => c.next("chat", (m) => m.text === text))); }

// Connect every fixture before its recovery grace can fire. Independent bot-asker timing cases
// start now too, so their 20s offer lifetime is measured from the actual offer.
const tables = new Map([...fixtures.keys()].map((code) => [code, connectSeats(code, code === "CCAK" ? [[],[]] : code === "CCAT" ? [["counter"],[]] : undefined)]));
const table = (code) => tables.get(code);
// A bot asker prices a counter from its own side, after its normal thought delay.
const botAnswers = Promise.all([["CCAP",false],["CCAR",true]].map(async ([code,nearExpiry]) => {
 const cs=await table(code);const o=await cs[0].next("tradeOffer",m=>m.from==="p2");assert.equal(o.counter,true);
 const terms={give:{wool:1},want:{grain:2}};
 assert.ok(pairedAcceptTrade(fixtures.get(code).g,"p2",{from:"p1",give:terms.want,want:terms.give}));
 if(nearExpiry) await new Promise(r=>setTimeout(r,Math.max(0,o.receivedAt+19300-Date.now())));
 const at=Date.now();cs[1].send({type:"tradeCounter",tradeId:o.tradeId,...terms});const c=await cs[1].next("tradeCounter");
 const closed=await cs[1].next("tradeClosed",m=>m.tradeId===o.tradeId);assert.equal(closed.taker,"p1");
 if(!nearExpiry) {assert.ok(closed.receivedAt-at>=1000);assert.ok(closed.receivedAt-at<2500);}
 else assert.ok(closed.receivedAt-at<1500,"expiry must answer pending counter before closing");
 assert.equal(c.by,"p1");console.log(`PASS bot asker paired answer ${nearExpiry?"before expiry":"in normal 1–2s delay"}`);
}));

// Terms/ids, immutable once issued, public-only payload, old-stamp non-turn send/cancel.
{
 const cs = await table("CCAA"); const o = await offer(cs); assert.equal(o.counter,true);
 const w = client("CCAA"); await w.next("state");
 await error(w,{type:"tradeCounter",tradeId:o.tradeId,...changed},"Watching only.");
 await error(cs[0],{type:"tradeCounter",tradeId:o.tradeId,...changed},"Bad trade.");
 for (const terms of [ask,{give:{},want:{clay:1}},{give:{timber:1},want:{}},{give:{clay:1},want:{clay:1}},{give:{timber:-1},want:{clay:1}}]) await error(cs[1],{type:"tradeCounter",tradeId:o.tradeId,...terms},"Bad trade.");
 await error(cs[1],{type:"tradeCounter",...changed},"Offer is gone.");
 const c = await counter(cs,o); const wc = await w.next("tradeCounter");
 assert.equal((await w.next("log",m=>m.text.includes(" counters "))).text,"Tide counters Ember: 1 brick for 2 wood.");
 assert.deepEqual(Object.keys(wc).sort(),["type","tradeId","counterId","by","name","give","want","receivedAt"].sort());
 assert.equal(c.by,"p1"); assert.deepEqual(c.give,changed.give);
 await error(cs[1],{type:"tradeCounter",tradeId:o.tradeId,give:{timber:3},want:{clay:1}},"Bad trade.");
 await error(cs[2],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"Offer is gone.");
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,yes:true},"Offer is gone.");
 const before = structuredClone(goods(cs[0],"p0")); const seq=cs[0].state.game.seq;
 cs[0].send({type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true});
 cs[0].send({type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true});
 await Promise.all(cs.map((p)=>p.next("tradeClosed",m=>m.taker==="p1")));
 await Promise.all(cs.map((p)=>p.next("state",m=>m.game.seq>seq)));
 assert.equal(goods(cs[0],"p0").timber,before.timber-2); assert.equal(goods(cs[1],"p1").timber,2); assert.equal(goods(cs[1],"p1").clay,1);
 assert.equal((await cs[0].next("error")).message,"The table has updated. Please try again.");
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"Offer is gone.");
 assert.equal(goods(cs[0],"p0").timber,before.timber-2); w.ws.close();
 console.log("PASS exact counter goods once; ids/roles/bags/equal/self/watcher/second-counter refusal; public event only");
}
// Any other seat can still take the original while a counter waits; its terms win.
{
 const cs=await table("CCAY"),o=await offer(cs),c=await counter(cs,o),before=structuredClone(goods(cs[0],"p0")),seq=cs[0].state.game.seq;
 cs[2].send({type:"tradeAnswer",tradeId:o.tradeId,yes:true});assert.equal((await cs[0].next("tradeClosed")).taker,"p2");await cs[0].next("state",m=>m.game.seq>seq);
 assert.equal(goods(cs[0],"p0").timber,before.timber-1);assert.equal(goods(cs[0],"p0").clay,before.clay);
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"Offer is gone.");console.log("PASS original remains payable to another seat while counter waits; first valid deal closes all counters");
}
// No does not consume the original answer. Take back consumes the one counter allowance.
for (const [code,why] of [["CCAB","no"],["CCAC","back"]]) {
 const cs=await table(code),o=await offer(cs),c=await counter(cs,o);
 cs[why==="no"?0:1].send({type:why==="no"?"tradeCounterAnswer":"tradeCounterCancel",tradeId:o.tradeId,counterId:c.counterId,yes:false});
 assert.equal((await cs[0].next("tradeCounterClosed")).why,why);
 await error(cs[1],{type:"tradeCounter",tradeId:o.tradeId,...changed},"Bad trade.");
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"Offer is gone.");
 cs[1].send({type:"tradeAnswer",tradeId:o.tradeId,yes:true});assert.equal((await cs[0].next("tradeClosed")).taker,"p1");
 console.log(`PASS ${why}: only counter closed; late Yes refused; sender can take original`);
}
// All Nos keep a waiting counter. Closing it closes the offer.
{
 const cs=await table("CCAD"),o=await offer(cs),c=await counter(cs,o);
 for(const p of cs.slice(1)) {p.send({type:"tradeAnswer",tradeId:o.tradeId,yes:false});await cs[0].next("tradeDeclined",m=>m.by===p.pid);}
 await fence(cs,"all no fence");assert.equal(cs[0].seen.filter(m=>m.type==="tradeClosed").length,0);
 cs[0].send({type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:false});await cs[0].next("tradeClosed");
 console.log("PASS all Nos hold offer while counter waits; closing last counter closes offer");
}
// Cancel/end turn close every pending counter without moving goods.
for(const [code,type] of [["CCAE","tradeCancel"],["CCAF","pass"]]) {
 const cs=await table(code),o=await offer(cs),c=await counter(cs,o),before=structuredClone(goods(cs[0],"p0"));
 const seq=cs[0].state.game.seq; cs[0].send({type,tradeId:o.tradeId});await cs[1].next("tradeClosed");
 if(type==="pass") await cs[0].next("state",m=>m.game.seq>seq);
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"Offer is gone.");
 assert.deepEqual(goods(cs[0],"p0"),before);console.log(`PASS ${type} ends counter without transfer`);
}
// Sender can afford counter even when original is unaffordable; asker is checked only at Yes.
{
 const cs=await table("CCAG"),o=await offer(cs,{give:{timber:1},want:{ore:1}}),c=await counter(cs,o);
 await error(cs[0],{type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true},"You lack those goods.");
 await fence(cs,"short asker fence");assert.equal(cs[0].seen.filter(m=>m.type==="tradeCounterClosed").length,0);
 cs[1].send({type:"tradeCounterCancel",tradeId:o.tradeId,counterId:c.counterId});await cs[0].next("tradeCounterClosed");
 console.log("PASS unaffordable original can counter; short asker leaves counter pending");
}
// Monopoly changes sender's hand while the asker's original goods remain; acceptance revalidates sender.
{
 const cs=await table("CCAH"),o=await offer(cs),c=await counter(cs,o),seq=cs[0].state.game.seq;
 cs[0].send({type:"play",card:"monopoly",resource:"clay"});await cs[0].next("state",m=>m.game.seq>seq);
 cs[0].send({type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:true});assert.equal((await cs[0].next("tradeCounterClosed")).why,"gone");
 console.log("PASS short sender closes only counter after acceptance revalidation");
}
// Rejoin replay order and per-hello capability negotiation; counters/caps are not saved.
{
 const cs=await table("CCAJ"),o=await offer(cs),c=await counter(cs,o);cs[2].send({type:"tradeAnswer",tradeId:o.tradeId,yes:false});await cs[0].next("tradeDeclined",m=>m.by==="p2");cs[1].ws.close();await new Promise(r=>cs[1].ws.once("close",r));
 const back=client("CCAJ",fixtures.get("CCAJ").seats[1]);await back.next("state");await back.next("tradeCounter");
 const types=back.seen.filter(m=>["tradeOffer","tradeDeclined","tradeCounter"].includes(m.type)).map(m=>m.type);assert.deepEqual(types,["tradeOffer","tradeDeclined","tradeCounter"]);
 await error(back,{type:"tradeCounter",tradeId:o.tradeId,...changed},"Bad trade.");
 const saved=JSON.parse(readFileSync(path.join(dir,"CCAJ.json")));assert.equal(saved.shape,3);assert.ok(!JSON.stringify(saved).includes('"counterId"'));assert.ok(saved.seats.every(s=>!("caps" in s)));
 console.log("PASS rejoin counter replay after offer; per-offer allowance survives; save shape unchanged/caps transient");
}
{
 const cs=await table("CCAK",[[],[]]),o=await offer(cs);assert.equal(o.counter,undefined);
 await error(cs[1],{type:"tradeCounter",tradeId:o.tradeId,...changed},"Bad trade.");
 console.log("PASS old asker omits counter capability; old receiver refused");
}
{
 const cs=await table("CCAL");await error(cs[0],{type:"tradeAsk",...ask},"No player trades on a partner turn.");
 await error(cs[1],{type:"tradeCounter",tradeId:"missing",...changed},"Offer is gone.");console.log("PASS five-seat partner turn has no offer/counter");
}
// Held bot Yes: pending counter keeps it waiting after the only human answered No; closing releases it.
{
 assert.ok(pairedAcceptTrade(fixtures.get("CCAM").g,"p2",{from:"p0",give:{grain:1},want:{wool:1}}),"held-Yes fixture bot must accept");
 const cs=await table("CCAM"),o=await offer(cs,{give:{grain:1},want:{wool:1}}),c=await counter(cs,o);
 cs[1].send({type:"tradeAnswer",tradeId:o.tradeId,yes:false});await cs[0].next("tradeDeclined",m=>m.by==="p1");
 await new Promise(r=>setTimeout(r,2200));assert.equal(cs[0].seen.filter(m=>m.type==="tradeClosed").length,0);
 cs[0].send({type:"tradeCounterAnswer",tradeId:o.tradeId,counterId:c.counterId,yes:false});assert.equal((await cs[0].next("tradeClosed")).taker,"p2");
 console.log("PASS bot held Yes waits for counter; closing counter releases it");
}
for(const code of ["CCAN"]) {
 assert.ok(pairedAcceptTrade(fixtures.get(code).g,"p2",{from:"p0",give:{grain:1},want:{wool:1}}),"8s fixture bot must accept");
 const cs=await table(code),o=await offer(cs,{give:{grain:1},want:{wool:1}});await counter(cs,o);
 cs[1].send({type:"tradeAnswer",tradeId:o.tradeId,yes:false});await cs[0].next("tradeDeclined",m=>m.by==="p1");
 const closed=await cs[0].next("tradeClosed",()=>true,10000);assert.equal(closed.taker,"p2");assert.ok(closed.receivedAt-o.receivedAt>=7900);
 console.log("PASS pending counter does not extend 8s PEOPLE_FIRST_MS bot hold");
}
await botAnswers;
// Two distinct counters retain their order/terms; takeback with an older stamp remains legal.
{
 const cs=await table("CCAS"),o=await offer(cs,{give:{grain:1},want:{wool:1}}),one=await counter(cs,o,{give:{grain:2},want:{clay:1}});

 await error(cs[2],{type:"tradeCounter",tradeId:o.tradeId,give:{timber:1},want:{ore:2}},"You lack those goods.");
 const old=cs[1].state.actionStamp,old2=cs[2].state.actionStamp,seq=cs[0].state.game.seq;
 cs[0].send({type:"tradeBank",give:"timber",take:"ore"});await cs[0].next("state",m=>m.game.seq>seq);
 cs[2].send({type:"tradeCounter",tradeId:o.tradeId,give:{ore:1},want:{clay:1}},old2);const two=await cs[0].next("tradeCounter",m=>m.by==="p2");assert.notEqual(one.counterId,two.counterId);
 cs[1].send({type:"tradeCounterCancel",tradeId:o.tradeId,counterId:one.counterId},old);
 assert.equal((await cs[0].next("tradeCounterClosed",m=>m.counterId===one.counterId)).why,"back");
 await fence(cs,"older stamp fence");assert.equal(cs[0].seen.filter(m=>m.type==="tradeClosed").length,0);
 console.log("PASS two counters retain separate immutable ids; older-stamp off-turn cancellation works after state advances");
}
// Capability is per receiving hello, independently of the asker's capability.
{
 const cs=await table("CCAT",[["counter"],[]]),o=await offer(cs);assert.equal(o.counter,true);
 await error(cs[1],{type:"tradeCounter",tradeId:o.tradeId,...changed},"Bad trade.");console.log("PASS capable asker plus old receiver cannot send counter");
}
// A sender's takeover closes only its counter; an asker's takeover closes the offer.
for(const [code,who] of [["CCAU",1],["CCAV",0]]) {
 const cs=await table(code),o=await offer(cs);await counter(cs,o);cs[who].ws.close();
 if(who===1) {assert.equal((await cs[0].next("tradeCounterClosed",()=>true,7000)).why,"gone");await fence([cs[0],cs[2]],"takeover fence");assert.equal(cs[0].seen.filter(m=>m.type==="tradeClosed").length,0);}
 else await cs[1].next("tradeClosed",m=>m.tradeId===o.tradeId,7000);
 console.log(`PASS ${who===1?"sender":"asker"} takeover closes ${who===1?"only counter":"whole offer"}`);
}
// Real table.ts clients advertise capability and send/receive all new messages.
{
 const code="CCAW",seats=fixtures.get(code).seats,records=[];
 const previous=await table(code);await Promise.all(previous.map(c=>new Promise(resolve=>{c.ws.once("close",resolve);c.ws.close();})));
 for(const seat of seats) {
   const r={state:null,events:[],errors:[]};
   r.t=connectTable(`ws://127.0.0.1:${port}`,{state:m=>r.state=m,tradeOffer:m=>r.events.push({...m,type:"tradeOffer"}),tradeCounter:m=>r.events.push({...m,type:"tradeCounter"}),tradeCounterClosed:m=>r.events.push({...m,type:"tradeCounterClosed"}),tradeClosed:m=>r.events.push({...m,type:"tradeClosed"}),error:e=>r.errors.push(e)},WebSocket);
   r.t.rejoin(code,seat.secret);records.push(r);
 }
 const wait=async(cond)=>{const end=Date.now()+5000;while(!cond()){assert.ok(Date.now()<end,"table.ts protocol event timed out");await new Promise(r=>setTimeout(r,5));}};
 await wait(()=>records.every(r=>r.state));const [a,b]=records;
 a.t.ask(ask.give,ask.want);await wait(()=>b.events.some(m=>m.type==="tradeOffer"));const o=b.events.find(m=>m.type==="tradeOffer");assert.equal(o.counter,true);
 b.t.counter(o.tradeId,changed.give,changed.want);await wait(()=>a.events.some(m=>m.type==="tradeCounter"));const c=a.events.find(m=>m.type==="tradeCounter");
 b.t.cancelCounter(o.tradeId,c.counterId);await wait(()=>a.events.some(m=>m.type==="tradeCounterClosed"));assert.equal(a.events.find(m=>m.type==="tradeCounterClosed").why,"back");
 a.t.cancel(o.tradeId);await wait(()=>a.events.some(m=>m.type==="tradeClosed"));
 a.t.ask(ask.give,ask.want);await wait(()=>b.events.filter(m=>m.type==="tradeOffer").length===2);const next=b.events.filter(m=>m.type==="tradeOffer")[1];
 b.t.counter(next.tradeId,changed.give,changed.want);await wait(()=>a.events.filter(m=>m.type==="tradeCounter").length===2);const nc=a.events.filter(m=>m.type==="tradeCounter")[1];
 a.t.answerCounter(next.tradeId,nc.counterId,true);await wait(()=>a.events.some(m=>m.type==="tradeClosed"&&m.taker==="p1"));
 assert.ok(records.every(r=>r.errors.length===0));for(const r of records)r.t.close();console.log("PASS real table.ts capability, three senders and both events");
}
clearTimeout(deadline);host.kill("SIGKILL");console.log("trade-counter-prove: real-host slice1 cases passed");
