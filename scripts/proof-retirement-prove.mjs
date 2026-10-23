// #947: exercise the real guard CLI against separate Git histories. A PR's HEAD must never authorize its own deletion.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./loosen-prove.mjs", import.meta.url));
function history(label, { baseList = "valid", baseRow = true, headList, headRow, action = "delete",
  file = "scripts/example-prove.mjs", owner = false, want = 0, message = "1 retired by" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "emberisle-retirement-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  try {
    const row = `| 2026-10-21 | Retire \`${file}\` after feature removal. | Jarrod, #947 |`;
    const entry = { file, date: "2026-10-21", issue: 947, reason: "feature removed", decision: row };
    const list = (kind) => kind === "bad" ? "not JSON" : JSON.stringify({ entries: kind === "valid" ? [entry] : [] });
    git("init", "-q"); git("config", "user.name", "Retirement fixture"); git("config", "user.email", "fixture@example.invalid");
    put("docs/DECISIONS.md", baseRow ? `${row}\n` : "# Decisions\n");
    if (baseList !== null) put("docs/retired-proofs.json", list(baseList));
    const proof = 'import assert from "node:assert/strict";\nassert.equal(1, 1);\n';
    if (action !== "add") put(file, proof);
    git("add", "."); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
    if (headList !== undefined) put("docs/retired-proofs.json", list(headList));
    if (headRow !== undefined) put("docs/DECISIONS.md", headRow ? `${row}\n` : "# Decisions\n");
    if (action === "delete") unlinkSync(join(dir, file));
    if (action === "add") put(file, proof);
    if (action === "weaken") put(file, 'import assert from "node:assert/strict";\n');
    if (action === "rename") git("mv", file, "scripts/example.mjs");
    git("add", "-A"); git("commit", "-qm", "head");
    const login = owner ? "owner" : "collaborator";
    put("event.json", JSON.stringify({ repository: { owner: { login: "owner" } },
      pull_request: { user: { login } }, sender: { login } }));
    const run = spawnSync(process.execPath, [guard, "--base", base], { cwd: dir, encoding: "utf8", timeout: 20000,
      env: { ...process.env, GITHUB_EVENT_PATH: join(dir, "event.json") } });
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    assert.equal(run.status, want, `${label}: ${run.error ?? ""}\n${output}`);
    assert.ok(output.includes(message), `${label}: expected ${JSON.stringify(message)}\n${output}`);
    console.log(`ok   ${label}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

history("a prior base listing and decision authorize deletion");
history("an unlisted deletion fails", { baseList: "empty", want: 1, message: "does not list it" });
history("even an owner cannot authorize deletion by listing it on HEAD", {
  baseList: "empty", headList: "valid", owner: true, want: 1, message: "does not list it" });
history("a HEAD-only decision cannot authorize deletion", { baseRow: false, headRow: true, want: 1, message: "decision row" });
history("a malformed base list cannot authorize deletion", { baseList: "bad", want: 1, message: "does not list it" });
for (const file of ["scripts/loosen-prove.mjs", "scripts/registered-prove.mjs"])
  history(`${file} cannot retire itself`, { file, want: 1, message: "proof guard" });
history("an added proof cannot reuse a retired path", { action: "add", want: 1, message: "reuses a retired path" });
history("a listed proof still cannot lose checks", { action: "weaken", want: 1, message: "removed or edited check line" });
history("a listed proof still cannot rename away", { action: "rename", want: 1, message: "renamed away" });
history("an owner changing the list needs a decision already on the base", {
  baseList: "empty", baseRow: false, headList: "valid", owner: true, action: "add", want: 1, message: "decision row" });
history("a collaborator cannot create a populated seed", {
  baseList: null, headList: "valid", action: "add", want: 1, message: "owner-only" });
console.log("proof-retirement-prove: all 12 real Git histories passed");
