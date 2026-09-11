"use client";
// src/components/ui-kit/reveal.tsx  [U0]
import { cn, stagger, useReducedMotion, useReveal } from "@/lib/ui";

export interface RevealProps extends React.ComponentProps<"div"> {
  /** Position in a staggered group; multiplied by 60ms (§1.3). */
  delayIndex?: number;
}

/** Reveals its children once, on scroll (§1.3). Static under reduced motion. */
export function Reveal({ delayIndex = 0, className, style, ...props }: RevealProps) {
  const reduced = useReducedMotion();
  const { ref, revealProps } = useReveal<HTMLDivElement>({ disabled: reduced });
  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={{ ...stagger(delayIndex, reduced), ...style }}
      {...revealProps}
      {...props}
    />
  );
}
