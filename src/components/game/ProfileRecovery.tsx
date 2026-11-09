// #1437: the Profile sheet's recovery code screens (docs/design/recovery-code-1070), in their own chunk. The sheet loads it
// before it asks the host for anything that answers with a code (Create profile, the PIN change after a local reset), so a
// code shown only once is never lost to a chunk that failed to load. It also fetches it as the sheet opens, for the
// "Forgot your PIN?" link and the summary's recovery row, which wait for it.
// - link: "Forgot your PIN? Use your recovery code", under Show PIN on Sign in, only when the host offers recoveryV1.
// - row: on the signed-in summary, when the code was made and New recovery code (Get a recovery code before the first).
// - save: "Save your recovery code". The code in large type, Copy, and Done, which stays off until "I've written it down".
// - code: New recovery code. It asks for the current PIN; the old code stops working at once.
// - recover: Forgot your PIN. The login, the code and a new PIN twice. Typing is forgiving: lower case works, spaces and
//   dashes are dropped. A typed 0, O, 1, I, L or U is refused beside the field and never sent, so it costs no try.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecoveryUi } from "@/components/game/ProfileSheet";
import { LOGIN } from "@/lib/net/proto";

const PIN = /^\d{4}$/;
const field = "h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg aria-[invalid=true]:border-accent-ink";
const title = "font-display text-xl font-bold text-fg";
type Key = "login" | "code" | "pin" | "newPin" | "pinConfirm" | "form";
type Errs = Partial<Record<Key, string>>;

// The sheet's sticky action row, as on its other forms.
const actions = (children: ReactNode) => <div className="sticky bottom-0 -mx-5 space-y-3 border-t border-border bg-surface px-5 pb-5 pt-3">{children}</div>;

