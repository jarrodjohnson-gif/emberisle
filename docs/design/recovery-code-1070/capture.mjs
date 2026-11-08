// #1414 design capture: the short permanent recovery code (#1070), drawn over the real Profile sheet against a real rules host.
// "Today" pictures are the real sheet, untouched. Proposal pictures are a mock: mock.css and the DOM added below sit on the real
// sheet, reuse its real buttons' classes, and copy its field classes (the run fails if those drift from the real fields).
// The profile is really created on the real host first, so the signed-in pictures are the real signed-in sheet.
// The run fails if the real sheet, sign-in form, fields, buttons or signed-in summary are missing, if any control is under
// 44 px, if the sheet or its main button leaves the screen, if the code is cut, or if the page logs an error.
// No src/ file changes. Not a CI proof. Run from the repo root, one browser at a time:
//   node --import ./server/register.mjs docs/design/recovery-code-1070/capture.mjs          (writes to a new temp folder)
//   node --import ./server/register.mjs docs/design/recovery-code-1070/capture.mjs --save   (replaces the pictures here)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "recovery-code-1414-"));
console.error(`pictures: ${out}`);
const css = readFileSync(path.join(dir, "mock.css"), "utf8");
const work = mkdtempSync(path.join(tmpdir(), "recovery-code-1414-host-"));

// The owner's phones and iPad. Touch everywhere, so the game's own phone test is true. Device scale 1.5 keeps the set under 8 MB.
const SIZES = [[430, 932], [390, 844], [375, 812], [820, 1180]];
// Extra pictures at this size only: the wrong-code answer, and how options A and C would look on the save screen.
const EXTRA = "390x844";
// Sample codes. B is the recommendation; A and C are drawn for comparison. The dash is for reading only.
const CODES = { a: "482-913", b: "K7Q-M4X", c: "K7QM-4XR2" };
const SPOKEN = { a: "4, 8, 2, 9, 1, 3", b: "K, 7, Q, M, 4, X", c: "K, 7, Q, M, 4, X, R, 2" };
const LOGIN = "rowan";
const PIN = "2468";

// One real rules host per size, on a fresh profile store, with the explicit loopback development switch (profile-protocol.mjs).
async function startHost(name) {
  const proc = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: path.join(dir, "../../../server"),
    env: { ...process.env, PORT: "0", ROOMS_DIR: path.join(work, name, "rooms"), PROFILES_DIR: path.join(work, name, "profiles"), PROFILES_DEV: "1", SAVE_MS: "20" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("host startup timed out")), 15000);
    let text = "";
    proc.stdout.on("data", (d) => { text += d; const m = text.match(/listening (\d+)/); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
    proc.once("exit", () => { clearTimeout(timer); reject(Error("host exited before startup")); });
  });
  return { proc, port };
}

// Runs in the page, on the open sheet. Checks the real sheet and keeps its real classes for the mock.
function realSheet() {
  const FIELD = "h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg aria-[invalid=true]:border-accent-ink";
  const ACTIONS = "sticky bottom-0 -mx-5 space-y-3 border-t border-border bg-surface px-5 pb-5 pt-3";
  const d = document.querySelector('[data-testid="profile-sheet"][role="dialog"]');
  if (!d || d.querySelector("#profile-title")?.textContent !== "Profile") throw new Error("real Profile sheet missing");
  if (!d.querySelector('[data-testid="profile-host"]')) throw new Error("real host line missing");
  const form = d.querySelector('form[aria-label="Sign in"]');
  if (!form) throw new Error("real Sign in form missing");
  const inputs = [...form.querySelectorAll("label > input")];
  const byLabel = (t) => inputs.find((i) => i.parentElement.firstChild.textContent === t);
  if (!byLabel("Login") || !byLabel("PIN")) throw new Error("real Login or PIN field missing");
  if (byLabel("Login").className !== FIELD || byLabel("PIN").className !== FIELD) throw new Error("real field classes changed; update the mock");
  const buttons = [...d.querySelectorAll("button")];
  const named = (t) => buttons.find((b) => b.textContent.trim() === t);
  const submit = named("Sign in"), create = named("Create profile"), guest = named("Continue as guest"), show = named("Show PIN");
  if (!submit || !create || !guest || !show) throw new Error("real Sign in, Create profile, Continue as guest or Show PIN missing");
  if (submit.parentElement.className !== ACTIONS) throw new Error("real sticky action row changed; update the mock");
  if (!form.querySelector('label > input[type="checkbox"]')?.parentElement.textContent.includes("Remember me on this device")) throw new Error("real Remember me missing");
  window.__rc = { FIELD, ACTIONS, primary: submit.className, secondary: create.className, ghost: show.className, remember: form.querySelector('label:has(input[type="checkbox"])').cloneNode(true) };
}

