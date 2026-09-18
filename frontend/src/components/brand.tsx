import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Знак приложения. Градиент сидит на акцентном токене, поэтому смена
 * --primary в теме перекрашивает и его — отдельной правки не потребуется.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-xl",
        "bg-linear-to-br from-primary to-chart-2 text-primary-foreground",
        "shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent),0_6px_20px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
        className,
      )}
    >
      <Layers className="size-4.5" strokeWidth={2.4} />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[0.95rem] font-semibold tracking-tight">
          Медиаконвейер
        </span>
        <span className="text-muted-foreground mt-1 font-mono text-[0.65rem] tracking-wider uppercase">
          media pipeline
        </span>
      </span>
    </span>
  );
}