export function ProfileRecovery({ ui }: { ui: RecoveryUi }) {
  const { kind, c, go, keep, setKeep, showPin, setShowPin } = ui;
  const snap = c.getSnapshot();
  const root = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({ login: "", code: "", pin: "", newPin: "", pinConfirm: "" });
  const [errors, setErrors] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState(false);
  const [copied, setCopied] = useState(false);

  // A form or the save screen takes the focus as it opens; a refused field takes it after a press.
  useEffect(() => {
    if (kind === "link" || kind === "row") return;
    root.current?.querySelector<HTMLElement>(kind === "save" ? '[role="group"]' : "input")?.focus();
    // New recovery code and the save screen hand the focus to the summary's recovery button, once the summary is drawn.
    if (kind === "code" || kind === "save") return () => void requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-opens="code"]')?.focus());
  }, [kind]);
  useEffect(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), [errors]);

  // The link and the row show only when the host offers recovery codes (caps recoveryV1).
  if ((kind === "link" || kind === "row") && !snap.recovery) return null;
  if (kind === "link") {
    return (
      <Button variant="ghost" className="h-auto min-h-11 self-start whitespace-normal px-3 text-left" onClick={() => go("recover")}>
        Forgot your PIN? Use your recovery code
      </Button>
    );
  }
  if (kind === "row") {
    const at = snap.setAt;
    return (
      <>
        <p className="text-sm text-muted">{at ? `Recovery code made ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` : "No recovery code yet."}</p>
        <Button variant="secondary" className="w-full" data-opens="code" onClick={() => go("code")}>
          {at ? "New recovery code" : "Get a recovery code"}
        </Button>
      </>
    );
  }

  const set = (k: keyof typeof v) => (value: string) => setV((f) => ({ ...f, [k]: value }));
  const send = async (run: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    setErrors({});
    try {
      c.confirmHost(snap.host);
      await run();
      after();
    } catch (e) {
      // A ProfileClientError carries a code. Checked by shape, so the profile client stays in the sheet's chunk.
      const code = typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : "unavailable";
      // Every refusal of a code reads alike: a wrong code, an unknown login, a spent budget or a locked code.
      const message = code === "recoverFailed" ? "Couldn't use that code. Check your login and code, or try again later." : code === "unavailable" ? "Profiles unavailable on this host." : (e as Error).message;
      if (code === "signedOut") go("signin");
      setErrors(kind === "code" && code === "signInFailed" ? { pin: "Check your current PIN, or try again later." } : { form: message });
    } finally {
      setBusy(false);
    }
  };
  const input = (k: Exclude<Key, "form">, label: string, extra: object, hint?: ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {label}
        <input
          value={v[k]}
          onChange={(e) => set(k)(e.target.value)}
          aria-invalid={errors[k] ? true : undefined}
          aria-describedby={[hint ? `recovery-${k}-hint` : "", errors[k] ? `recovery-${k}-error` : ""].join(" ").trim() || undefined}
          className={field}
          {...extra}
        />
      </label>
      {hint ? <p id={`recovery-${k}-hint`} className="text-sm text-muted">{hint}</p> : null}
      {errors[k] ? <p id={`recovery-${k}-error`} className="text-sm text-accent-ink">{errors[k]}</p> : null}
    </div>
  );
  const pin = (fresh: boolean) => ({ type: showPin ? "text" : "password", inputMode: "numeric", pattern: "[0-9]*", maxLength: 4, autoComplete: fresh ? "new-password" : "current-password" });
  const formError = errors.form ? <p role="alert" className="text-sm text-accent-ink">{errors.form}</p> : null;

  if (kind === "save") {
    const code = String(snap.code);
    // Copy is the player's choice: it puts the code on this device's clipboard.
    const copy = () => void navigator.clipboard?.writeText(code).then(() => setCopied(true), () => {});
    return (
      <div ref={root} className="flex flex-col gap-3">
        <h3 className={title}>Save your recovery code</h3>
        <p className="text-sm text-fg">If you forget your PIN, your login and this code get you back in. Write it down and keep it safe.</p>
        <div role="group" aria-label="Your recovery code" tabIndex={-1} className="flex items-center justify-between gap-2 rounded-chip border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-sea)_8%,var(--color-surface))] py-2 pl-4 pr-2">
          {/* Screen readers spell it out: "K, 7, Q, M, 4, X". The dash is only for reading. */}
          <span data-testid="recovery-code" aria-label={code.split("").join(", ")} className="overflow-hidden whitespace-nowrap font-mono text-3xl/10 font-bold tracking-[0.08em] text-fg">
            {code.slice(0, 3)}-{code.slice(3)}
          </span>
          <Button variant="ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        <ul className="list-disc space-y-1 pl-[1.1rem] text-sm text-fg">
          <li>It stays the same until you ask for a new one.</li>
          <li>Nobody can show it to you again, not even the host.</li>
          <li>Anyone with your login and this code can set a new PIN.</li>
        </ul>
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} className="size-5 accent-[var(--ink)]" />
          I've written it down
        </label>
        {actions(
          <Button size="lg" variant="primary" className="w-full" disabled={!written} onClick={() => { c.code(null, c.getSnapshot().setAt); go("signin"); }}>
            Done
          </Button>,
        )}
      </div>
    );
  }

  if (kind === "code") {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (!PIN.test(v.pin)) return setErrors({ pin: "Enter four digits." });
      // The new code lands in the client's snapshot, and the sheet shows "Save your recovery code".
      void send(async () => {
        const r = await c.query("profileNewCode", { pin: v.pin }, "profileRecoveryCode");
        c.code(r.code as string, r.setAt as number);
      }, () => go("signin"));
    };
    return (
      <div ref={root}>
        <form noValidate aria-label="New recovery code" className="flex flex-col gap-3" onSubmit={submit}>
          <h3 className={title}>{snap.setAt ? "New recovery code" : "Get a recovery code"}</h3>
          <p className="text-sm text-fg">{snap.setAt ? "Your old code stops working as soon as you get a new one." : "If you forget your PIN, your login and this code get you back in."}</p>
          {input("pin", "Current PIN", pin(false))}
          {formError}
          {actions(
            <>
              <Button size="lg" variant="primary" type="submit" className="w-full" disabled={busy}>
                Make new code
              </Button>
              <Button variant="secondary" className="w-full" disabled={busy} onClick={() => go("signin")} back>
                Cancel
              </Button>
            </>,
          )}
        </form>
      </div>
    );
  }

  // Forgot your PIN: everything is checked here first, so a typo is never sent and never costs a try.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const login = v.login.trim().toLowerCase();
    const code = v.code.replace(/[\s-]/g, "").toUpperCase();
    const bad: Errs = {};
    if (login.length < 3 || login.length > 24 || !LOGIN.test(login)) bad.login = "Use 3 to 24 lowercase letters, digits and single dashes.";
    if (/[01OILU]/.test(code)) bad.code = "It never uses 0, O, 1, I, L or U.";
    else if (!/^[2-9A-Z]{6}$/.test(code)) bad.code = "Enter the 6 letters and digits.";
    if (!PIN.test(v.newPin)) bad.newPin = "Enter four digits.";
    if (v.pinConfirm !== v.newPin) bad.pinConfirm = "The PINs don't match.";
    if (Object.keys(bad).length) return setErrors(bad);
    void send(() => c.session("profileRecover", { login, code, newPin: v.newPin, newPinConfirm: v.pinConfirm }, keep, false), () => go("signin"));
  };
  return (
    <div ref={root} className="space-y-3">
      <form noValidate aria-label="Use your recovery code" className="flex flex-col gap-3" onSubmit={submit}>
        <h3 className={title}>Forgot your PIN?</h3>
        <p className="text-sm text-fg">Enter your login and your recovery code, then choose a new PIN.</p>
        {input("login", "Login", { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 24, autoComplete: "username" })}
        {input("code", "Recovery code", { autoCapitalize: "characters", autoCorrect: "off", spellCheck: false, maxLength: 11, autoComplete: "off", className: `${field} font-mono uppercase tracking-[0.08em]` }, "6 letters and digits, from when you made your profile. It never uses 0, O, 1, I, L or U.")}
        {input("newPin", "New PIN", pin(true))}
        {input("pinConfirm", "Confirm new PIN", pin(true))}
        <Button variant="ghost" className="self-start px-3" aria-pressed={showPin} onClick={() => setShowPin(!showPin)}>
          {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showPin ? "Hide PIN" : "Show PIN"}
        </Button>
        <p className="text-sm text-muted">Your other devices will be signed out.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-5 accent-[var(--ink)]" />
          Remember me
        </label>
        {formError}
        <p className="text-sm text-muted">Still stuck? Ask the host for a reset.</p>
        {actions(
          <Button size="lg" variant="primary" type="submit" className="w-full" disabled={busy}>
            Reset PIN and sign in
          </Button>,
        )}
      </form>
      <Button variant="secondary" className="w-full" onClick={() => go("signin")} back>
        Back to sign in
      </Button>
    </div>
  );
}