// Runs in the page. Draws one proposal state over the real sheet. Each call starts from the real sheet again.
function mock({ css, state, code, spoken, login, pin, error }) {
  const rc = window.__rc;
  const d = document.querySelector('[data-testid="profile-sheet"]');
  const body = d.querySelector(":scope > div.overflow-y-auto");
  if (!rc || !body) throw new Error("real sheet body missing");
  if (!document.getElementById("rc-css")) {
    const style = document.createElement("style");
    style.id = "rc-css";
    style.textContent = css;
    document.head.append(style);
  }
  for (const el of body.querySelectorAll(".rc-mock")) el.remove();
  for (const el of body.querySelectorAll(".rc-hidden")) el.classList.remove("rc-hidden");
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const mine = (e) => (e.classList.add("rc-mock"), e);
  const button = (cls, text, type = "button") => Object.assign(el("button", cls, text), { type });
  const field = (label, value, attrs = {}, extra = "") => {
    const wrap = el("div", "flex flex-col gap-1");
    const l = el("label", "flex flex-col gap-1 text-sm font-medium text-fg", label);
    const input = el("input", `${rc.FIELD}${extra}`);
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    input.value = value;
    l.append(input);
    wrap.append(l);
    return wrap;
  };
  const pinAttrs = (fresh) => ({ type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: "4", autocomplete: fresh ? "new-password" : "current-password" });
  const actions = (...kids) => { const a = el("div", rc.ACTIONS); a.append(...kids); return a; };
  const hideAll = () => { for (const c of body.children) c.classList.add("rc-hidden"); };
  const named = (t) => [...body.querySelectorAll("button")].find((b) => b.textContent.trim() === t);

  if (state === "signin") {
    const show = named("Show PIN");
    if (!show) throw new Error("real Show PIN missing");
    const forgot = mine(button(rc.ghost, "Forgot your PIN? Use your recovery code"));
    forgot.dataset.testid = "rc-forgot";
    forgot.style.whiteSpace = "normal";
    forgot.style.textAlign = "left";
    show.after(forgot);
    return;
  }
  if (state === "recover") {
    const form = body.querySelector('form[aria-label="Sign in"]');
    const create = named("Create profile");
    const guest = named("Continue as guest");
    if (!form || !create || !guest) throw new Error("real sign-in body missing");
    form.classList.add("rc-hidden");
    create.classList.add("rc-hidden");
    const f = mine(el("form", "flex flex-col gap-3"));
    f.setAttribute("aria-label", "Use your recovery code");
    f.noValidate = true;
    f.addEventListener("submit", (e) => e.preventDefault());
    const hint = el("p", "text-sm text-muted", "6 letters and digits, from when you made your profile. It never uses 0, O, 1, I, L or U.");
    hint.id = "rc-code-hint";
    const codeField = field("Recovery code", code, { autocomplete: "off", autocapitalize: "characters", autocorrect: "off", spellcheck: "false", maxlength: "9", "aria-describedby": "rc-code-hint" }, " rc-code-input");
    codeField.append(hint);
    f.append(
      el("p", "rc-title", "Forgot your PIN?"),
      el("p", "text-sm text-fg", "Enter your login and your recovery code, then choose a new PIN."),
      field("Login", login, { autocapitalize: "none", autocorrect: "off", spellcheck: "false", maxlength: "24", autocomplete: "username" }),
      codeField,
      field("New PIN", pin, pinAttrs(true)),
      field("Confirm new PIN", pin, pinAttrs(true)),
      named("Show PIN").cloneNode(true),
      el("p", "text-sm text-muted", "Your other devices will be signed out."),
      rc.remember.cloneNode(true),
    );
    f.querySelector('input[type="checkbox"]').checked = true;
    if (error) {
      const alert = el("p", "text-sm text-accent-ink", "Couldn't use that code. Check your login and code, or try again later. Still stuck? Ask the host for a reset.");
      alert.setAttribute("role", "alert");
      f.append(alert);
    }
    f.append(actions(button(rc.primary, "Reset PIN and sign in", "submit")));
    const back = mine(button(rc.secondary, "Back to sign in"));
    guest.before(f, back);
    // The refusal sits under the fields, as the real sheet's form errors do: scroll it into view for its picture.
    if (error) f.querySelector('[role="alert"]').scrollIntoView({ block: "center" });
    return;
  }

  // Signed in: the real summary is under everything below.
  const done = named("Done"), edit = named("Edit profile"), pinBtn = named("Change PIN"), out = named("Sign out");
  if (!done || !edit || !pinBtn || !out || !body.textContent.includes("Signed in as")) throw new Error("real signed-in summary missing");
  if (state === "summary") {
    const remembered = [...body.querySelectorAll("p")].find((p) => /remembered on this device/i.test(p.textContent));
    if (!remembered) throw new Error("real remembered line missing");
    remembered.after(mine(el("p", "text-sm text-muted", "Recovery code made 7 Nov 2026.")));
    const again = mine(button(`${edit.className} w-full`, "New recovery code"));
    again.dataset.testid = "rc-new";
    edit.parentElement.after(again);
    return;
  }
  hideAll();
  if (state === "save") {
    const box = mine(el("div", "rc-code"));
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Your recovery code");
    const text = el("span", "rc-code-text", code);
    text.dataset.testid = "rc-code";
    text.setAttribute("aria-label", spoken);
    box.append(text, button(rc.ghost, "Copy"));
    const list = mine(el("ul", "rc-list text-sm text-fg"));
    for (const t of ["It stays the same until you ask for a new one.", "Nobody can show it to you again, not even the host.", "Anyone with your login and this code can set a new PIN."]) list.append(el("li", null, t));
    const check = mine(el("label", "flex min-h-11 items-center gap-3 text-sm text-fg"));
    const box2 = Object.assign(el("input", "size-5 accent-[var(--ink)]"), { type: "checkbox" });
    check.append(box2, "I've written it down");
    const go = button(rc.primary, "Done");
    go.disabled = true;
    box2.addEventListener("change", () => { go.disabled = !box2.checked; });
    body.append(
      mine(el("p", "rc-title", "Save your recovery code")),
      mine(el("p", "text-sm text-fg", "If you forget your PIN, your login and this code get you back in. Write it down and keep it safe.")),
      box, list, check, mine(actions(go)),
    );
    return;
  }
  if (state === "newcode") {
    const f = mine(el("form", "flex flex-col gap-3"));
    f.setAttribute("aria-label", "New recovery code");
    f.noValidate = true;
    f.addEventListener("submit", (e) => e.preventDefault());
    f.append(
      el("p", "rc-title", "New recovery code"),
      el("p", "text-sm text-fg", "Your old code stops working as soon as you get a new one."),
      field("Current PIN", pin, pinAttrs(false)),
      actions(button(rc.primary, "Make new code", "submit"), button(out.className, "Cancel")),
    );
    body.append(f);
    return;
  }
  throw new Error(`unknown state ${state}`);
}

