// #826: while the wayfarer stands on a hex, that hex and its number token go grey; the Wastes stay plain;
// moving him clears the old hex. Run: node scripts/robber-hex-prove.mjs
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 60_000;
const PORT = Number(process.env.VITE_PORT) || 8126;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-jelly", "full"));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });

  // Hotseat through setup into main so the island and scenes are live.
  await page.evaluate(() => {
    window.__emberisle.getState().startHotseat(3);
  });
  await page.waitForFunction(() => window.__emberisle.getState().state?.phase === "rollOff" || window.__emberisle.getState().state?.phase === "setupSettle", null, {
    timeout: STEP_MS,
  });
  await page.evaluate(async () => {
    const g = window.__emberisle;
    for (let i = 0; i < 48; i++) {
      const s = g.getState();
      const st = s.state;
      if (!st) break;
      const hi = s.highlights();
      if (st.phase === "rollOff") s.dispatch({ type: "roll" });
      else if (st.phase === "setupSettle" && hi.vertices[0]) s.pickVertex(hi.vertices[0]);
      else if (st.phase === "setupRoad" && hi.edges[0]) s.pickEdge(hi.edges[0]);
      else if (st.phase === "roll" || st.phase === "main") break;
      else break;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForFunction(() => {
    const ph = window.__emberisle.getState().state?.phase;
    return ph === "roll" || ph === "main";
  }, null, { timeout: STEP_MS });
  await page.waitForFunction(() => window.__isle?.landReady, null, { timeout: STEP_MS });
  // Snap dulling under reduced motion so proofs do not wait on the lerp.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);

  const start = await page.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const jb = window.__isle.jellyBoard;
    const waste = st.hexes.find((h) => h.terrain === "waste");
    const onWaste = st.robberHex === waste?.id;
    return {
      robber: st.robberHex,
      onWaste,
      wasteDull: waste ? jb.dullTarget(waste.id) : null,
      robberDull: jb.dullTarget(st.robberHex),
    };
  });
  check("start: wayfarer is on the Wastes", start.onWaste, start);
  check("start: Wastes are not dulled", start.wasteDull === 0, start);
  check("start: current hex dull target is 0 (Wastes skip)", start.robberDull === 0, start);

  // Move onto a numbered production hex, then onto another, then back toward waste.
  const moved = await page.evaluate(async () => {
    const g = window.__emberisle;
    const isle = window.__isle;
    const jb = isle.jellyBoard;
    const tokenColor = (hexId) => {
      const tok = isle.tokens.find((t) => t.userData.hex === hexId);
      if (!tok) return null;
      const label = tok.children.find((c) => c.material?.map);
      const disc = tok.children.find((c) => c.material && !c.material.map);
      return {
        disc: disc?.material.color.getHexString() ?? null,
        label: label?.material.color.getHexString() ?? null,
        restDisc: disc?.material.userData.restColor?.getHexString?.() ?? null,
      };
    };
    const place = (hexId) => {
      const st = structuredClone(g.getState().state);
      const prev = st.robberHex;
      st.robberHex = hexId;
      for (const h of st.hexes) h.blocked = h.id === hexId;
      st.seq += 1;
      g.setState({ state: st });
      // Reduced motion snaps dulling on the next update.
      isle.wake?.();
      return prev;
    };

    const st0 = g.getState().state;
    const a = st0.hexes.find((h) => h.terrain !== "waste" && h.pip != null && h.id !== st0.robberHex);
    const b = st0.hexes.find((h) => h.terrain !== "waste" && h.pip != null && h.id !== a.id && h.id !== st0.robberHex);
    const waste = st0.hexes.find((h) => h.terrain === "waste");
    if (!a || !b || !waste) return { error: "missing hexes", a: !!a, b: !!b, waste: !!waste };

    place(a.id);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterA = {
      dullA: jb.dullTarget(a.id),
      dullOfA: jb.dullOf(a.id),
      tokenA: tokenColor(a.id),
      terrain: a.terrain,
    };

    place(b.id);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterB = {
      dullA: jb.dullTarget(a.id),
      dullB: jb.dullTarget(b.id),
      tokenA: tokenColor(a.id),
      tokenB: tokenColor(b.id),
    };

    place(waste.id);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterWaste = {
      dullA: jb.dullTarget(a.id),
      dullB: jb.dullTarget(b.id),
      dullWaste: jb.dullTarget(waste.id),
      tokenA: tokenColor(a.id),
      tokenB: tokenColor(b.id),
    };

    return { a: a.id, b: b.id, waste: waste.id, afterA, afterB, afterWaste };
  });

  check("move: landed on a production hex", !moved.error, moved);
  check("move: new hex is fully dulled", moved.afterA?.dullA === 1 && moved.afterA?.dullOfA === 1, moved.afterA);
  check(
    "move: token on that hex is dimmed (not rest cream)",
    moved.afterA?.tokenA?.label && moved.afterA.tokenA.label !== "ffffff" && moved.afterA.tokenA.label !== "fff9f0",
    moved.afterA?.tokenA,
  );
  check("move: token disc is dimmed vs its rest colour", moved.afterA?.tokenA?.disc && moved.afterA.tokenA.restDisc && moved.afterA.tokenA.disc !== moved.afterA.tokenA.restDisc, moved.afterA?.tokenA);

  check("second move: old hex clears", moved.afterB?.dullA === 0, moved.afterB);
  check("second move: new hex is dulled", moved.afterB?.dullB === 1, moved.afterB);
  check("second move: old token restored to rest", moved.afterB?.tokenA?.disc === moved.afterB?.tokenA?.restDisc, moved.afterB?.tokenA);
  check("second move: new token is dimmed", moved.afterB?.tokenB?.disc && moved.afterB.tokenB.restDisc && moved.afterB.tokenB.disc !== moved.afterB.tokenB.restDisc, moved.afterB?.tokenB);

  check("back on Wastes: no hex stays dulled", moved.afterWaste?.dullA === 0 && moved.afterWaste?.dullB === 0 && moved.afterWaste?.dullWaste === 0, moved.afterWaste);
  check("back on Wastes: both tokens restored", moved.afterWaste?.tokenA?.disc === moved.afterWaste?.tokenA?.restDisc && moved.afterWaste?.tokenB?.disc === moved.afterWaste?.tokenB?.restDisc, {
    a: moved.afterWaste?.tokenA,
    b: moved.afterWaste?.tokenB,
  });

  // Phone size: dull targets still flip (scene maths, not pixels).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const phone = await page.evaluate(() => {
    const g = window.__emberisle;
    const jb = window.__isle.jellyBoard;
    const st = structuredClone(g.getState().state);
    const target = st.hexes.find((h) => h.terrain !== "waste" && h.pip != null);
    st.robberHex = target.id;
    for (const h of st.hexes) h.blocked = h.id === target.id;
    st.seq += 1;
    g.setState({ state: st });
    window.__isle.wake?.();
    return { id: target.id, dull: jb.dullTarget(target.id), terrain: target.terrain };
  });
  check("390x844: production hex dulls", phone.dull === 1, phone);

  check("no console errors", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await vite.close();
}

if (fails.length) {
  console.error(`FAIL ${fails.length}: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("PASS robber-hex-prove");
