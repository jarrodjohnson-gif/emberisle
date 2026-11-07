// #766 first slice: the title's Profile sheet (docs/design/profiles.md, "Profile and Wins surfaces"). Sign in, create a
// profile, resume a remembered one and sign out, against the host this page plays on. The host is shown before anything is
// sent and every credential request confirms it first; a signed-in session rides on the next Host or Join through the store's
// `profile`, never in game state or a saved seat. Guest play never waits on this sheet.
// #766 second slice: signed in, the player edits the profile's text and colours and changes the PIN. A login change and a
// PIN change ask for the current PIN; a temporary PIN from a local reset must be changed before anything else.
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatDot } from "@/components/game/SeatDot";
import { useFocusTrap } from "@/lib/focus-trap";
import { useGame } from "@/lib/game/store";
import { PLAYER_COLORS, PLAYER_NAMES } from "@/lib/game/types";
import { ProfileClientError, createProfileClient, profileStorageKey, type ProfileFields } from "@/lib/net/profiles";
import { hostUrl } from "@/lib/net/table";
import { play } from "@/lib/sound";

type Client = ReturnType<typeof createProfileClient>;
// One client per page: it keeps the session in memory between openings so Host and Join can attach it.
let client: Client | null = null;
function profileClient() {
  return (client ??= createProfileClient(hostUrl(location), { development: true }));
}

const LOGIN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PIN = /^\d{4}$/;
const field = "h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-base text-fg aria-[invalid=true]:border-accent-ink";
type Text = "displayName" | "login" | "pin" | "newPin" | "pinConfirm" | "catchphrase";
type Errors = Partial<Record<Text | "form", string>>;

function remembered(host: string) {
  try { return localStorage.getItem(profileStorageKey(host)) !== null; } catch { return false; }
}

