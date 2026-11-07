// #812: Serve the game-night invite at /invite.html on the game's own address.
// Verifies that /invite.html is served, builds cleanly, renders the cinematic
// invite in Playwright, and navigates through the invitation beats without console errors.
// Run: node scripts/invite-night-prove.mjs

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8192;
const errors = [];

assert.ok(existsSync("public/invite.html"), "public/invite.html must exist");
const inviteSource = readFileSync("public/invite.html", "utf8");
assert.ok(inviteSource.includes("Lanterns to Emberisle"), "invite title must be present");
assert.ok(inviteSource.includes("Join table"), "join link must be present");

const vite = await createServer({
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
  logLevel: "error",
});
await vite.listen();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  // 1. Verify HTTP response
  const res = await fetch(`http://127.0.0.1:${PORT}/invite.html`);
  assert.equal(res.status, 200, "invite.html must return 200 OK");
  assert.ok(res.headers.get("content-type")?.includes("text/html"), "content-type must be text/html");

  // 2. Browser interaction at phone portrait (390x844)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/invite.html?code=ABCD`, { waitUntil: "domcontentloaded" });

  const title = await page.title();
  assert.equal(title, "Lanterns to Emberisle", "Page title should match");

  const threeType = await page.evaluate(() => typeof window.THREE);
  assert.equal(threeType, "object", "typeof THREE must be object");

  // Verify header layout: brand wordmark does not overlap top actions
  const brandBox = await page.locator(".brand").boundingBox();
  const musicBox = await page.locator("#music").boundingBox();
  const skipBox = await page.locator("#skip").boundingBox();
  assert.ok(brandBox && musicBox && skipBox, "brand, music, and skip controls must be laid out");
  assert.ok(brandBox.x + brandBox.width <= skipBox.x, "brand wordmark must not overlap skip control");
  assert.ok(brandBox.x + brandBox.width <= musicBox.x, "brand wordmark must not overlap music control");

  // Canvas scene and initial hello panel
  const canvas = page.locator("#scene");
  assert.equal(await canvas.count(), 1, "#scene canvas must exist");

  // WebGL canvas render check: screenshot is not one flat colour
  await page.waitForTimeout(300);
  const canvasPng = await canvas.screenshot();
  assert.ok(canvasPng.length > 500, "canvas screenshot png must have content");
  const pixelColors = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 40) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      if (colors.size > 5) break;
    }
    return colors.size;
  }, canvasPng.toString("base64"));
  assert.ok(pixelColors > 1, "canvas must render multiple colors, not one flat color");

  const beginBtn = page.locator("#begin");
  assert.equal(await beginBtn.isVisible(), true, "Hello button (#begin) must be visible initially");

  // Tap to follow the lanterns (advance to ask stage)
  await beginBtn.click();
  await page.waitForSelector("#p-ask.on", { timeout: 10_000 });

  const yesBtn = page.locator("#yes");
  const noBtn = page.locator("#no");
  assert.equal(await yesBtn.isVisible(), true, "Yes RSVP button must be visible");
  assert.equal(await noBtn.isVisible(), true, "No RSVP button must be visible");

  // Accept invite (advance to reveal stage)
  await yesBtn.click();
  await page.waitForSelector("#p-reveal.on", { timeout: 10_000 });

  const joinBtn = page.locator("#join");
  assert.equal(await joinBtn.isVisible(), true, "Join table button must be visible");
  const joinHref = await joinBtn.getAttribute("href");
  assert.equal(joinHref, "./?code=ABCD&play=1", `Join table should preserve code and append play=1, got ${joinHref}`);

  const countText = (await page.locator("#count").innerText()).trim();
  assert.match(countText, /^\d+h \d{2}m \d{2}s$|^The table is open$/, `#count must match countdown pattern, got "${countText}"`);

  const whenText = await page.locator("#when").innerText();
  assert.ok(whenText.includes("7:00 PM Eastern"), "When text should display game night time");

  assert.deepEqual(errors, [], `Console errors encountered: ${errors.join(", ")}`);
  await ctx.close();

  console.log("ok   /invite.html served and responds 200 text/html");
  console.log("ok   rendered title and WebGL canvas at 390x844");
  console.log("ok   tapped lanterns to enter RSVP beat");
  console.log("ok   accepted RSVP to reveal countdown and Join table link");
  console.log("ok   zero console errors");
  console.log("PASS invite-night-prove");
} finally {
  await browser.close();
  await vite.close();
}
