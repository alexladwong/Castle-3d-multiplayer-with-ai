"use client";
// src/components/ui-kit/focus-hud.tsx  [U0]
import { useEffect, useRef, useState } from "react";
import { HUD_IDLE_MS, cn } from "@/lib/ui";

/** Anything that can bring a faded HUD back. Touch events are listed alongside
 *  the pointer ones because a browser that fires only `touchstart` (older iOS
 *  Safari inside a WebView) must still be able to wake it. */
const WAKE_EVENTS = ["pointermove", "pointerdown", "touchstart", "keydown"] as const;

/** Auto-hide is a mouse affordance: it needs a hover state to bring the HUD back. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export interface FocusHudProps extends React.ComponentProps<"div"> {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottom?: React.ReactNode;
  /**
   * Top-right cluster rendered OUTSIDE the fading layer. The way out of the
   * focus layout lives here: a control that fades to nothing is a trap on a
   * touch screen, where there is no hover to bring it back.
   */
  persistent?: React.ReactNode;
  /**
   * Rendered at the FRONT of the persistent cluster, before `persistent`.
   *
   * Additive slot for a control that must stay reachable but is not the way out:
   * docs/PRO_TUTOR.md §3 puts the "Tutor" pill here, so a fullscreen player can
   * open the panel without the exit ever moving.
   */
  persistentLead?: React.ReactNode;
  /** Top-centre slot, also outside the fading layer — for anything that is
   *  waiting on an answer (the status pill, a draw offer). */
  topCenter?: React.ReactNode;
  /**
   * Bottom-left slot, outside the fading layer, sitting clear of `bottom`.
   * UI_UPGRADE_2 §4.8 item 1: the newest thing the opponent said lives here, so
   * fullscreen never silences them.
   */
  aside?: React.ReactNode;
  /**
   * Fade out after 3s without pointer movement and return on the next move
   * (§5.2 — true for the 3D board, false for 2D where the HUD stays put).
   *
   * Honoured only on a fine-pointer, hover-capable device; everywhere else the
   * HUD stays put regardless, because a tap cannot hover.
   */
  autoHide?: boolean;
  idleMs?: number;
}

/**
 * Floating controls over a full-viewport board (§5.2 focus layout).
 *
 * Two layers. The fading one (`topLeft` / `topRight` / `bottom` / children) is
 * what §5.2 calls the HUD; the persistent one (`persistent` / `topCenter`) never
 * hides, and carries the exit and anything that demands a decision.
 *
 * Visibility is written straight to `data-visible` rather than held in state:
 * showing and hiding a HUD is a DOM effect, and re-rendering the whole toolbar
 * on every pointer move to flip one class would be wasteful.
 */
export function FocusHud({
  topLeft,
  topRight,
  bottom,
  persistent,
  persistentLead,
  topCenter,
  aside,
  autoHide = false,
  idleMs = HUD_IDLE_MS,
  className,
  children,
  ...props
}: FocusHudProps) {
  const hudRef = useRef<HTMLDivElement | null>(null);
  /** Keyboard users must never lose the HUD they are tabbing through. */
  const [focusWithin, setFocusWithin] = useState(false);

  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;

    if (!autoHide || focusWithin) {
      el.dataset.visible = "true";
      return;
    }

    const fine = window.matchMedia(FINE_POINTER);
    let timer = 0;
    let listening = false;

    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        el.dataset.visible = "false";
      }, idleMs);
    };
    const wake = () => {
      el.dataset.visible = "true";
      arm();
    };
    const listen = () => {
      if (listening) return;
      listening = true;
      for (const type of WAKE_EVENTS) {
        window.addEventListener(type, wake, { passive: true });
      }
    };
    const unlisten = () => {
      if (!listening) return;
      listening = false;
      for (const type of WAKE_EVENTS) window.removeEventListener(type, wake);
    };
    // Re-evaluated on `change` so a tablet that gains a trackpad mid-game starts
    // hiding, and one that loses it stops.
    const sync = () => {
      window.clearTimeout(timer);
      if (fine.matches) {
        listen();
        wake();
        return;
      }
      unlisten();
      el.dataset.visible = "true";
    };

    sync();
    fine.addEventListener("change", sync);

    return () => {
      window.clearTimeout(timer);
      unlisten();
      fine.removeEventListener("change", sync);
    };
  }, [autoHide, focusWithin, idleMs]);

  return (
    <div
      data-slot="focus-hud"
      className={cn("pointer-events-none absolute inset-0 z-30", className)}
      {...props}
    >
      {/* Below the top row, not level with it: on a phone the player chip and the
          exit cluster already fill that line, and an alert that lands on top of
          the way out would undo the point of keeping the way out. */}
      {topCenter ? (
        <div className="pointer-events-auto absolute inset-x-3 top-16 z-10 mx-auto w-fit max-w-[min(100%,28rem)]">
          {topCenter}
        </div>
      ) : null}
      {persistent || persistentLead ? (
        <div className="pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-1">
          {persistentLead}
          {persistent}
        </div>
      ) : null}
      {aside ? (
        <div className="pointer-events-auto absolute bottom-20 left-3 z-10 w-[min(22rem,calc(100%-1.5rem))]">
          {aside}
        </div>
      ) : null}

      <div
        ref={hudRef}
        data-slot="focus-hud-fade"
        data-visible="true"
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocusWithin(false);
          }
        }}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          // Faded-out controls must not still be clickable: an invisible button
          // under the player's thumb is worse than no button at all.
          "data-[visible=false]:pointer-events-none data-[visible=false]:opacity-0",
        )}
      >
        {topLeft ? <div className="pointer-events-auto absolute top-3 left-3">{topLeft}</div> : null}
        {topRight ? (
          <div className="pointer-events-auto absolute top-3 right-3">{topRight}</div>
        ) : null}
        {bottom ? (
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 mx-auto w-fit max-w-full">
            {bottom}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
