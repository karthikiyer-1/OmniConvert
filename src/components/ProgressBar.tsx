import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  tone = "accent",
  active = true,
  className,
}: {
  value: number;
  tone?: "accent" | "success" | "danger";
  active?: boolean;
  className?: string;
}) {
  const color = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-accent";
  return (
    <div className={cn("h-[5px] w-full overflow-hidden rounded-full bg-fg/[0.08]", className)}>
      <motion.div
        className={cn("relative h-full overflow-hidden rounded-full", color, active && "shimmer")}
        initial={false}
        animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22, mass: 0.6 }}
      />
    </div>
  );
}
