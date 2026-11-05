import { AlertCircle, CheckCircle2, Clock, Loader2, UploadCloud, Hourglass } from "lucide-react";
import type { Status } from "@/lib/store";
import { cn } from "@/lib/utils";

const MAP: Record<Status, { label: string; cls: string; Icon: typeof Clock; spin?: boolean }> = {
  uploading: { label: "Uploading", cls: "bg-accent/12 text-accent", Icon: UploadCloud },
  pending: { label: "Pending", cls: "bg-fg/[0.07] text-muted", Icon: Clock },
  queued: { label: "Queued", cls: "bg-violet/12 text-violet", Icon: Hourglass },
  converting: { label: "Converting", cls: "bg-accent/12 text-accent", Icon: Loader2, spin: true },
  ready: { label: "Ready", cls: "bg-success/15 text-success", Icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-danger/12 text-danger", Icon: AlertCircle },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { label, cls, Icon, spin } = MAP[status];
  return (
    <span className={cn("chip whitespace-nowrap", cls, className)}>
      <Icon size={11} strokeWidth={2.4} className={spin ? "animate-spin" : undefined} />
      {label}
    </span>
  );
}
