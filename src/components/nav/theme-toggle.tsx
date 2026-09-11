"use client";
// src/components/nav/theme-toggle.tsx  [U0]
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";

const NOOP_SUBSCRIBE = () => () => {};

/**
 * Light/dark switch for the header (§4).
 *
 * `resolvedTheme` is undefined on the server, so the button cannot be rendered
 * until the client has hydrated — `useSyncExternalStore` gives that answer
 * without a setState-in-effect. The placeholder is exactly the button's size, so
 * nothing shifts when it appears.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const mounted = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();

  if (!mounted) {
    return (
      <span
        aria-hidden
        className={cn("inline-block size-7 shrink-0 pointer-coarse:size-9", className)}
      />
    );
  }

  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("shrink-0", className)}
    >
      {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
    </Button>
  );
}
