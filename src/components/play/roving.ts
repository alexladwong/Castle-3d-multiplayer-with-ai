"use client";
// src/components/play/roving.ts  [U5]
// Arrow keys move focus inside a group of buttons — the persona roster, the
// colour segments, the room row. Focus only: selection still needs Enter, Space
// or a click, so a keyboard player can look along the row without committing to
// an opponent (Pro Max "Keyboard Navigation": every control operable, tab order
// matching visual order, no traps).
//
// Every button keeps its natural tab stop, so this is an addition to Tab, not a
// replacement for it.

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function rovingArrowKeys(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
): void {
  if (container === null) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const isNext = NEXT_KEYS.has(event.key);
  const isPrev = PREV_KEYS.has(event.key);
  const isHome = event.key === "Home";
  const isEnd = event.key === "End";
  if (!isNext && !isPrev && !isHome && !isEnd) return;

  const items = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
  );
  if (items.length === 0) return;

  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  if (current === -1 && !isHome && !isEnd) return;

  const last = items.length - 1;
  const target = isHome
    ? 0
    : isEnd
      ? last
      : isNext
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length;

  event.preventDefault();
  items[target]?.focus();
}
