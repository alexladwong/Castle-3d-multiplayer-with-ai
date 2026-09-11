"use client";
// src/lib/clerk-appearance.ts  [PRO_TUTOR §7]
// The Study palette, spoken in Clerk's appearance vocabulary. ONE palette for every
// Clerk component in the app: `<SignIn/>` and `<SignUp/>` (src/app/sign-in/auth-card.tsx),
// `<PricingTable/>` on /pro, and the user-profile modal that /settings opens for
// "manage or cancel". It lives in `src/lib` rather than beside any one of them so
// none of those packages has to import another's internals to stay in step.
//
// The variable NAMES were read off @clerk/react's own `Variables` type before use
// (node_modules/.pnpm/@clerk+react@6.15.1/.../types-*.d.mts): this version has
// `colorForeground` / `colorMutedForeground` / `colorInputForeground`, not the older
// `colorText` / `colorTextSecondary`. Same names the sign-in card already uses.
//
// Hex, not `var(--accent)`: clerk-js DERIVES a shade scale from `colorPrimary` and
// `colorNeutral`, so it parses the value — a `var()` yields no scale. The two
// palettes are therefore written out and swapped from `resolvedTheme`. The values
// are DESIGN.md's, verbatim.
import type * as React from "react";
import { useTheme } from "next-themes";
import type { PricingTable } from "@clerk/nextjs";

type Appearance = NonNullable<React.ComponentProps<typeof PricingTable>["appearance"]>;
type Variables = NonNullable<Appearance["variables"]>;
type Elements = NonNullable<Appearance["elements"]>;

const SHARED: Variables = {
  /** DESIGN.md, Shapes: controls at 10px. */
  borderRadius: "0.625rem",
  fontFamily: "var(--font-geist-sans)",
  fontFamilyMono: "var(--font-geist-mono)",
};

const DARK: Variables = {
  ...SHARED,
  colorPrimary: "#c9a24a", // brass
  colorPrimaryForeground: "#1a130d", // brass ink
  colorBackground: "#1c1610", // walnut
  colorForeground: "#f1e7d3", // ivory
  colorMuted: "#0c0907", // cellar
  colorMutedForeground: "#b3a48c", // parchment
  colorInput: "#0c0907",
  colorInputForeground: "#f1e7d3",
  colorBorder: "#2d241b", // seam
  colorRing: "#c9a24a",
  colorNeutral: "#f1e7d3",
  colorDanger: "#d4644a", // ember
  colorSuccess: "#3f9b73", // baize
};

const LIGHT: Variables = {
  ...SHARED,
  colorPrimary: "#806018",
  colorPrimaryForeground: "#fbf7ee",
  colorBackground: "#fbf7ee",
  colorForeground: "#1a130d",
  colorMuted: "#e9e0cf",
  colorMutedForeground: "#5c503f",
  colorInput: "#fbf7ee",
  colorInputForeground: "#1a130d",
  colorBorder: "#d9cdb7",
  colorRing: "#806018",
  colorNeutral: "#1a130d",
  colorDanger: "#a63d27",
  colorSuccess: "#1f6b4d",
};

/**
 * Clerk's own buttons are shorter than the 44px touch floor this round asks for, and
 * they are the only controls on /pro we do not draw ourselves. `elements` takes a
 * style object (`UserDefinedStyle = string | CSSObject`), so the floor is set on the
 * one element that matters rather than with a blanket CSS rule over Clerk's tree.
 */
const ELEMENTS: Elements = {
  pricingTableCardFooterButton: { minHeight: "2.75rem" },
};

/**
 * The appearance for whichever theme is on screen.
 *
 * `resolvedTheme` is undefined until next-themes has read the class on `<html>`; the
 * app's default is dark, so that is the fallback. clerk-js re-renders when the prop
 * changes and no layout depends on the value, so there is nothing to suspend on.
 */
export function useClerkAppearance(): Appearance {
  return { variables: useClerkVariables(), elements: ELEMENTS };
}

/**
 * The palette alone, for a Clerk component that draws no plan cards — the sign-in and
 * sign-up cards, whose only control is Clerk's own primary button.
 */
export function useClerkVariables(): Variables {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "light" ? LIGHT : DARK;
}