export function ProfileSheet({ onClose, opener }: { onClose: () => void; opener: HTMLElement | null }) {
  const c = profileClient();
  const snap = useSyncExternalStore(c.subscribe, c.getSnapshot);
  const root = useRef<HTMLDivElement>(null);
  useFocusTrap(root, true, '[aria-label="Close"]', opener);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Signed in, "signin" is the summary; "edit" and "pin" are its two forms.
  const [view, setView] = useState<"signin" | "create" | "edit" | "pin">("signin");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [showPin, setShowPin] = useState(false);
  const [keep, setKeep] = useState(true);
  const [form, setForm] = useState(() => ({ displayName: useGame.getState().name.trim(), login: "", pin: "", newPin: "", pinConfirm: "", catchphrase: "", color: useGame.getState().color ?? PLAYER_COLORS[0], backupColor: "" }));
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // The summary button that opened a form takes the focus back when the form closes.
  const returnTo = useRef("");
  const mustChange = snap.profile?.pinMustChange === true;

  useEffect(() => {
    useGame.setState({ profile: c });
    void c.check();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      play("ui_back");
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [c]);

  // A refused field takes the focus, so its message beside it is in view and read out.
  useEffect(() => root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), [errors]);

  // A temporary PIN from a local reset opens Change PIN; nothing else is offered until it is changed.
  useEffect(() => {
    if (!mustChange) return;
    returnTo.current = "pin";
    setView("pin");
  }, [mustChange]);
  useEffect(() => {
    const r = root.current;
    if (view === "edit" || view === "pin") r?.querySelector<HTMLElement>("form input")?.focus();
    else if (returnTo.current) r?.querySelector<HTMLElement>(`[data-opens="${returnTo.current}"]`)?.focus();
  }, [view]);

  // Every request confirms the host shown above it, then reports a refusal beside the field it is about.
  const send = async (run: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setErrors({});
    try {
      c.confirmHost(snap.host);
      await run();
      setForm((f) => ({ ...f, pin: "", newPin: "", pinConfirm: "" }));
      after?.();
    } catch (e) {
      const code = e instanceof ProfileClientError ? e.code : "unavailable";
      const message = e instanceof ProfileClientError ? e.message : "Profiles unavailable on this host.";
      // A signed-in form refuses a wrong current PIN with the sign-in code; it belongs beside that PIN.
      const current = code === "signInFailed" && (view === "edit" || view === "pin");
      if (code === "signedOut") setView("signin");
      setErrors(code === "loginTaken" ? { login: message } : current ? { pin: "Check your current PIN, or try again later." } : { form: message });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const login = form.login.trim().toLowerCase();
    const p = snap.profile;
    const bad: Errors = {};
    const pinOk = (k: "pin" | "newPin") => { if (!PIN.test(form[k])) bad[k] = "Enter four digits."; };
    if (view === "pin") {
      pinOk("pin");
      pinOk("newPin");
      if (form.pinConfirm !== form.newPin) bad.pinConfirm = "The PINs don't match.";
      if (Object.keys(bad).length) return setErrors(bad);
      return void send(() => c.changePin(form.pin, form.newPin, form.pinConfirm), () => setView("signin"));
    }
    const name = form.displayName.trim();
    const edit = view === "edit" && p;
    if (view !== "signin" && !name) bad.displayName = "Enter a display name.";
    if (login.length < 3 || login.length > 24 || !LOGIN.test(login)) bad.login = "Use 3 to 24 lowercase letters, digits and single dashes.";
    if (!edit || login !== p.login) pinOk("pin");
    if (view === "create" && form.pinConfirm !== form.pin) bad.pinConfirm = "The PINs don't match.";
    if (Object.keys(bad).length) return setErrors(bad);
    if (edit) {
      // A login change carries the current PIN; an unchanged login is no rename and needs none.
      const fields: Partial<ProfileFields> & { pin?: string } = { displayName: name, login, catchphrase: form.catchphrase.trim(), color: form.color };
      if (form.backupColor) fields.backupColor = form.backupColor;
      if (login !== p.login) fields.pin = form.pin;
      return void send(() => c.edit(fields), () => setView("signin"));
    }
    void send(() =>
      view === "create"
        ? c.create({ displayName: name, login, color: form.color, pin: form.pin, pinConfirm: form.pinConfirm }, keep)
        : c.login(login, form.pin, keep),
    );
  };
  const open = (to: "edit" | "pin") => {
    const p = snap.profile!;
    returnTo.current = to;
    setErrors({});
    setForm((f) => ({ ...f, displayName: p.displayName, login: p.login, catchphrase: p.catchphrase, color: p.color, backupColor: p.backupColor ?? "", pin: "", newPin: "", pinConfirm: "" }));
    setView(to);
  };
  const back = () => { setErrors({}); setView("signin"); };

  const guest = (
    <Button variant="ghost" className="w-full" onClick={onClose} back>
      Continue as guest
    </Button>
  );
  const formError = errors.form ? <p role="alert" className="text-sm text-accent-ink">{errors.form}</p> : null;
  // The main action row sticks to the bottom of the scrolling sheet, so it stays on screen on a short phone.
  const actions = (children: ReactNode) => (
    <div className="sticky bottom-0 -mx-5 space-y-3 border-t border-border bg-surface px-5 pb-5 pt-3">{children}</div>
  );
  const input = (k: Text, label: string, extra: object) => (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {label}
        <input
          value={form[k]}
          onChange={(e) => set(k)(e.target.value)}
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
  // Picking the backup as favourite swaps the two, so they never match; the favourite can't also be the backup.
  const colours = (k: "color" | "backupColor", label: string) => (
    <>
      {view === "edit" ? <p className="text-sm font-medium text-fg">{label}</p> : null}
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
  const save = (label: string, cancel: ReactNode) =>
    actions(
      <>
        <Button size="lg" variant="primary" type="submit" className="w-full" disabled={busy}>
          {label}
        </Button>
        {cancel}
      </>,
    );
  const cancel = (
    <Button variant="secondary" className="w-full" onClick={back} back>
      Cancel
    </Button>
  );
  const signOut = (
    <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void send(() => c.logout())}>
      Sign out
    </Button>
  );
  let body: ReactNode;
  if (snap.profile && view === "pin") {
    body = (
      <form noValidate aria-label="Change PIN" className="flex flex-col gap-3" onSubmit={submit}>
        {mustChange ? <p role="alert" className="text-sm text-accent-ink">Change your PIN before continuing.</p> : null}
        {input("pin", "Current PIN", pin(false))}
        {input("newPin", "New PIN", pin(true))}
        {input("pinConfirm", "Confirm new PIN", pin(true))}
        {showToggle}
        <p className="text-sm text-muted">Your other devices will be signed out.</p>
        {formError}
        {save("Save PIN", mustChange ? signOut : cancel)}
      </form>
    );
  } else if (snap.profile && view === "edit") {
    const renamed = form.login.trim().toLowerCase() !== snap.profile.login;
    body = (
      <form noValidate aria-label="Edit profile" className="flex flex-col gap-3" onSubmit={submit}>
        {input("displayName", "Display name", { maxLength: 16, autoComplete: "nickname" })}
        {input("login", "Login", { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 24, autoComplete: "username" })}
        {renamed ? input("pin", "Current PIN", pin(false)) : null}
        {renamed ? showToggle : null}
        {input("catchphrase", "Catchphrase (optional)", { maxLength: 80 })}
        {colours("color", "Favourite colour")}
        {colours("backupColor", "Backup colour")}
        {formError}
        {save("Save", cancel)}
      </form>
    );
  } else if (snap.profile) {
    body = (
      <>
        <p className="flex items-center gap-2 text-base text-fg">
          <SeatDot color={snap.profile.color} className="size-4" />
          <span>Signed in as <strong>{snap.profile.displayName}</strong></span>
        </p>
        {snap.profile.catchphrase ? <p className="break-words text-sm text-fg">“{snap.profile.catchphrase}”</p> : null}
        <p className="text-sm text-muted">Login: {snap.profile.login}</p>
        <p className="text-sm text-muted">{snap.remembered ? "Remembered on this device." : "Not remembered on this device."}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" data-opens="edit" onClick={() => open("edit")}>
            Edit profile
          </Button>
          <Button variant="secondary" data-opens="pin" onClick={() => open("pin")}>
            Change PIN
          </Button>
        </div>
        {formError}
        {actions(
          <>
            <Button size="lg" variant="primary" className="w-full" onClick={onClose}>
              Done
            </Button>
            {signOut}
          </>,
        )}
      </>
    );
  } else if (snap.status !== "available") {
    const unavailable = snap.status === "unsupported" || snap.status === "offline" || snap.status === "insecure";
    body = (
      <>
        <p role="status" className="text-sm text-fg">
          {!unavailable ? "Checking this host…" : snap.status === "offline" ? "The host is offline. You can still play as a guest." : snap.status === "insecure" ? "Profiles need the HTTPS link. You can still play as a guest." : "Profiles unavailable on this host."}
        </p>
        {guest}
      </>
    );
  } else {
    const create = view === "create";
    body = (
      <>
        {!create && remembered(snap.host) ? (
          <Button size="lg" variant="primary" className="w-full" disabled={busy} onClick={() => void send(() => c.resume())}>
            Continue with remembered profile
          </Button>
        ) : null}
        <form noValidate aria-label={create ? "Create profile" : "Sign in"} className="flex flex-col gap-3" onSubmit={submit}>
          {create ? input("displayName", "Display name", { maxLength: 16, autoComplete: "nickname" }) : null}
          {input("login", "Login", { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, maxLength: 24, autoComplete: "username" })}
          {input("pin", "PIN", pin(create))}
          {create ? input("pinConfirm", "Confirm PIN", pin(true)) : null}
          {showToggle}
          {create ? colours("color", "Favourite colour") : null}
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-5 accent-[var(--ink)]" />
            Remember me on this device
          </label>
          {formError}
          {actions(
            <Button size="lg" variant={remembered(snap.host) && !create ? "secondary" : "primary"} type="submit" className="w-full" disabled={busy}>
              {create ? "Create profile" : "Sign in"}
            </Button>,
          )}
        </form>
        <Button variant="secondary" className="w-full" onClick={() => { setErrors({}); setView(create ? "signin" : "create"); }}>
          {create ? "I have a profile" : "Create profile"}
        </Button>
        {guest}
      </>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-white/45 p-safe sm:items-center">
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        data-testid="profile-sheet"
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-sheet border border-white/50 bg-surface"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div className="min-w-0">
            <h2 id="profile-title" className="font-display text-2xl">Profile</h2>
            {/* The host every credential goes to, shown before anything is sent (profiles.md, host-scoped credentials). */}
            <p data-testid="profile-host" className="break-all text-xs text-muted">Host: {snap.host}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" back>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-5 pt-3" aria-busy={busy || snap.status === "connecting"}>
          {body}
        </div>
      </div>
    </div>
  );
}
