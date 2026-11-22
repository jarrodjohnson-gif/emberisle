// Design capture utility for #1220: real host, real lobby, before and after pictures. Reports observations; not a CI proof.
// Run from the repo root: node docs/design/lobby-hig/capture.mjs
// "After" adds after.css to the running page. No source file changes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const dir = "docs/design/lobby-hig";
const assets = `${dir}/assets`;
mkdirSync(assets, { recursive: true });
const afterCss = readFileSync(`${dir}/after.css`, "utf8");
const sizes = [[320, 568], [375, 667], [390, 844], [844, 390], [1280, 720]];

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1220-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", d => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", code => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function client(name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(n => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

// Every number the audit table quotes comes from here.
function measure() {
  const card = document.querySelector(".lobby-cover");
  const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), right: +b.right.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const label = el => (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent.trim() || el.placeholder || el.tagName).slice(0, 32);
  const cs = getComputedStyle(card);
  const cb = r(card);
  const texts = [];
  for (const el of card.querySelectorAll("*")) {
    if (!visible(el) || el.closest("svg")) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const ph = el.tagName === "INPUT" && !el.value && el.placeholder;
    if (!own && !ph && !(el.tagName === "INPUT" && el.value)) continue;
    const s = getComputedStyle(el);
    if (s.position === "absolute" && s.width === "1px") continue; // sr-only
    const clip = (s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1;
    texts.push({ text: (el.value || el.placeholder || [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("")).trim().slice(0, 32), tag: el.tagName.toLowerCase(), size: parseFloat(s.fontSize), line: s.lineHeight, weight: s.fontWeight, family: s.fontFamily.split(",")[0].replace(/"/g, ""), clipped: clip, x: +el.getBoundingClientRect().x.toFixed(2) });
  }
  const controls = [...card.querySelectorAll("button, input, [role=tab]")].filter(visible).filter((el, i, a) => a.indexOf(el) === i).map(el => ({ label: label(el), ...r(el), size: parseFloat(getComputedStyle(el).fontSize) }));
  let minGap = Infinity, minGapPair = null;
  for (let i = 0; i < controls.length; i++) for (const b of controls.slice(i + 1)) {
    const a = controls[i];
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    if (gap < minGap) { minGap = gap; minGapPair = `${a.label} / ${b.label}`; }
  }
  const code = card.querySelector('[data-testid="table-code"]');
  const edge = sel => { const el = card.querySelector(sel); return el ? +(el.getBoundingClientRect().x - cb.x).toFixed(2) : null; };
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    code: code.textContent.trim(),
    codeFont: { size: parseFloat(getComputedStyle(code).fontSize), line: getComputedStyle(code).lineHeight, weight: getComputedStyle(code).fontWeight, family: getComputedStyle(code).fontFamily.split(",")[0] },
    card: cb,
    outerMargin: { left: cb.x, top: cb.y, right: +(innerWidth - cb.right).toFixed(2), bottom: +(innerHeight - cb.bottom).toFixed(2) },
    padding: cs.padding,
    radius: cs.borderRadius,
    rows: cs.gridTemplateRows,
    cardScroll: [card.scrollWidth - card.clientWidth, card.scrollHeight - card.clientHeight],
    chatLog: +card.querySelector('[data-testid="chat-log"]').getBoundingClientRect().height.toFixed(2),
    addBotLines: (() => { const b = card.querySelector('[data-testid="add-bot"]'); const rg = document.createRange(); rg.selectNodeContents(b); return Math.round(rg.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight)); })(),
    leftEdges: { code: edge('[data-testid="table-code"]'), rules: edge(".lobby-rules > button"), seats: edge(".lobby-players"), chat: edge('[data-testid="lobby-chat"]'), status: edge('[data-testid="lobby-status"]'), ready: edge(".lobby-action-buttons > button") },
    fontSizes: [...new Set(texts.map(t => t.size))].sort((a, b) => a - b),
    smallestText: Math.min(...texts.map(t => t.size)),
    clipped: texts.filter(t => t.clipped).map(t => t.text),
    under44: controls.filter(c => c.w < 44 || c.h < 44).map(c => `${c.label} ${c.w}x${c.h}`),
    textPaddingUnder8: [...card.querySelectorAll("button")].filter(visible).filter(b => b.textContent.trim() && !b.matches('[data-testid="rename-seat"], [data-emote]') && !b.closest('[data-testid="emoji-row"]')).filter(b => { const rg = document.createRange(); rg.selectNodeContents(b); const t = rg.getBoundingClientRect(), o = b.getBoundingClientRect(); return t.left - o.left < 7.99 || o.right - t.right < 7.99; }).map(b => b.textContent.trim()),
    minGap: +minGap.toFixed(2), minGapPair,
    controls, texts,
  };
}

// How much lobby text follows the root text size (the web's nearest hook to Dynamic Type): root 16 -> 20 px.
async function followsTextSize(page) {
  const sizes = () => page.evaluate(() => [...document.querySelector(".lobby-cover").querySelectorAll("*")].filter(el => el.getClientRects().length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => parseFloat(getComputedStyle(el).fontSize)));
  const a = await sizes();
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  const b = await sizes();
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  return { texts: a.length, grew: a.filter((s, i) => b[i] > s).length };
}

// The widest real code (owner answer on #1181: every 4-letter code fits at normal size). Measured, not pictured.
async function widest(page) {
  const real = await page.evaluate(() => window.__emberisle.getState().code);
  await page.evaluate(() => window.__emberisle.setState({ code: "WWWW" }));
  await page.getByTestId("table-code").getByText("WWWW").waitFor();
  const fit = () => page.evaluate(() => {
    const code = document.querySelector('[data-testid="table-code"]');
    const rg = document.createRange();
    rg.selectNodeContents(code);
    const t = rg.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".lobby-copy-controls > button")];
    const first = buttons[0].getBoundingClientRect();
    const textOut = buttons.filter(b => { const r = document.createRange(); r.selectNodeContents(b); const x = r.getBoundingClientRect(), y = b.getBoundingClientRect(); return x.left < y.left + 8 - 0.5 || x.right > y.right - 8 + 0.5 || x.height > 21; }).map(b => b.textContent);
    return { codeSize: parseFloat(getComputedStyle(code).fontSize), textWidth: +t.width.toFixed(2), clipped: code.scrollWidth > code.clientWidth + 1, gapToCopy: +(first.left - t.right).toFixed(2), buttonsCrampedOrWrapped: textOut };
  });
  const normal = await fit();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  const copied = await fit();
  await page.getByRole("button", { name: "Copy", exact: true }).waitFor({ timeout: 10000 });
  await page.evaluate(c => window.__emberisle.setState({ code: c }), real);
  await page.getByTestId("table-code").getByText(real).waitFor();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  return { normal, copied };
}

const results = [];
try {
  for (const [width, height] of sizes) {
    const page = await client("Jarrod", { width, height }, width < 1000);
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = (await page.getByTestId("table-code").textContent()).trim();
    const guest = await client("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate(c => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await guest.locator("#chat-input").fill("Ready when you are!");
    await guest.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByTestId("chat-log").getByText("Ready when you are!").waitFor();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.waitForFunction(() => { const s = window.__emberisle.getState(); return s.seats.find(x => x.id === s.seatId)?.ready; });
    await page.waitForFunction(() => !!window.__isle);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const before = await page.evaluate(measure);
    if (!process.env.QUICK) await page.screenshot({ path: `${assets}/before-${width}x${height}.png` });
    before.widest = await widest(page);
    before.textSize = await followsTextSize(page);
    // In <body>, so it comes after every lazily loaded <head> stylesheet and wins at equal specificity.
    await page.evaluate(css => { const s = document.createElement("style"); s.textContent = css; document.body.append(s); }, afterCss);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const after = await page.evaluate(measure);
    if (!process.env.QUICK) await page.screenshot({ path: `${assets}/after-${width}x${height}.png` });
    after.widest = await widest(page);
    after.textSize = await followsTextSize(page);
    results.push({ before, after });
    for (const [tag, m] of [["before", before], ["after", after]]) {
      console.log(`${width}x${height} ${tag}: code ${m.code} ${m.codeFont.size}px; sizes ${m.fontSizes.join("/")}; smallest ${m.smallestText}px; margin L${m.outerMargin.left} T${m.outerMargin.top}; padding ${m.padding}; min gap ${m.minGap} (${m.minGapPair}); under44 ${m.under44.length}; clipped ${m.clipped.length}; card scroll ${m.cardScroll}; chat log ${m.chatLog}px; add bot lines ${m.addBotLines}; text padding <8: ${m.textPaddingUnder8.join(",") || "none"}; follows text size ${m.textSize.grew}/${m.textSize.texts}; WWWW ${JSON.stringify(m.widest)}`);
    }
    await page.context().close();
    await guest.context().close();
  }
  writeFileSync(`${dir}/measurements.json`, JSON.stringify({ chromium: browser.version(), results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; ${results.length * 2} pictures; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
