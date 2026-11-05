import { cn } from "@/lib/utils";

export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-8 first:mt-0", className)}>
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block py-1.5">
      <span className="flex justify-between text-footnote">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {Number.isInteger(step) ? value : value.toFixed(1)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        className="slider mt-2 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </label>
  );
}

export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
      <span
        className="segmented-thumb"
        style={{ left: 2, width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button key={String(o.value)} className="segmented-item px-2" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-fg/[0.05] px-3 text-footnote focus-within:ring-2 focus-within:ring-accent/40">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        min={1}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Math.max(1, Math.round(+e.target.value || 1)))}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="text-subtle">{suffix}</span>}
    </label>
  );
}
