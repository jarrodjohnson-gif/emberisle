// #1709: overflow of the lobby card at 844x390, 667x375 and 956x440 when the left column is full (six seats, or a wide code that
// sends Numbers to a second header row). Store-only lobby mounts, as lobby-overflow-prove does. Not a proof.
// node docs/proofs/1709/measure-full-column.mjs ["<extra css>"] [<picture prefix>]
import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
const extra = process.argv[2] ?? "";
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch();
for (const [label, code, n, variant] of [["6 seats WWWW", "WWWW", 6, "expanded"], ["4 seats WWWW", "WWWW", 4], ["6 seats 7XT2", "7XT2", 6, "expanded"], ["4 seats 7XT2", "7XT2", 4]]) {
  for (const vp of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 956, height: 440 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);
    await page.evaluate(([code, n, variant]) => window.__emberisle.setState({ screen: "lobby", code, isHost: true, seatId: "s0", tableVariant: variant, seats: [...Array(n).keys()].map((i) => ({ id: `s${i}`, name: ["Ember","Tide","Pine","Moss","Ash","Reed"][i], color: "red", ready: true, host: i === 0 })) }), [code, n, variant]);
    await page.locator(".lobby-cover").waitFor();
    if (extra) await page.addStyleTag({ content: extra });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => { const c = document.querySelector(".lobby-cover"); const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; }; return { over: c.scrollHeight - c.clientHeight, header: r(".lobby-header"), rules: r(".lobby-rules"), players: r(".lobby-players"), actions: r(".lobby-actions") }; });
    console.log(label, `${vp.width}x${vp.height}`, JSON.stringify(m));
    if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}-${vp.width}x${vp.height}-${label.replace(/ /g, "-")}.png` });
    await page.close();
  }
}
await browser.close(); await vite.close();
