"use client";
// src/components/tutor/use-focus-trap.ts
// docs/PRO_TUTOR.md §3: while the tutor is an overlay it is a layer, so it
// behaves like one — focus moves into it when it opens, Tab cycles inside it,
// and focus returns to whatever opened it when it closes.
import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  // `:not([disabled])` matters: a Base UI `Button` renders `tabindex="0"` even when
  // it is disabled (the composer's Send button, whenever the field is empty — which
  // is its state the whole time a member is reading an answer). Without this the
  // disabled button became the trap's `tail`, the browser never focused it, and the
  // wrap below never fired, so Tab walked straight out of the layer.
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(",");

/** The browser skips these, so the trap must skip them too or its ends are wrong. */
function tabbable(item: HTMLElement): boolean {
  return !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true";
}

/**
 * @param active   whether the layer is on screen
 * @returns the ref to put on the layer's root element
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, containFocus = true): React.RefObject<T | null> {
  const root = useRef<T | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = root.current;
    if (!active || node === null) return;

    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The LAYER itself, when it can hold focus (`tabIndex={-1}`), rather than its
    // first control: a screen reader then reads the panel's own name, and the
    // first Enter after opening cannot land on a button nobody aimed at.
    const target = node.hasAttribute("tabindex")
      ? node
      : ([...node.querySelectorAll<HTMLElement>(FOCUSABLE)].find(tabbable) ?? node);
    target.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) =>
          (item.offsetParent !== null || item === document.activeElement) && tabbable(item),
      );
      if (items.length === 0) return;
      const head = items[0] as HTMLElement;
      const tail = items[items.length - 1] as HTMLElement;
      const current = document.activeElement;
      if (event.shiftKey && (current === head || !node.contains(current))) {
        event.preventDefault();
        tail.focus();
        return;
      }
      if (!event.shiftKey && current === tail) {
        event.preventDefault();
        head.focus();
      }
    };

    // Floating fullscreen panels share the screen with the board and opponent
    // chat. Move/restore focus normally, but let Tab leave those panels.
    if (containFocus) node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Focus goes back to whatever opened the layer. Unconditional on purpose:
      // the only ways out are Escape and the panel's own collapse control, both
      // of which leave focus inside a subtree React is about to remove — after
      // which `document.activeElement` is the body and nothing is left to test.
      const back = opener.current;
      if (back !== null && back.isConnected &&
        (containFocus || node.contains(document.activeElement) || document.activeElement === document.body)) {
        back.focus();
      }
    };
  }, [active, containFocus]);

  return root;
}
