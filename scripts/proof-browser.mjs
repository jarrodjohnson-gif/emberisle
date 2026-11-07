// #1281: the one place the proofs get Playwright's chromium. Every page in a browser launched from here starts with
// `window.__emberisleSkipIntro` set, so the game opens straight on the title, as it did before the startup loading screen.
// loading-screen-prove imports chromium from playwright itself, to test the real screen.
import { chromium as real } from "playwright";

const skipIntro = () => {
  window.__emberisleSkipIntro = true;
};

async function launch(options) {
  const browser = await real.launch(options);
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (o) => {
    const ctx = await newContext(o);
    await ctx.addInitScript(skipIntro);
    return ctx;
  };
  browser.newPage = async (o) => {
    const page = await newPage(o);
    await page.context().addInitScript(skipIntro);
    return page;
  };
  return browser;
}

export const chromium = new Proxy(real, {
  get(target, key) {
    if (key === "launch") return launch;
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
