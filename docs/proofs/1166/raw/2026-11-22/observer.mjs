// Passive observer for #1166. Loaded with `node --import`; it only adds listeners and writes JSONL.
// It changes no fixture, timeout, route, DOM or assertion in scripts/client-prove.mjs.
import { appendFileSync } from "node:fs";
import { chromium } from "/home/user/emberisle/node_modules/playwright/index.mjs";

const out = process.env.OBS_OUT;
const t0 = Date.now();
const log = (o) => out && appendFileSync(out, JSON.stringify({ t: Date.now() - t0, ...o }) + "\n");
const strip = (u) => u.split(/[?#]/)[0];

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    page.on("request", (r) => r.isNavigationRequest() && r.frame() === page.mainFrame() && log({ k: "nav", url: r.url() }));
    page.on("requestfailed", (r) => log({ k: "failed", url: strip(r.url()), type: r.resourceType(), err: r.failure()?.errorText }));
    page.on("console", (m) => m.type() === "error" && log({ k: "console", text: m.text().slice(0, 300) }));
    page.on("pageerror", (e) => log({ k: "pageerror", text: String(e).slice(0, 300) }));
    return page;
  };
  return browser;
};
