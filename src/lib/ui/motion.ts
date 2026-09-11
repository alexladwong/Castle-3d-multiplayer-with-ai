// src/lib/ui/motion.ts  [U0]
// The motion vocabulary of UI_REDESIGN §1.3, in JS. The same numbers exist as
// CSS variables in globals.css (`--dur-*`, `--ease-out-soft`); use these only
// where a component has to time something itself (timeouts, staggers).

/** Durations in ms, one name per row of §1.3. */
export const DURATION = {
  /** Button colour, hover, any two-state swap. */
  micro: 120,
  /** Chat bubble enter (scale 0.98 → 1). */
  bubble: 160,
  /** Scroll reveal: opacity + 8px translate. */
  reveal: 400,
  /** Hero headline words rising 12px. */
  rise: 500,
  /** Room crossfade. */
  room: 600,
  /** Canvas fade-in after the first frame. */
  canvas: 800,
  /** Thinking-dots pulse cycle. */
  thinking: 900,
} as const;

/** Stagger between hero headline words / revealed children, in ms. */
export const STAGGER_MS = 60;

/** Idle delay before the fullscreen HUD hides itself (§5.2). */
export const HUD_IDLE_MS = 3000;

export const EASE_OUT_SOFT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * Per-item delay for a staggered group. Returns a style object rather than a
 * class so an arbitrary number of children can stagger without a class per index.
 * `reduced` collapses every delay to 0 (§1.3: no staggers under reduced motion).
 */
export function stagger(index: number, reduced = false): React.CSSProperties {
  return { "--reveal-delay": `${reduced ? 0 : index * STAGGER_MS}ms` } as React.CSSProperties;
}

/** ms → the CSS `transition-duration` string, 0 when motion is reduced. */
export function duration(ms: number, reduced = false): string {
  return `${reduced ? 0 : ms}ms`;
}
