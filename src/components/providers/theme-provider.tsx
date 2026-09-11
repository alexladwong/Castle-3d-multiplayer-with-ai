"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Tailwind v4 in this scaffold uses the class strategy
 * (`@custom-variant dark (&:is(.dark *))`), so `attribute="class"` is required.
 * `src/components/ui/sonner.tsx` calls `useTheme()`, so this must sit above the
 * `<Toaster />`.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
