// src/components/ui-kit/kbd.tsx  [U0]
import { cn } from "@/lib/ui";

/** One key cap. `data-slot="kbd"` is what TooltipContent styles against. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border",
        "bg-bg-sunken px-1.5 font-mono text-[12px] leading-none font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
