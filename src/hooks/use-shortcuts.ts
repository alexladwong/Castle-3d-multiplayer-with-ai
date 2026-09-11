"use client";
// src/hooks/use-shortcuts.ts  [U2]
// UI_REDESIGN §5.1 keyboard map: F fullscreen, T 2D/3D, R flip, ←/→ review,
// Home/End first/last, ? shortcuts, Esc exits fullscreen or review.
//
// UI_UPGRADE_2 §4.8 item 5: Shift+arrows are the 3D board's orbit and are left
// alone here, so one key never means two things on one screen.
//
// One document-level listener, installed once. It is deliberately conservative:
// a key is only claimed when the user is demonstrably NOT typing and no MODAL
// dialog is on screen, because silently stealing "r" from a text box is far worse
// than missing a shortcut. A non-modal popup — §5.3's game panel, which a phone
// player leaves open while they play — keeps only Escape.
import { useEffect, useRef } from "react";

export interface ShortcutHandlers {
  /** F */
  onFullscreen?(): void;
  /** T */
  onToggleView?(): void;
  /** R */
  onFlip?(): void;
  /** ← / → — delta is -1 or +1. */
  onStep?(delta: number): void;
  /** Home */
  onFirst?(): void;
  /** End */
  onLast?(): void;
  /** ? (shift + /) */
  onHelp?(): void;
  /** Escape */
  onEscape?(): void;
}

export interface UseShortcutsOptions {
  /** Set false to unhook entirely (spectator-free screens, tests). Default true. */
  enabled?: boolean;
}

/** True when the event started inside something the user types into. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Every popup that is currently open. Presence in the DOM is NOT the open state:
 * Base UI keeps a popup mounted for the whole of its exit transition
 * (`internals/useTransitionStatus.mjs` flips `mounted` only once the animation
 * completes), so a plain `[role="dialog"]` query goes on reporting a dialog that
 * is already fading out — and Escape, pressed twice to leave a dialog and then
 * fullscreen, would do nothing the second time. `data-open` / `data-closed` is
 * Base UI's own open flag (`utils/popupStateMapping.mjs`), written by every popup
 * part, so ask for that.
 */
const OPEN_POPUPS = '[role="dialog"][data-open], [role="alertdialog"][data-open]';

/**
 * A NON-modal popup's viewport. Base UI does not put `aria-modal` on a dialog
 * popup at all (checked: the only `aria-modal` in @base-ui/react is ToastRoot's
 * `false`), so modality has to be read off the wrapper that does record it —
 * `src/components/ui/drawer.tsx` stamps `data-modal={modal}` on
 * `DrawerPrimitive.Viewport`, the popup's own ancestor.
 */
const NON_MODAL_VIEWPORT = '[data-slot="drawer-viewport"][data-modal="false"]';

/**
 * True while a MODAL popup is on screen — one of those owns Escape, Home/End and
 * the arrows for as long as it is up.
 *
 * §5.3's game panel is the exception that made this a function rather than a
 * selector: it is a `role="dialog"` the phone player deliberately leaves open
 * while they carry on playing, so treating "a dialog exists" as "the user is busy
 * elsewhere" silently killed every shortcut on a phone — including Escape, the way
 * out of fullscreen — for as long as the sheet was up. A non-modal popup does not
 * take the page away from you, so it does not take the keys either.
 */
function isModalDialogOpen(): boolean {
  for (const popup of document.querySelectorAll(OPEN_POPUPS)) {
    if (popup.closest(NON_MODAL_VIEWPORT) === null) return true;
  }
  return false;
}

export function useShortcuts(
  handlers: ShortcutHandlers,
  { enabled = true }: UseShortcutsOptions = {},
): void {
  // The handler object is rebuilt on every render of the caller; keeping it in a
  // ref means the listener is attached exactly once instead of on every keystroke
  // that changed a closure upstream. The write happens in an effect, never during
  // render — mutating a ref while rendering is a React Compiler error.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Ctrl/Cmd/Alt combinations belong to the browser and the OS.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isModalDialogOpen()) return;
      // Escape is the one key a NON-modal popup still owns: with §5.3's sheet up,
      // Escape means "put the panel away", and Base UI's own dismissal does that.
      // Everything else — F, T, R, the review keys — is about the board, which is
      // still right there behind the sheet.
      if (event.key === "Escape" && document.querySelector(OPEN_POPUPS) !== null) return;

      const h = ref.current;
      const run = (fn: (() => void) | undefined) => {
        if (fn === undefined) return;
        event.preventDefault();
        fn();
      };

      switch (event.key) {
        case "f":
        case "F":
          run(h.onFullscreen);
          return;
        case "t":
        case "T":
          run(h.onToggleView);
          return;
        case "r":
        case "R":
          run(h.onFlip);
          return;
        case "ArrowLeft":
          // Shift+arrow belongs to the 3D camera (UI_UPGRADE_2 §4.8 item 5), so
          // the review keys and the orbit keys never fight over one press.
          if (event.shiftKey) return;
          run(h.onStep === undefined ? undefined : () => h.onStep?.(-1));
          return;
        case "ArrowRight":
          if (event.shiftKey) return;
          run(h.onStep === undefined ? undefined : () => h.onStep?.(1));
          return;
        case "ArrowUp":
        case "ArrowDown":
          // Not claimed here at all: with Shift they orbit the board, without it
          // they scroll whatever the reader is in.
          return;
        case "Home":
          run(h.onFirst);
          return;
        case "End":
          run(h.onLast);
          return;
        case "?":
          run(h.onHelp);
          return;
        case "Escape":
          run(h.onEscape);
          return;
        default:
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
