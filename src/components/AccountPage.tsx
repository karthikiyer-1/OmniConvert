import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Lock } from "lucide-react";
import { MIN_PASSWORD, passwordStrength, useAuth } from "@/lib/auth";
import { useStore, type HistoryEvent } from "@/lib/store";
import { navigate } from "@/lib/router";
import { cn, formatBytes } from "@/lib/utils";
import { rise, t } from "@/lib/motion";

export function AccountPage() {
  const status = useAuth((s) => s.status);
  return status === "user" ? <Profile /> : <SignIn />;
}

/* ------------------------------------------------------------- primitives */

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  name,
  autoFocus,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  name: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <label className="block">
      <span className="mb-2 block text-footnote font-medium">{label}</span>
      <span className="flex h-12 items-center rounded-xl bg-fg/[0.05] px-4 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-accent/50">
        <input
          name={name}
          type={isPw && !show ? "password" : isPw ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          spellCheck={false}
          autoCapitalize={type === "email" || isPw ? "none" : "words"}
          className="w-full min-w-0 bg-transparent text-callout outline-none"
        />
        {isPw && (
          <button type="button" className="icon-btn -mr-2 h-8 w-8" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        )}
      </span>
      {hint}
    </label>
  );
}

export function Switch({ checked, onChange, label, detail }: { checked: boolean; onChange: (v: boolean) => void; label: string; detail?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-4 py-1 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-body">{label}</span>
        {detail && <span className="mt-0.5 block text-footnote text-muted">{detail}</span>}
      </span>
      <span className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ease-apple", checked ? "bg-success" : "bg-fg/[0.12]")}>
        <span
          className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-transform duration-300 ease-apple"
          style={{ transform: checked ? "translateX(20px)" : "none", boxShadow: "0 3px 8px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.16)" }}
        />
      </span>
    </button>
  );
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) return <span className="mt-2 block text-caption text-subtle">At least {MIN_PASSWORD} characters.</span>;
  return (
    <span className="mt-2 flex items-center gap-3">
      <span className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 rounded-full transition-colors duration-300", i <= score ? (score <= 1 ? "bg-danger" : score === 2 ? "bg-fg/50" : "bg-success") : "bg-fg/10")} />
        ))}
      </span>
      <span className="w-16 text-right text-caption text-muted">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- sign in */

