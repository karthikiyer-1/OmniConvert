import { cn } from "@/lib/utils";

/** 3px track, accent fill, eased width. */
export function ProgressBar({ value, className, muted }: { value: number; className?: string; muted?: boolean }) {
  return (
    <div className={cn("h-[3px] w-full overflow-hidden rounded-full bg-fg/[0.08]", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-apple", muted ? "bg-fg/20" : "bg-accent")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
