
// ---- repro harness (temporary, local only) ----
const RATE = Number(process.env.THROTTLE || 1);
const WHO = process.env.WHO || "a";
const ORDER = process.env.ORDER || "pr";
const diag = [];
try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;
  const phone = await tab("Moss", true);
  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c, phone]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    await t.page.getByRole("button", { name: "Join", exact: true }).click();
    await t.page.getByTestId("table-code").waitFor();
  }
  for (const t of [...tabs, phone]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  await a.page.getByRole("button", { name: "Start", exact: true }).and(a.page.locator(":enabled")).waitFor();
  await a.page.getByRole("button", { name: "Start", exact: true }).click();
  for (const t of [...tabs, phone]) await t.page.getByRole("button", { name: /^Open chat/ }).waitFor();
  a.page.on("console", (m) => { if (m.text().startsWith("DIAG ")) diag.push(m.text().slice(5)); });
  await a.page.evaluate(() => {
    const emit = (name, d) => console.log("DIAG " + JSON.stringify({ t: Math.round(Date.now() % 100000), name, d }));
    document.addEventListener("click", (e) => { const b = e.target.closest?.("button"); if (b && /mute/i.test(b.getAttribute("aria-label") || "")) emit("page-click", b.getAttribute("aria-label")); }, true);
    let prev = 0;
    window.__emberisle.subscribe((s) => { if (s.reactions.length !== prev) { prev = s.reactions.length; emit("store-reactions", s.reactions.map((r) => r.emote)); } });
    new MutationObserver(() => { const n = document.querySelectorAll('[data-testid="reaction"][data-emote="🔥"]').length; if (n !== window.__dl) { window.__dl = n; emit("fire-dom", n); } }).observe(document.body, { childList: true, subtree: true });
  });
  const node = (name) => diag.push(JSON.stringify({ t: Math.round(Date.now() % 100000), name, node: true }));

  const mutedSeat = await store(c, () => window.__emberisle.getState().seatId);
  const mutedPlayer = await store(c, () => window.__emberisle.getState().localId);
  await a.page.getByRole("button", { name: /^Open chat/ }).click();
  await a.page.getByRole("button", { name: "Mute players", exact: true }).click();
  await a.page.getByTestId(`chat-mute-seat-${mutedSeat}`).click();
  if (process.env.METRICS) {
    for (const [n, t] of Object.entries({ a, b, c, phone })) {
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send("Performance.enable");
      const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      await new Promise((r) => setTimeout(r, 3000));
      const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const frames = await t.page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
      console.log(n, "busy over 3s:", JSON.stringify({ task: +(m1.TaskDuration - m0.TaskDuration).toFixed(3), script: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(3), layout: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(3), recalc: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(3) }), "rAF/s:", frames);
    }
  }
  if (RATE > 1) {
    for (const t of WHO.split(",").map((w) => ({ a, b, c, phone })[w])) {
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    }
    console.log(`injected: CPU throttling rate ${RATE} on ${WHO}`);
  }
  const tStart = Date.now();
  await openChat(c);
  node("react-click-start");
  let box;
  if (ORDER === "armed") { const unmute = a.page.getByRole("button", { name: "Unmute player Pine", exact: true }); await unmute.click({ trial: true }); box = await unmute.boundingBox(); node("trial-done"); }
  const armed = ORDER === "armed" ? a.page.evaluate(({ seat, player }) => new Promise((res) => {
    const look = (s) => s.reactions.some((r) => r.seat === seat && r.emote === "🔥");
    const done = () => queueMicrotask(() => res({
      float: document.querySelectorAll(`[data-testid="rail-${player}"] [data-testid="reaction"][data-emote="🔥"]`).length,
      line: [...document.querySelectorAll('[data-testid="chat-log"] [data-testid="react-line"][data-emote="🔥"]')].filter((e) => e.textContent.includes("Pine")).length,
    }));
    if (look(window.__emberisle.getState())) return done();
    const off = window.__emberisle.subscribe((s) => { if (look(s)) { off(); done(); } });
  }), { seat: mutedSeat, player: mutedPlayer }) : null;
  await c.page.getByTestId("emoji-row").getByRole("button", { name: "React fire", exact: true }).click();
  node("react-click-done");
  if (armed) {
    const h = await armed;
    node("armed-done");
    check(h.float === 0 && h.line === 0, "mute: Pine's reaction bubble and its log line are hidden only in Ember's view");
    await a.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    node("unmute-click-done");
    const mutedFloat = a.page.locator(`[data-testid="rail-${mutedPlayer}"] [data-testid="reaction"][data-emote="🔥"]`);
    await mutedFloat.waitFor({ timeout: 1500 });
    node("float-visible");
    await a.page.getByTestId("chat-log").locator('[data-testid="react-line"][data-emote="🔥"]').filter({ hasText: "Pine" }).first().waitFor({ timeout: 1500 });
    check(true, "mute: unmuting Pine restores the active reaction and its log line");
    throw Object.assign(new Error("armed variant passed"), { ok: true });
  }
  if (ORDER === "orig") { await closeChat(c); node("closeChat-done"); }
  await a.page.waitForFunction(({ seat, emote }) => window.__emberisle.getState().reactions.some((r) => r.seat === seat && r.emote === emote), { seat: mutedSeat, emote: "🔥" });
  node("store-wait-done");
  const mutedFloat = a.page.locator(`[data-testid="rail-${mutedPlayer}"] [data-testid="reaction"][data-emote="🔥"]`);
  const mutedReactLine = a.page.getByTestId("chat-log").locator('[data-testid="react-line"][data-emote="🔥"]').filter({ hasText: "Pine" });
  check((await mutedFloat.count()) === 0 && (await mutedReactLine.count()) === 0, "mute: Pine's reaction bubble and its log line are hidden only in Ember's view");
  node("hidden-check-done");
  await a.page.getByRole("button", { name: "Unmute player Pine", exact: true }).click();
  node("unmute-click-done");
  await mutedFloat.waitFor({ timeout: 1500 });
  node("float-visible");
  await mutedReactLine.first().waitFor({ timeout: 1500 });
  check(true, "mute: unmuting Pine restores the active reaction and its log line");
  if (ORDER !== "orig") await closeChat(c);
  console.log("repro ok", Date.now() - tStart, "ms");
} catch (e) {
  if (e.ok) console.log("repro ok (armed variant)"); else { console.log("FAIL", e.message); code = 1; }
} finally {
  await new Promise((r) => setTimeout(r, 2500));
  console.log("timeline:\n" + diag.sort((x, y) => JSON.parse(x).t - JSON.parse(y).t).join("\n"));
  await browser.close();
  await vite.close();
  host.kill();
  await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
}
process.exit(code);
