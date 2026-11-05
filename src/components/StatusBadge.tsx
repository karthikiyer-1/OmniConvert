import type { Status } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAP: Record<Status, { label: string; dot: string; text: string; pulse?: boolean }> = {
  uploading: { label: "Uploading", dot: "bg-accent", text: "text-muted", pulse: true },
  pending: { label: "Pending", dot: "bg-fg/25", text: "text-muted" },
  queued: { label: "Queued", dot: "bg-fg/25", text: "text-muted" },
  converting: { label: "Converting", dot: "bg-accent", text: "text-muted", pulse: true },
  ready: { label: "Ready", dot: "bg-success", text: "text-muted" },
  failed: { label: "Failed", dot: "bg-danger", text: "text-danger" },
};

/** Quiet status: a 6px dot and a label. No pills, no fills. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = MAP[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-caption font-medium", s.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, s.pulse && "animate-pulse")} />
      {s.label}
    </span>
  );
}