// Runs in the page: the numbers each picture is judged by.
function measure() {
  const d = document.querySelector('[data-testid="profile-sheet"]');
  const body = d.querySelector(":scope > div.overflow-y-auto");
  const r = d.getBoundingClientRect();
  const shown = (e) => e.getClientRects().length > 0;
  const controls = [...d.querySelectorAll('button, input:not([type="checkbox"]), label:has(input[type="checkbox"])')].filter(shown);
  const sticky = [...body.querySelectorAll(".sticky")].filter(shown).at(-1);
  const main = sticky?.querySelector("button");
  const m = main?.getBoundingClientRect();
  const code = document.querySelector('[data-testid="rc-code"]');
  return {
    sheet: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) },
    sheetInView: r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
    bodyScrolls: body.scrollHeight > body.clientHeight + 1 ? body.scrollHeight - body.clientHeight : 0,
    pageScrolled: Math.round(document.scrollingElement.scrollTop),
    mainButton: main ? main.textContent.trim() : null,
    mainInView: Boolean(m) && m.top >= r.top - 1 && m.bottom <= Math.min(r.bottom, innerHeight) + 1,
    shortControls: controls.filter((c) => c.offsetHeight < 44).map((c) => c.textContent.trim() || c.getAttribute("aria-label") || c.closest("label")?.firstChild?.textContent || c.tagName),
    controls: controls.map((c) => c.textContent.trim() || c.getAttribute("aria-label") || c.closest("label")?.firstChild?.textContent).filter(Boolean),
    code: code ? { text: code.textContent, cut: code.scrollWidth > code.clientWidth + 1, w: Math.round(code.getBoundingClientRect().width) } : null,
  };
}

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const site = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const result = { browser: browser.version(), runs: [] };
const fail = (msg) => { throw new Error(msg); };
const hosts = [];

