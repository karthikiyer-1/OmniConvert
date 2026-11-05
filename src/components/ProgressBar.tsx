import { cn } from "@/lib/utils";

/** 3px track, accent fill. Animates `transform` (compositor-only), not width. */
export function ProgressBar({ value, className, muted, label }: { value: number; className?: string; muted?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label ?? "Progress"}
      className={cn("h-[3px] w-full overflow-hidden rounded-full bg-fg/[0.08]", className)}
    >
      <div
        className={cn("h-full w-full origin-left rounded-full transition-transform duration-500 ease-apple", muted ? "bg-fg/20" : "bg-accent")}
        style={{ transform: `scaleX(${v / 100})` }}
      />
    </div>
  );
}
