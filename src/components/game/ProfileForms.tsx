// #766 second slice: the Profile sheet's Edit profile and Change PIN forms, in their own chunk. It loads only when a signed-in
// player opens one of them, or must change a temporary PIN from a local reset. The sheet keeps the state; this chunk lays out
// the two forms with the sheet's own field and action-row markup, checks them and sends their requests.
import { useEffect, useRef, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import type { ProfileFields, ProfileOwner } from "@/lib/net/profiles";
import { LOGIN } from "@/lib/net/proto";
import type { Errors, FormsUi } from "@/components/game/ProfileSheet";

const PIN = /^\d{4}$/;
const field = "h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg aria-[invalid=true]:border-accent-ink";
type Text = "displayName" | "login" | "pin" | "newPin" | "pinConfirm" | "catchphrase";

export function ProfileForms({ ui }: { ui: FormsUi }) {
  const { kind, c, form, setForm, errors, setErrors, busy, setBusy, showPin, setShowPin, back } = ui;
  // The sheet renders this only while signed in.
  const { host, profile } = c.getSnapshot() as { host: string; profile: ProfileOwner };
  const ref = useRef<HTMLFormElement>(null);
  // Opening a form fills it from the profile, clears every PIN and puts the focus in its first field. Closing it hands the
  // focus back to the summary button that opened it, once the summary is drawn (gone if the sheet closed or signed out).
  useEffect(() => {
    setForm((f) => ({ ...f, displayName: profile.displayName, login: profile.login, catchphrase: profile.catchphrase, color: profile.color, backupColor: profile.backupColor ?? "", pin: "", newPin: "", pinConfirm: "" }));
    ref.current?.querySelector("input")?.focus();
    return () => void requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-opens="${kind}"]`)?.focus());
  }, [kind, profile, setForm]);

  // Like the sheet's own requests: confirm the shown host, then put a refusal beside its field. The host refuses a wrong
  // current PIN with the sign-in code, so it goes beside Current PIN; a revoked device lands back on Sign in.
  const send = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setErrors({});
    try {
      c.confirmHost(host);
      await run();
      back();
    } catch (e) {
      // A ProfileClientError carries a code. Checked by shape: importing the class would split the profile client into a
      // chunk of its own.
      const known = typeof (e as { code?: unknown })?.code === "string";
      const code = known ? (e as { code: string }).code : "unavailable";
      const message = known ? (e as Error).message : "Profiles unavailable on this host.";
      if (code === "signedOut") back();
      setErrors(code === "loginTaken" ? { login: message } : code === "signInFailed" ? { pin: "Check your current PIN, or try again later." } : { form: message });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const login = form.login.trim().toLowerCase();
    const renamed = login !== profile.login;
    const bad: Errors = {};
    const pinOk = (k: "pin" | "newPin") => { if (!PIN.test(form[k])) bad[k] = "Enter four digits."; };
    if (kind === "pin") {
      pinOk("pin");
      pinOk("newPin");
      if (form.pinConfirm !== form.newPin) bad.pinConfirm = "The PINs don't match.";
    } else {
      if (!form.displayName.trim()) bad.displayName = "Enter a display name.";
      if (login.length < 3 || login.length > 24 || !LOGIN.test(login)) bad.login = "Use 3 to 24 lowercase letters, digits and single dashes.";
      if (renamed) pinOk("pin");
    }
    if (Object.keys(bad).length) return setErrors(bad);
    if (kind === "pin") return void send(() => c.changePin(form.pin, form.newPin, form.pinConfirm));
    // A login change carries the current PIN; an unchanged login is no rename and needs none.
    const fields: Partial<ProfileFields> & { pin?: string } = { displayName: form.displayName.trim(), login, catchphrase: form.catchphrase.trim(), color: form.color };
    if (form.backupColor) fields.backupColor = form.backupColor;
    if (renamed) fields.pin = form.pin;
    void send(() => c.edit(fields));
  };

  const input = (k: Text, label: string, extra: object) => (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {label}
        <input
          value={form[k]}
          onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
          aria-invalid={errors[k] ? true : undefined}
          aria-describedby={errors[k] ? `profile-${k}-error` : undefined}
          className={field}
          {...extra}
        />
      </label>
      {errors[k] ? <p id={`profile-${k}-error`} className="text-sm text-accent-ink">{errors[k]}</p> : null}
    </div>
  );
  const pin = (fresh: boolean) => ({ type: showPin ? "text" : "password", inputMode: "numeric", pattern: "[0-9]*", maxLength: 4, autoComplete: fresh ? "new-password" : "current-password" });
  const showToggle = (
    <Button variant="ghost" className="self-start px-3" aria-pressed={showPin} onClick={() => setShowPin(!showPin)}>
      {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      {showPin ? "Hide PIN" : "Show PIN"}
    </Button>
  );
  const formError = errors.form ? <p role="alert" className="text-sm text-accent-ink">{errors.form}</p> : null;
  // Picking the backup as favourite swaps the two, so they never match; the favourite can't also be the backup.
  const colours = (k: "color" | "backupColor", label: string) => (
    <>
      <p className="text-sm font-medium text-fg">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {PLAYER_COLORS.map((col, i) => (
          <button
            key={col}
            type="button"
            role="radio"
            aria-checked={form[k] === col}
            aria-label={PLAYER_NAMES[i]}
            title={PLAYER_NAMES[i]}
            disabled={k === "backupColor" && form.color === col}
            onClick={() => setForm((f) => (k === "color" && f.backupColor === col ? { ...f, color: col, backupColor: f.color } : { ...f, [k]: col }))}
            className="grid size-11 place-items-center rounded-control border-2 p-1 disabled:opacity-30"
            style={{ borderColor: form[k] === col ? "#1c1915" : "transparent" }}
          >
            <SeatDot color={col} className="size-7" />
          </button>
        ))}
      </div>
    </>
  );
  // The sheet's sticky action row. A temporary PIN offers Sign out where the other forms offer Cancel.
  const save = (label: string) => (
    <div className="sticky bottom-0 -mx-5 space-y-3 border-t border-border bg-surface px-5 pb-5 pt-3">
      <Button size="lg" variant="primary" type="submit" className="w-full" disabled={busy}>
        {label}
      </Button>
      {kind === "pin" && profile.pinMustChange ? (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void send(() => c.logout())}>
          Sign out
        </Button>
      ) : (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => back()} back>
          Cancel
        </Button>
      )}
    </div>
  );

  if (kind === "pin") {
    return (
      <form ref={ref} noValidate aria-label="Change PIN" className="flex flex-col gap-3" onSubmit={submit}>
        {profile.pinMustChange ? <p role="alert" className="text-sm text-accent-ink">Change your PIN before continuing.</p> : null}
        {input("pin", "Current PIN", pin(false))}
        {input("newPin", "New PIN", pin(true))}
        {input("pinConfirm", "Confirm new PIN", pin(true))}
        {showToggle}
        <p className="text-sm text-muted">Your other devices will be signed out.</p>
        {formError}
        {save("Save PIN")}
      </form>
    );
  }
  const renamed = form.login.trim().toLowerCase() !== profile.login;
  return (
    <form ref={ref} noValidate aria-label="Edit profile" className="flex flex-col gap-3" onSubmit={submit}>
      {input("displayName", "Display name", { maxLength: 16, autoComplete: "nickname" })}
      {input("login", "Login", { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 24, autoComplete: "username" })}
      {renamed ? input("pin", "Current PIN", pin(false)) : null}
      {renamed ? showToggle : null}
      {input("catchphrase", "Catchphrase (optional)", { maxLength: 80 })}
      {colours("color", "Favourite colour")}
      {colours("backupColor", "Backup colour")}
      {formError}
      {save("Save")}
    </form>
  );
}