try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const host = await startHost(tag);
    hosts.push(host);
    const url = `${site}?host=${encodeURIComponent(`ws://127.0.0.1:${host.port}`)}`;
    const rec = { size: tag };
    const page = async () => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
      const p = await context.newPage();
      p.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
      p.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
      await p.goto(url);
      await p.waitForFunction(() => !!window.__emberisle);
      // Profile sits inside the closed "Your seat" settings (profiles-ui-prove.mjs does the same).
      if (!(await p.evaluate(() => document.querySelector("details.seat-settings")?.open))) await p.locator("details.seat-settings > summary").click();
      const profile = p.getByRole("button", { name: "Profile", exact: true });
      await profile.scrollIntoViewIfNeeded();
      await profile.click();
      const sheet = p.getByRole("dialog", { name: "Profile" });
      await sheet.waitFor();
      await sheet.getByRole("form", { name: "Sign in" }).waitFor({ timeout: 10000 }).catch(() => fail(`${tag}: the real host never offered Sign in`));
      await p.evaluate(realSheet);
      await p.waitForTimeout(400);
      return p;
    };
    const take = async (p, key, picture) => {
      await p.waitForTimeout(150);
      const m = await p.evaluate(measure);
      rec[key] = m;
      if (!m.sheetInView) fail(`${tag} ${key}: the sheet leaves the screen`);
      if (m.shortControls.length) fail(`${tag} ${key}: under 44 px: ${m.shortControls}`);
      if (m.mainButton && !m.mainInView) fail(`${tag} ${key}: ${m.mainButton} is off screen`);
      if (m.pageScrolled) fail(`${tag} ${key}: the page scrolled ${m.pageScrolled} px`);
      if (m.code?.cut) fail(`${tag} ${key}: the code is cut`);
      if (picture) await p.screenshot({ path: path.join(out, `${picture}-${tag}.png`) });
    };
    const draw = (p, state, extra = {}) => p.evaluate(mock, { css, state, code: CODES.b, spoken: SPOKEN.b, login: LOGIN, pin: PIN, ...extra });

    // A device that has never signed in: today's sheet, the new link, the recovery form.
    const one = await page();
    await take(one, "beforeSignin", "before-signin");
    await draw(one, "signin");
    await take(one, "signin", "signin");
    await one.getByTestId("rc-forgot").tap();
    await draw(one, "recover");
    await one.getByRole("form", { name: "Use your recovery code" }).waitFor();
    await take(one, "recover", "recover");
    if (tag === EXTRA) {
      await draw(one, "recover", { error: true });
      await take(one, "recoverError", "recover-error");
    }
    await one.context().close();

    // Really create a profile on the real host; today the sheet goes straight to the summary.
    const two = await page();
    const sheet = two.getByRole("dialog", { name: "Profile" });
    await sheet.getByRole("button", { name: "Create profile", exact: true }).tap();
    await sheet.getByLabel("Display name").fill("Rowan");
    await sheet.getByLabel("Login").fill(LOGIN);
    await sheet.getByLabel("PIN", { exact: true }).fill(PIN);
    await sheet.getByLabel("Confirm PIN").fill(PIN);
    await sheet.getByRole("form", { name: "Create profile" }).getByRole("button", { name: "Create profile" }).tap();
    await sheet.getByText("Signed in as").waitFor({ timeout: 15000 }).catch(() => fail(`${tag}: the real host did not create the profile`));
    await two.waitForTimeout(300);
    await take(two, "beforeSummary", "before-summary");
    await draw(two, "save");
    await take(two, "save", "save");
    if (tag === EXTRA) {
      for (const k of ["a", "c"]) {
        await draw(two, "save", { code: CODES[k], spoken: SPOKEN[k] });
        await take(two, `save-${k}`, `save-${k}`);
      }
      await draw(two, "save");
    }
    const done = sheet.getByRole("button", { name: "Done" });
    if (!(await done.isDisabled())) fail(`${tag}: Done is pressable before "I've written it down"`);
    await sheet.getByLabel("I've written it down").check();
    if (await done.isDisabled()) fail(`${tag}: Done stays off after "I've written it down"`);
    await draw(two, "summary");
    await take(two, "summary", "summary");
    await two.getByTestId("rc-new").tap();
    await draw(two, "newcode");
    await take(two, "newcode", "newcode");
    await two.context().close();

    result.runs.push(rec);
    console.log(tag, JSON.stringify(rec));
    host.proc.kill();
  }
} finally {
  for (const h of hosts) h.proc.kill();
  await browser.close();
  await vite.close();
  rmSync(work, { recursive: true, force: true });
}
result.errors = errors;
writeFileSync(path.join(out, "measurements.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ errors }));
if (errors.length) process.exit(1);