function SignIn() {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const guestFiles = useStore((s) => s.items.filter((i) => i.status !== "uploading").length);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [importGuest, setImportGuest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "in") await signIn({ email, password, remember });
      else await signUp({ name, email, password, remember, importGuest: importGuest && guestFiles > 0 });
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-24">
      <motion.section {...rise} transition={t.slow} className="pb-12 pt-16 text-center md:pt-24">
        <h1 className="font-display text-headline font-semibold md:text-hero">{mode === "in" ? "Welcome back." : "Create your account."}</h1>
        <p className="mx-auto mt-4 max-w-[520px] text-lead text-muted">Keep your files and their history, encrypted on this device.</p>
      </motion.section>

      <motion.div {...rise} transition={{ ...t.slow, delay: 0.05 }} className="surface mx-auto max-w-[440px] p-8 md:p-10">
        <div className="segmented grid-cols-2" role="tablist">
          <span className="segmented-thumb" style={{ left: 2, width: "calc((100% - 4px) / 2)", transform: mode === "up" ? "translateX(100%)" : "none" }} />
          {(["in", "up"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              aria-pressed={mode === m}
              className="segmented-item"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {/* A real <form> with autocomplete hints lets the browser offer to save the password. */}
        <form onSubmit={submit} className="mt-8 space-y-5" key={mode}>
          {mode === "up" && <Field label="Name" name="name" value={name} onChange={setName} autoComplete="name" autoFocus />}
          <Field label="Email" type="email" name="email" value={email} onChange={setEmail} autoComplete="username" autoFocus={mode === "in"} />
          <Field
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            hint={mode === "up" ? <StrengthMeter password={password} /> : undefined}
          />

          <div className="space-y-3 pt-1">
            <Switch checked={remember} onChange={setRemember} label="Stay signed in" detail="On this device for 30 days" />
            {mode === "up" && guestFiles > 0 && (
              <Switch
                checked={importGuest}
                onChange={setImportGuest}
                label={`Bring my ${guestFiles} file${guestFiles > 1 ? "s" : ""}`}
                detail="Move what's on this page into the account"
              />
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={t.base} className="text-footnote text-danger" role="alert">
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password || (mode === "up" && (!name || password.length < MIN_PASSWORD))}>
            {busy ? (mode === "in" ? "Signing in…" : "Creating account…") : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-8 flex gap-2 text-caption text-subtle">
          <Lock size={13} strokeWidth={1.75} className="mt-[1px] shrink-0" />
          Your password is never stored. It unlocks a key that encrypts your files, so if you forget it, nobody can recover your data.
        </p>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------- profile */

const VERB: Record<HistoryEvent["type"], string> = {
  added: "Added",
  converted: "Converted",
  failed: "Couldn't convert",
  removed: "Removed",
  edited: "Saved edit",
  cleared: "Cleared",
  "signed-in": "Signed in",
  "account-created": "Created account",
};

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function Profile() {
  const user = useAuth((s) => s.user)!;
  const signOut = useAuth((s) => s.signOut);
  const items = useStore((s) => s.items);
  const history = useStore((s) => s.history);
  const clearHistory = useStore((s) => s.clearHistory);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>();
    for (const e of history) {
      const k = dayLabel(e.at);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [history]);

  const converted = history.filter((e) => e.type === "converted").length;
  const stored = items.reduce((n, i) => n + i.size + (i.output?.size ?? 0), 0);

  return (
    <div className="pb-24">
      <motion.section {...rise} transition={t.slow} className="flex flex-wrap items-end gap-6 pb-12 pt-16 md:pb-16 md:pt-24">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-fg text-bg font-display text-[32px] font-semibold">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-headline font-semibold">Hi, {user.name.split(" ")[0]}.</h1>
          <p className="mt-2 text-callout text-muted">
            {user.email} · Member since {new Date(user.createdAt).toLocaleDateString([], { month: "long", year: "numeric" })}
          </p>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* History */}
        <motion.section {...rise} transition={{ ...t.slow, delay: 0.05 }} className="surface p-6 md:p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-title font-semibold">History</h2>
            {history.length > 0 && (
              <button className="btn-text -mr-3 text-muted hover:text-fg" onClick={clearHistory}>
                Clear history
              </button>
            )}
          </div>
          {groups.length ? (
            <div className="mt-6 space-y-8">
              {groups.map(([day, events]) => (
                <div key={day}>
                  <p className="eyebrow mb-2">{day}</p>
                  <ul>
                    {events.map((e) => (
                      <li key={e.id} className="flex items-baseline gap-4 py-2">
                        <span className="w-16 shrink-0 text-footnote tabular-nums text-subtle">
                          {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="min-w-0 flex-1 text-body">
                          <span className={cn(e.type === "failed" ? "text-danger" : "text-muted")}>{VERB[e.type]} </span>
                          <span className="break-words font-medium">{e.name}</span>
                          {e.detail && <span className="text-muted"> · {e.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-body text-muted">Everything you add, convert and edit will be listed here.</p>
          )}
        </motion.section>

        <div className="flex flex-col gap-6">
          {/* Overview */}
          <motion.section {...rise} transition={{ ...t.slow, delay: 0.1 }} className="surface p-6 md:p-8">
            <h2 className="font-display text-title font-semibold">Overview</h2>
            <dl className="mt-6 grid grid-cols-3 gap-4">
              {[
                ["Files", items.length.toLocaleString()],
                ["Converted", converted.toLocaleString()],
                ["Stored", formatBytes(stored)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dd className="font-display text-title font-semibold">{v}</dd>
                  <dt className="mt-1 text-footnote text-muted">{k}</dt>
                </div>
              ))}
            </dl>
            <button className="btn-secondary mt-8 w-full" onClick={() => navigate("convert")}>
              Go to files
            </button>
          </motion.section>

          {/* Security */}
          <motion.section {...rise} transition={{ ...t.slow, delay: 0.15 }} className="surface p-6 md:p-8">
            <h2 className="font-display text-title font-semibold">Security</h2>
            <p className="mt-2 text-footnote text-muted">
              {user.remembered ? "You stay signed in on this device for 30 days." : "You'll be signed out when you reload or close this page."}
            </p>
            <ChangePassword />
            <button className="btn-secondary mt-4 w-full" onClick={() => signOut()}>
              Sign out
            </button>
            <DeleteAccount />
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function ChangePassword() {
  const changePassword = useAuth((s) => s.changePassword);
  const toast = useStore((s) => s.toast);
  const email = useAuth((s) => s.user?.email ?? "");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button className="btn-secondary mt-6 w-full" onClick={() => setOpen(true)}>
        Change password
      </button>
    );

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await changePassword(current, next);
          toast({ tone: "success", title: "Password changed" });
          setOpen(false);
          setCurrent("");
          setNext("");
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {/* Hidden username helps password managers update the right entry. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <Field label="Current password" type="password" name="current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
      <Field label="New password" type="password" name="new" value={next} onChange={setNext} autoComplete="new-password" hint={<StrengthMeter password={next} />} />
      {error && <p className="text-footnote text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" disabled={busy || !current || next.length < MIN_PASSWORD}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button className="btn-text mt-4 w-full text-danger hover:bg-danger/[0.06]" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );

  return (
    <form
      className="mt-6 space-y-4 rounded-2xl bg-danger/[0.04] p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await deleteAccount(password);
          toast({ tone: "info", title: "Account deleted" });
          navigate("convert");
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <p className="text-footnote">This permanently deletes the account and every file in it from this device.</p>
      <Field label="Enter your password to confirm" type="password" name="confirm" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
      {error && <p className="text-footnote text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn flex-1 h-9 bg-danger px-4 text-white hover:bg-danger/85" disabled={busy || !password}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </form>
  );
}
