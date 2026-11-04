// Browser proof for Issue #718:
// Lobby room codes at 320x568 portrait fit without horizontal overflow;
// Four ready seats and Ready, Start, Leave at 640x360 landscape fit without vertical card scrolling;
// Touch targets meet the >= 44x44 px requirement;
// Baseline 667x375 and 844x390 landscape viewports remain unscrolled.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 0;
const OUT_DIR = "test-results";
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: "320x568 portrait", width: 320, height: 568, shot: "lobby-overflow-320x568.png" },
  { name: "390x844 portrait", width: 390, height: 844, shot: "lobby-overflow-390x844.png" },
  { name: "640x360 landscape", width: 640, height: 360, shot: "lobby-overflow-640x360.png" },
  { name: "667x375 landscape", width: 667, height: 375, shot: "lobby-overflow-667x375.png" },
  { name: "844x390 landscape", width: 844, height: 390, shot: "lobby-overflow-844x390.png" },
];

const vite = await createServer({
  server: { host: "127.0.0.1", port: PORT },
  logLevel: "error",
});
await vite.listen();
const assignedPort = vite.httpServer.address().port;
const url = `http://127.0.0.1:${assignedPort}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });

    await page.goto(url);
    await page.waitForFunction(() => !!window.__emberisle);

    // Mount lobby with 4 ready human seats and code WWWW as host s0
    await page.evaluate(() => {
      window.__emberisle.setState({
        screen: "lobby",
        code: "WWWW",
        isHost: true,
        seatId: "s0",
        seats: [
          { id: "s0", name: "Ember", color: "red", ready: true, host: true },
          { id: "s1", name: "Tide", color: "blue", ready: true, host: false },
          { id: "s2", name: "Pine", color: "green", ready: true, host: false },
          { id: "s3", name: "Moss", color: "yellow", ready: true, host: false },
        ],
      });
    });

    await page.locator(".lobby-cover").waitFor();
    await page.evaluate(() => document.fonts.ready);

    const shotPath = `${OUT_DIR}/${vp.shot}`;
    await page.screenshot({ path: shotPath });

    const data = await page.evaluate(() => {
      const cover = document.querySelector(".lobby-cover");
      const card = document.querySelector('[data-testid="lobby-card"]');
      const codeEl = document.querySelector('[data-testid="table-code"]');
      const codeRow = codeEl?.parentElement;
      const copyButtons = codeRow ? Array.from(codeRow.querySelectorAll("button")) : [];
      const actions = document.querySelector('[data-testid="lobby-actions"]');
      const actionButtons = actions ? Array.from(actions.querySelectorAll("button")) : [];

      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        };
      };

      return {
        cover: {
          clientWidth: cover.clientWidth,
          scrollWidth: cover.scrollWidth,
          clientHeight: cover.clientHeight,
          scrollHeight: cover.scrollHeight,
          hOverflow: cover.scrollWidth - cover.clientWidth,
          vOverflow: cover.scrollHeight - cover.clientHeight,
          rect: rect(cover),
        },
        cardRect: rect(card),
        codeRect: rect(codeEl),
        copyButtons: copyButtons.map((b) => ({ text: b.textContent.trim(), rect: rect(b) })),
        actionButtons: actionButtons.map((b) => ({ text: b.textContent.trim(), rect: rect(b) })),
      };
    });

    if (data.copyButtons.length > 0) {
      assert.ok(
        data.codeRect.right <= data.copyButtons[0].rect.x,
        `${vp.name}: code right (${data.codeRect.right}) must clear copy button left (${data.copyButtons[0].rect.x})`,
      );
    }

    if (vp.width === 320 && vp.height === 568) {
      assert.equal(data.cover.hOverflow, 0, `320x568 portrait: horizontal overflow must be 0 px, got ${data.cover.hOverflow}`);
      assert.ok(data.codeRect.right <= data.cover.rect.right, `320x568: code right (${data.codeRect.right}) must stay within card right (${data.cover.rect.right})`);
      for (const btn of data.copyButtons) {
        assert.ok(btn.rect.right <= data.cover.rect.right, `320x568: copy button ${btn.text} right (${btn.rect.right}) must stay within card right (${data.cover.rect.right})`);
      }
    }

    if (vp.width === 390 && vp.height === 844) {
      assert.equal(data.cover.hOverflow, 0, `390x844 portrait: horizontal overflow must be 0 px, got ${data.cover.hOverflow}`);
      assert.ok(data.codeRect.right <= data.cover.rect.right, `390x844: code right (${data.codeRect.right}) must stay within card right (${data.cover.rect.right})`);
    }

    if (vp.width === 640 && vp.height === 360) {
      assert.equal(data.cover.vOverflow, 0, `640x360 landscape: vertical overflow must be 0 px, got ${data.cover.vOverflow}`);
      assert.equal(data.cover.hOverflow, 0, `640x360 landscape: horizontal overflow must be 0 px, got ${data.cover.hOverflow}`);
      for (const btn of data.actionButtons) {
        assert.ok(btn.rect.height >= 44 && btn.rect.width >= 44, `640x360: action button ${btn.text} must be >= 44x44, got ${btn.rect.width}x${btn.rect.height}`);
      }
    }

    if (vp.width === 667 && vp.height === 375) {
      assert.equal(data.cover.vOverflow, 0, `667x375 landscape baseline: vertical overflow must be 0 px`);
    }

    if (vp.width === 844 && vp.height === 390) {
      assert.equal(data.cover.vOverflow, 0, `844x390 landscape baseline: vertical overflow must be 0 px`);
    }

    console.log(`ok ${vp.name}: hOverflow=${data.cover.hOverflow}px, vOverflow=${data.cover.vOverflow}px`);
    await page.close();
  }

  console.log("ok lobby-overflow-prove: all narrow portrait and short landscape checks passed");
} finally {
  await browser.close();
  await vite.close();
}
