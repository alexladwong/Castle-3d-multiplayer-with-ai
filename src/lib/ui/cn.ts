// src/lib/ui/cn.ts  [U0]
// Class-name helpers shared by the ui-kit. `cn` is re-exported so a ui-kit file
// has one import for both the merge helper and the token-level class constants.
export { cn } from "@/lib/utils";

/**
 * The brass focus ring (UI_REDESIGN §1.1). Every interactive ui-kit element
 * spreads this so keyboard focus is visible on any surface.
 */
export const focusRing =
  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring";

/** Same ring drawn inside the element — for anything flush with its container. */
export const focusRingInset =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/**
 * "Ada Lovelace" → "AL", "pip" → "P". Used by PlayerChip and the persona discs
 * when there is no avatar to show.
 */
export function initials(name: string, max = 2): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, max)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
