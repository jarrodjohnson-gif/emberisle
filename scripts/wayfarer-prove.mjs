// #237: the wayfarer stands on the token, hops (not slides), and the target hexes wear a band. Checks from docs/design/wayfarer.md.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8097;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

// 5. Contrast: WCAG 2 relative luminance, the same formula docs/design/pieces.md uses.
const lum = (hex) => {
  const c = [16, 8, 0].map((s) => ((hex >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
check("contrast #2b2420 on #f4ead6 >= 10", contrast(0x2b2420, 0xf4ead6) >= 10, contrast(0x2b2420, 0xf4ead6).toFixed(2));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Play versus the isle" }).click();

  const setup = await page.evaluate(async () => {
    const g = window.__emberisle;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400; i++) {
      const s = g.getState();
      const st = s.state;
      if (st.phase !== "setupSettle" && st.phase !== "setupRoad") return st.phase;
      if (st.current === s.localId) {
        const hi = s.highlights();
        if (st.phase === "setupSettle") s.pickVertex(hi.vertices[0]);
        else s.pickEdge(hi.edges[0]);
      }
      await sleep(100);
    }
    return "stuck";
  });
  check("setup finished", setup !== "stuck", setup);

  // topOf lives in the renderer module; import it through vite so the proof does not copy its constants.
  const probe = async (fn, arg) => page.evaluate(fn, arg);
  await page.evaluate(async () => {
    window.__topOf = (await import("/src/lib/scene/isle-renderer.ts")).topOf;
    window.__worldOfHex = (await import("/src/lib/game/board.ts")).worldOfHex;
  });
  await page.waitForTimeout(1500);

  // 1. On the token (the first board puts him on the wastes, which have no token, so the cap).
  const on = await probe(() => {
    const isle = window.__isle;
    const st = window.__emberisle.getState().state;
    const h = st.hexes.find((x) => x.id === st.robberHex);
    const w = window.__worldOfHex(h);
    const p = isle.wayfarer.position;
    return { dy: p.y - (window.__topOf(h.terrain) + (h.pip === null ? 0 : 0.07)), dx: p.x - w.x, dz: p.z - w.z, walking: !!isle.walk };
  });
  check("1 on the token", !on.walking && Math.abs(on.dy) <= 0.001 && Math.abs(on.dx) <= 0.001 && Math.abs(on.dz) <= 0.001, on);

  // 2. Hops, not a slide: move the robber to a hex two hexes away in a straight line.
  const hop = await probe(async () => {
    const g = window.__emberisle;
    const isle = window.__isle;
    const st = structuredClone(g.getState().state);
    const from = st.hexes.find((x) => x.id === st.robberHex);
    const fw = window.__worldOfHex(from);
    const to = st.hexes.find((x) => {
      const w = window.__worldOfHex(x);
      return Math.abs(Math.hypot(w.x - fw.x, w.z - fw.z) - 2 * 1.12 * Math.sqrt(3)) < 0.05;
    });
    const face = window.__topOf(to.terrain) + (to.pip === null ? 0 : 0.07);
    // Software GL renders ~7 frames a second, too few to see a 300 ms hop. Run the renderer's own tick on a virtual clock in 50 ms steps.
    let vt = isle.clock.getElapsed();
    isle.clock.getElapsed = () => vt;
    st.robberHex = to.id;
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
    const ys = [];
    for (let ms = 0; ms < 700; ms += 50) {
      vt += 0.05;
      isle.tick();
      ys.push(isle.wayfarer.position.y - face);
    }
    let rises = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i - 1] <= 0.2 && ys[i] > 0.2) rises++;
    for (let ms = 700; ms < 1000; ms += 50) {
      vt += 0.05;
      isle.tick();
    }
    const w = window.__worldOfHex(to);
    const p = isle.wayfarer.position;
    return { rises, max: Math.max(...ys), samples: ys.length, dy: p.y - face, dx: p.x - w.x, dz: p.z - w.z };
  });
  check("2 two hops in 700 ms", hop.rises >= 2, { rises: hop.rises, max: +hop.max.toFixed(3), samples: hop.samples });
  check("2 lands on the new token", Math.abs(hop.dy) <= 0.001 && Math.abs(hop.dx) <= 0.001 && Math.abs(hop.dz) <= 0.001, hop);

  // 3 and 4. Rings on every legal hex, above the cap.
  const rings = await probe(async () => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "robber";
    st.current = g.getState().localId;
    st.discardNeeded = {};
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
    await new Promise((r) => setTimeout(r, 500));
    const s = g.getState();
    const legal = s.highlights().hexes;
    const marks = window.__isle.marks.children.filter((m) => m.userData.kind === "hex");
    const cur = s.state.hexes.find((h) => h.id === s.state.robberHex);
    return {
      legal: legal.length,
      rings: marks.length,
      hasOwn: marks.some((m) => m.userData.id === s.state.robberHex),
      offsets: marks.map((m) => m.position.y - window.__topOf(s.state.hexes.find((h) => h.id === m.userData.id).terrain)),
      cur: cur.id,
    };
  });
  check("3 a ring on every legal hex, none on the wayfarer's", rings.legal > 0 && rings.rings === rings.legal && !rings.hasOwn, { legal: rings.legal, rings: rings.rings, hasOwn: rings.hasOwn });
  check("4 every ring 0.012 above its cap", rings.offsets.length > 0 && rings.offsets.every((o) => Math.abs(o - 0.012) <= 0.0005), rings.offsets.map((o) => +o.toFixed(4)));

  check("no console errors", errors.length === 0, errors);
} finally {
  await browser.close();
  await vite.close();
}
if (fails.length) {
  console.error("wayfarer-prove failed:", fails.join("; "));
  process.exit(1);
}
console.log("wayfarer-prove ok");
