"use client";
// src/components/game/turn-overlay.tsx  [P3 → restyled U2]
// FR-21d / UI_REDESIGN §5.4: the "pass the device" hand-over card for local
// two-player games — a full-board scrim with a Fraunces headline. It is shown
// while the controller reports `flipping`.
//
// Reduced motion used to SKIP it entirely (the controller never entered the flip
// state), which meant the one player who most needs to be told the device has
// changed hands was the one who never was. Now the controller holds `flipping`
// for HAND_OVER_STATIC_MS instead, and this card simply appears — no fade, no
// scale — and leaves again (FR-21g: reduced motion removes the motion, not the
// message).
import { Display } from "@/components/ui-kit";
import { formatColour } from "@/lib/format";
import { cn } from "@/lib/ui";
import type { Colour } from "@/lib/types";

export interface TurnOverlayProps {
  visible: boolean;
  turn: Colour;
  name: string;
}

export function TurnOverlay({ visible, turn, name }: TurnOverlayProps) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          // No rounding: the board it covers is no longer framed, so neither is
          // its scrim (DESIGN.md, "its light is its edge").
          "pointer-events-none absolute inset-0 z-20 flex items-center justify-center",
          "bg-background/70 backdrop-blur-[2px] motion-safe:transition-opacity motion-safe:duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          className={cn(
            // §4.5: a floating layer relies on the soft shadow alone — no hairline
            // under a 60px blur.
            "max-w-[80%] rounded-xl bg-card px-7 py-5 text-center shadow-soft",
            "motion-safe:transition-transform motion-safe:duration-200",
            visible ? "scale-100" : "motion-safe:scale-95",
          )}
        >
          {/* headline-sm — the app-frame verdict step of DESIGN.md's ramp. */}
          <Display level={4} as="p">
            {formatColour(turn)} to move
          </Display>
          <p className="mt-1 text-sm text-muted-foreground">Pass the device to {name}</p>
        </div>
      </div>

      {/* The card above is decoration to a screen reader; this is the message.
          It deliberately does NOT repeat "<colour> to move" — the sr-only move
          announcer has just said that, and saying it twice is the double
          announcement this pass set out to remove. */}
      {visible ? (
        <span role="status" className="sr-only">
          Pass the device to {name}.
        </span>
      ) : null}
    </>
  );
}
