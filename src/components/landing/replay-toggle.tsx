"use client";
// src/components/landing/replay-toggle.tsx  [UI upgrade 2 §2.1]
// A stop for the auto-playing hero (Pro Max, "Auto-Rotating Content Controls":
// auto-advancing content needs a play/pause). A ghost icon button beside the
// caption, its state kept for the visit in sessionStorage.
//
// Under `prefers-reduced-motion` the replay does not run at all — it holds the
// final position — so there is no control to press. A DISABLED button here was a
// dead stop in the tab order carrying an explanation nobody could reach; the same
// sentence as plain text says it to everyone.
import { Pause, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";

export interface ReplayToggleProps {
  paused: boolean;
  onToggle(): void;
  /** The OS asks for reduced motion: the replay is parked on the final position. */
  reducedMotion: boolean;
  className?: string;
}

const REDUCED_MOTION_NOTE =
  "Your system asks for reduced motion, so the board holds the final position.";

export function ReplayToggle({ paused, onToggle, reducedMotion, className }: ReplayToggleProps) {
  if (reducedMotion) {
    return (
      <span className={cn("text-[12px] text-muted-foreground", className)}>
        {REDUCED_MOTION_NOTE}
      </span>
    );
  }

  const label = paused ? "Play the replay" : "Pause the replay";
  const Icon = paused ? Play : Pause;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "size-9 cursor-pointer text-muted-foreground transition-colors duration-(--dur-micro)",
        "hover:text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
