import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { MIN_PASSWORD, passwordStrength, useAuth } from "@/lib/auth";
import { useStore, type HistoryEvent } from "@/lib/store";
import { hrefFor, navigate, setParam, useParam } from "@/lib/router";
import { confirmAction } from "@/lib/confirm";
import { cn, formatBytes, formatCount, formatDay, formatMonthYear, formatTime, isFinePointer } from "@/lib/utils";
import { rise, t } from "@/lib/motion";

export function AccountPage() {
  const status = useAuth((s) => s.status);
  return status === "user" ? <Profile /> : <SignIn />;
}

/* ------------------------------------------------------------- primitives */

type FieldProps = {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  name: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
  error?: string;
  inputRef?: React.Ref<HTMLInputElement>;
};

function Field({ label, type = "text", value, onChange, autoComplete, name, autoFocus, hint, error, inputRef }: FieldProps) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-footnote font-medium">
        {label}
      </label>
      <span
        className={cn(
          "flex h-12 items-center rounded-xl bg-fg/[0.05] px-4 transition-shadow duration-200 focus-within:ring-2",
          error ? "ring-2 ring-danger/60 focus-within:ring-danger/70" : "focus-within:ring-accent/50",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={isPw && !show ? "password" : isPw ? "text" : type}
          inputMode={type === "email" ? "email" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          // Desktop only: autofocus pops the keyboard and scrolls on phones.
          autoFocus={autoFocus && isFinePointer()}
          spellCheck={false}
          autoCapitalize={type === "email" || isPw ? "none" : "words"}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full min-w-0 bg-transparent text-callout outline-none"
        />
        {isPw && (
          <button type="button" className="icon-btn -mr-2 h-8 w-8" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
            {show ? <EyeOff aria-hidden size={16} strokeWidth={1.75} /> : <Eye aria-hidden size={16} strokeWidth={1.75} />}
          </button>
        )}
      </span>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-caption text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
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
      <span className="w-16 text-right text-caption text-muted" aria-live="polite">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- sign in */

type Errors = Partial<Record<"name" | "email" | "password" | "form", string>>;

function SignIn() {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const guestFiles = useStore((s) => s.items.filter((i) => i.status !== "uploading").length);
  // Sign in / create account is part of the URL: #/account?mode=signup
  const mode: "in" | "up" = useParam("mode") === "signup" ? "up" : "in";
  const setMode = (m: "in" | "up") => setParam("mode", m === "up" ? "signup" : null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [importGuest, setImportGuest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };

  const validate = (): Errors => {
    const e: Errors = {};
    if (mode === "up" && !name.trim()) e.name = "Enter your name.";
    if (!email.trim()) e.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter an email like name@example.com.";
    if (!password) e.password = "Enter your password.";
    else if (mode === "up" && password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
    return e;
  };

  const focusFirst = (e: Errors) => {
    const first = (["name", "email", "password"] as const).find((k) => e[k]);
    if (first) refs[first].current?.focus();
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return focusFirst(e);
    setBusy(true);
    try {
      if (mode === "in") await signIn({ email, password, remember });
      else await signUp({ name, email, password, remember, importGuest: importGuest && guestFiles > 0 });
      setPassword("");
      setParam("mode", null);
    } catch (err) {
      const msg = (err as Error).message;
      // Route known problems to the field they're about.
      const field: keyof Errors = /email/i.test(msg) && /exists|valid/i.test(msg) ? "email" : /characters/i.test(msg) ? "password" : "form";
      const next = { [field]: msg } as Errors;
      setErrors(next);
      if (field === "form") refs.password.current?.select();
      else focusFirst(next);
    } finally {
      setBusy(false);
    }
  };

  const clear = (k: keyof Errors) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));

  return (
    <div className="pb-24">
      <motion.section {...rise} transition={t.slow} className="pb-12 pt-16 text-center md:pt-24">
        <h1 className="text-balance font-display text-headline font-semibold md:text-hero">{mode === "in" ? "Welcome Back." : "Create Your Account."}</h1>
        <p className="mx-auto mt-4 max-w-[520px] text-pretty text-lead text-muted">Keep your files and their history, encrypted on this device.</p>
      </motion.section>

      <motion.div {...rise} transition={{ ...t.slow, delay: 0.05 }} className="surface mx-auto max-w-[440px] p-8 md:p-10">
        <div className="segmented grid-cols-2" role="group" aria-label="Account action">
          <span className="segmented-thumb" style={{ left: 2, width: "calc((100% - 4px) / 2)", transform: mode === "up" ? "translateX(100%)" : "none" }} />
          {(["in", "up"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              className="segmented-item"
              onClick={() => {
                setMode(m);
                setErrors({});
              }}
            >
              {m === "in" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* A real <form> with autocomplete hints lets the browser offer to save the password. */}
        <form onSubmit={submit} className="mt-8 space-y-5" key={mode} noValidate>
          {mode === "up" && (
            <Field
              label="Name"
              name="name"
              value={name}
              onChange={(v) => (setName(v), clear("name"))}
              autoComplete="name"
              autoFocus
              error={errors.name}
              inputRef={refs.name}
            />
          )}
          <Field
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(v) => (setEmail(v), clear("email"))}
            autoComplete="username"
            autoFocus={mode === "in"}
            error={errors.email}
            inputRef={refs.email}
          />
          <Field
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(v) => (setPassword(v), clear("password"))}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            hint={mode === "up" ? <StrengthMeter password={password} /> : undefined}
            error={errors.password}
            inputRef={refs.password}
          />

          <div className="space-y-3 pt-1">
            <Switch checked={remember} onChange={setRemember} label="Stay Signed In" detail="On this device for 30 days" />
            {mode === "up" && guestFiles > 0 && (
              <Switch
                checked={importGuest}
                onChange={setImportGuest}
                label={`Bring Your ${guestFiles} File${guestFiles > 1 ? "s" : ""}`}
                detail="Move what’s on this page into the account"
              />
            )}
          </div>

          <AnimatePresence>
            {errors.form && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t.base} className="text-footnote text-danger" role="alert">
                {errors.form}
              </motion.p>
            )}
          </AnimatePresence>

          <button type="submit" className="btn-primary w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 aria-hidden size={16} className="animate-spin" />}
            {busy ? (mode === "in" ? "Signing In…" : "Creating Account…") : mode === "in" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="mt-8 flex gap-2 text-pretty text-caption text-subtle">
          <Lock aria-hidden size={13} strokeWidth={1.75} className="mt-[1px] shrink-0" />
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
  failed: "Couldn’t convert",
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
  return formatDay(ts);
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
        <div aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-fg font-display text-[32px] font-semibold text-bg">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-balance font-display text-headline font-semibold">Hi, {user.name.split(" ")[0]}.</h1>
          <p className="mt-2 break-words text-callout text-muted">
            <span translate="no">{user.email}</span> · Member since {formatMonthYear(user.createdAt)}
          </p>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* History */}
        <motion.section {...rise} transition={{ ...t.slow, delay: 0.05 }} className="surface p-6 md:p-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-title font-semibold">History</h2>
            {history.length > 0 && (
              <button
                className="btn-text -mr-3 text-muted hover:text-fg"
                onClick={async () => {
                  const ok = await confirmAction({
                    title: "Clear Your History?",
                    message: `This removes all ${formatCount(history.length)} entries. Your files aren’t affected.`,
                    confirmLabel: "Clear History",
                    destructive: true,
                  });
                  if (ok) clearHistory();
                }}
              >
                Clear History
              </button>
            )}
          </div>
          {groups.length ? (
            <div className="mt-6 space-y-8">
              {groups.map(([day, events]) => (
                <div key={day}>
                  <h3 className="eyebrow mb-2">{day}</h3>
                  <ul>
                    {events.map((e) => (
                      <li key={e.id} className="cv-row flex items-baseline gap-4 py-2" style={{ containIntrinsicSize: "auto 40px" }}>
                        <time dateTime={new Date(e.at).toISOString()} className="w-16 shrink-0 text-footnote tabular-nums text-subtle">
                          {formatTime(e.at)}
                        </time>
                        <span className="min-w-0 flex-1 text-body">
                          <span className={cn(e.type === "failed" ? "text-danger" : "text-muted")}>{VERB[e.type]} </span>
                          <span className="break-words font-medium" translate="no">{e.name}</span>
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
            <dl className="mt-6 grid grid-cols-3 gap-4 [&>div]:flex [&>div]:flex-col-reverse">
              {[
                ["Files", formatCount(items.length)],
                ["Converted", formatCount(converted)],
                ["Stored", formatBytes(stored)],
              ].map(([k, v]) => (
                <div key={k}>
                  {/* dt before dd for valid markup; column-reverse shows the number first. */}
                  <dt className="mt-1 text-footnote text-muted">{k}</dt>
                  <dd className="font-display text-title font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <a className="btn-secondary mt-8 w-full" href={hrefFor("convert")}>
              Go to Files
            </a>
          </motion.section>

          {/* Security */}
          <motion.section {...rise} transition={{ ...t.slow, delay: 0.15 }} className="surface p-6 md:p-8">
            <h2 className="font-display text-title font-semibold">Security</h2>
            <p className="mt-2 text-footnote text-muted">
              {user.remembered ? "You stay signed in on this device for 30 days." : "You’ll be signed out when you reload or close this page."}
            </p>
            <ChangePassword />
            <button className="btn-secondary mt-4 w-full" onClick={() => signOut()}>
              Sign Out
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
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  if (!open)
    return (
      <button className="btn-secondary mt-6 w-full" onClick={() => setOpen(true)}>
        Change Password
      </button>
    );

  return (
    <form
      className="mt-6 space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const errs: typeof errors = {};
        if (!current) errs.current = "Enter your current password.";
        if (next.length < MIN_PASSWORD) errs.next = `Use at least ${MIN_PASSWORD} characters.`;
        setErrors(errs);
        if (errs.current) return currentRef.current?.focus();
        if (errs.next) return nextRef.current?.focus();
        setBusy(true);
        try {
          await changePassword(current, next);
          toast({ tone: "success", title: "Password changed" });
          setOpen(false);
          setCurrent("");
          setNext("");
        } catch (err) {
          setErrors({ current: `${(err as Error).message} Check it and try again.` });
          currentRef.current?.select();
        } finally {
          setBusy(false);
        }
      }}
    >
      {/* Hidden username helps password managers update the right entry. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <Field
        label="Current password"
        type="password"
        name="current"
        value={current}
        onChange={(v) => (setCurrent(v), setErrors((x) => ({ ...x, current: undefined })))}
        autoComplete="current-password"
        autoFocus
        error={errors.current}
        inputRef={currentRef}
      />
      <Field
        label="New password"
        type="password"
        name="new"
        value={next}
        onChange={(v) => (setNext(v), setErrors((x) => ({ ...x, next: undefined })))}
        autoComplete="new-password"
        hint={<StrengthMeter password={next} />}
        error={errors.next}
        inputRef={nextRef}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => (setOpen(false), setErrors({}))}>
          Cancel
        </button>
        <button type="submit" className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 aria-hidden size={14} className="animate-spin" />}
          {busy ? "Saving…" : "Save Password"}
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
  const [error, setError] = useState<string | undefined>();
  const ref = useRef<HTMLInputElement>(null);

  if (!open)
    return (
      <button className="btn-text mt-4 w-full text-danger hover:bg-danger/[0.06]" onClick={() => setOpen(true)}>
        Delete Account
      </button>
    );

  return (
    <form
      className="mt-6 space-y-4 rounded-2xl bg-danger/[0.04] p-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!password) {
          setError("Enter your password to confirm.");
          return ref.current?.focus();
        }
        setBusy(true);
        setError(undefined);
        try {
          await deleteAccount(password);
          toast({ tone: "info", title: "Account deleted" });
          navigate("convert");
        } catch (err) {
          setError(`${(err as Error).message} Check it and try again.`);
          ref.current?.select();
          setBusy(false);
        }
      }}
    >
      <p className="text-pretty text-footnote">This permanently deletes the account and every file in it from this device. You can’t undo this.</p>
      <Field
        label="Password"
        type="password"
        name="confirm"
        value={password}
        onChange={(v) => (setPassword(v), setError(undefined))}
        autoComplete="current-password"
        autoFocus
        error={error}
        inputRef={ref}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => (setOpen(false), setError(undefined))}>
          Cancel
        </button>
        <button type="submit" className="btn h-9 flex-1 bg-danger px-4 text-white hover:bg-danger/85" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 aria-hidden size={14} className="animate-spin" />}
          {busy ? "Deleting…" : "Delete Account"}
        </button>
      </div>
    </form>
  );
}
