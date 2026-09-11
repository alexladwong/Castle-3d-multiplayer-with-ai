// src/components/game/game-shortcuts.ts  [U2 → UI_UPGRADE_2 §4.8 item 5]
// The keyboard map of §4.3, in the shape `ShortcutsDialog` wants. One list, so
// the dialog and `use-shortcuts.ts` can never drift apart.
//
// The collision this round fixed: the 3D board's camera used the bare arrow keys,
// which are the review keys everywhere else on the screen, and R — which flips
// the board — also reset the camera. The camera now takes Shift+arrows and the
// bracket keys; the arrows and R keep one meaning each.
import type { Shortcut } from "@/components/ui-kit";

export const GAME_SHORTCUTS: Shortcut[] = [
  { group: "Playing", keys: ["T"], label: "Switch between the 2D and 3D board" },
  { group: "Playing", keys: ["R"], label: "Flip" },
  { group: "Playing", keys: ["F"], label: "Enter or leave fullscreen" },
  { group: "Review", keys: ["←"], label: "Previous move" },
  { group: "Review", keys: ["→"], label: "Next move" },
  { group: "Review", keys: ["Home"], label: "First move" },
  { group: "Review", keys: ["End"], label: "Back to the live position" },
  { group: "Camera (3D)", keys: ["Shift", "←"], label: "Orbit left" },
  { group: "Camera (3D)", keys: ["Shift", "→"], label: "Orbit right" },
  { group: "Camera (3D)", keys: ["Shift", "↑"], label: "Orbit up" },
  { group: "Camera (3D)", keys: ["Shift", "↓"], label: "Orbit down" },
  { group: "Camera (3D)", keys: ["["], label: "Zoom out" },
  { group: "Camera (3D)", keys: ["]"], label: "Zoom in" },
  { group: "Help", keys: ["?"], label: "Show this list" },
  { group: "Help", keys: ["Esc"], label: "Leave fullscreen, or stop reviewing" },
];

/** The one line the dialog needs that is not a key: how a move is actually made. */
export const GAME_SHORTCUTS_NOTE =
  "Click a piece, then a highlighted square; press T for the 2D board with keyboard squares. Reset the camera from Camera in the action bar.";
