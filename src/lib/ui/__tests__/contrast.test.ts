// @vitest-environment node
// src/lib/ui/__tests__/contrast.test.ts  [U0]
//
// The palette of docs/UI_REDESIGN.md §1.1 is only a design system if it is also
// readable. This test parses the real token values out of src/app/globals.css —
// not a copy of them — and holds every text pair to WCAG AA (4.5:1).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(fileURLToPath(new URL("../../../app/globals.css", import.meta.url)), "utf8");

/**
 * Hex declarations inside one top-level rule. Neither block nests, by design.
 * Anchored to the start of a line so a `:root {` written inside a comment (there
 * is one, explaining the font wiring) cannot be mistaken for the rule.
 */
function tokensIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`globals.css has no \`${selector}\` block`);
  const end = CSS.indexOf("\n}", start + 1);
  const block = CSS.slice(start, end);
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[match[1]!] = match[2]!.toLowerCase();
  }
  return out;
}

const LIGHT = tokensIn(":root");
/** `.dark` only overrides; anything it does not restate is inherited from :root. */
const DARK = { ...LIGHT, ...tokensIn(".dark") };

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1 … 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT_PAIRS: [foreground: string, background: string][] = [
  ["--fg", "--bg"],
  ["--fg", "--bg-elevated"],
  ["--fg", "--bg-sunken"],
  ["--fg-muted", "--bg"],
  ["--fg-muted", "--bg-elevated"],
  ["--fg-muted", "--bg-sunken"],
  ["--accent-fg", "--accent"],
  ["--accent", "--bg"],
  ["--accent", "--bg-elevated"],
  ["--live", "--bg"],
  ["--live", "--bg-elevated"],
  ["--danger", "--bg"],
  ["--danger", "--bg-elevated"],
];

const REQUIRED_TOKENS = [
  "--bg",
  "--bg-elevated",
  "--bg-sunken",
  "--fg",
  "--fg-muted",
  "--line",
  "--accent",
  "--accent-fg",
  "--live",
  "--danger",
];

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ["light (:root)", LIGHT],
  ["dark (.dark)", DARK],
])("%s palette", (_name, tokens) => {
  it("declares every §1.1 token as a hex value", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(tokens[token], `${token} is missing or not a 6-digit hex`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT_PAIRS)("%s on %s clears 4.5:1", (fg, bg) => {
    const ratio = contrastRatio(tokens[fg]!, tokens[bg]!);
    expect(
      Number(ratio.toFixed(2)),
      `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps hairlines distinguishable from the surfaces they separate", () => {
    // A hairline is decorative, so the 4.5 (text) and 3.0 (UI component) floors
    // do not apply — this only catches a --line that has collapsed into --bg.
    expect(contrastRatio(tokens["--line"]!, tokens["--bg"]!)).toBeGreaterThanOrEqual(1.2);
  });
});

describe("chat bubble, `you` variant", () => {
  // src/components/ui-kit/chat-message.tsx sets the player's own bubble as
  // `bg-line` + `text-foreground dark:text-primary`, i.e. --fg on --line in light
  // and --accent on --line in dark. The pairing is per-theme, so it cannot ride in
  // TEXT_PAIRS (which asserts the same two tokens against both palettes) — brass on
  // light seam is 3.71:1 and is exactly what this bubble must never go back to.
  it("light sets the label in ink on seam", () => {
    const ratio = contrastRatio(LIGHT["--fg"]!, LIGHT["--line"]!);
    expect(
      Number(ratio.toFixed(2)),
      `--fg (${LIGHT["--fg"]}) on --line (${LIGHT["--line"]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("dark keeps the brass it earns on seam", () => {
    const ratio = contrastRatio(DARK["--accent"]!, DARK["--line"]!);
    expect(
      Number(ratio.toFixed(2)),
      `--accent (${DARK["--accent"]}) on --line (${DARK["--line"]}) is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("records why light mode cannot use brass here", () => {
    // Not an aspiration: if a future palette ever lifts light brass over 4.5:1 on
    // seam this fails, and `dark:text-primary` can go back to being unconditional.
    expect(contrastRatio(LIGHT["--accent"]!, LIGHT["--line"]!)).toBeLessThan(4.5);
  });
});

describe("board tokens", () => {
  it("keeps the two square colours apart", () => {
    expect(contrastRatio(LIGHT["--board-light"]!, LIGHT["--board-dark"]!)).toBeGreaterThanOrEqual(3);
  });

  it("uses the same squares in both themes", () => {
    expect(DARK["--board-light"]).toBe(LIGHT["--board-light"]);
    expect(DARK["--board-dark"]).toBe(LIGHT["--board-dark"]);
  });
});
