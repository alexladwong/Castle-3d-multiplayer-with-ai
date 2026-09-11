"use client";
// src/components/nav/site-header.tsx  [U4]
// The app chrome of UI_REDESIGN §4: 56px tall, content capped at 1200.
//
// Three visual states, all driven by attributes rather than by a store, so the
// landing page and the game screen can set them without importing anything:
//
//   1. default            — elevated: --bg-elevated/80, blur, hairline underneath.
//   2. over the hero      — the landing page's `[data-hero-flag]` marker is in the
//                           document and fewer than 40px have been scrolled (§3):
//                           fully transparent, no border, no blur.
//   3. board focus layout — <html data-layout="focus"> (§5.2): hidden entirely.
//
// State 2 needs both halves: the hero marker is owned by the landing page (U1) and
// `data-scrolled` by this component, which is why the header — and not the
// document — carries the scroll flag. `:has()` is what lets the header react to a
// marker that comes *after* it in the document without anyone writing to <body>
// from an effect, so there is no elevated-header flash on a cold load of `/`.
// The legacy `body[data-hero="true"]` selectors are kept alongside it so anything
// that still sets that attribute keeps working. State 3 is pure CSS on an ancestor,
// so the game screen never has to reach into this tree.
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthActions, AuthNavLinks } from "@/components/nav/auth-nav";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { cn, focusRing } from "@/lib/ui";

/** §3: "the header … gains --bg-elevated/80 + blur after 40px scroll". */
const SCROLL_THRESHOLD = 40;

function useScrolledPast(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Read once on mount as well as on scroll: a refresh part-way down a page, or
    // a back-navigation that restores the scroll offset, fires no scroll event.
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);

  return scrolled;
}

export function SiteHeader() {
  const scrolled = useScrolledPast(SCROLL_THRESHOLD);

  return (
    <header
      // A stable hook for anyone who needs to select the header from outside this
      // tree (U2 asked for it so the game screen never has to say `body > header`).
      data-slot="site-header"
      data-scrolled={scrolled ? "true" : "false"}
      className={cn(
        "sticky top-0 z-40 h-14 border-b transition-colors duration-150",
        "border-border/70 bg-background/80 backdrop-blur-md",
        // §5.2 focus layout — the ancestor selector out-specifies the base rules.
        "[[data-layout=focus]_&]:hidden",
        // §3 hero — transparent until the visitor has scrolled past the fold.
        "[body:has([data-hero-flag])_&[data-scrolled=false]]:border-transparent",
        "[body:has([data-hero-flag])_&[data-scrolled=false]]:bg-transparent",
        "[body:has([data-hero-flag])_&[data-scrolled=false]]:backdrop-blur-none",
        "[body[data-hero=true]_&[data-scrolled=false]]:border-transparent",
        "[body[data-hero=true]_&[data-scrolled=false]]:bg-transparent",
        "[body[data-hero=true]_&[data-scrolled=false]]:backdrop-blur-none",
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[75rem] items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          prefetch={false}
          href="/"
          aria-label="Castle — home"
          className={cn(
            // 36px of tappable area on touch (DESIGN.md, Layout) without
            // changing the header's density on a mouse-driven pointer.
            "flex shrink-0 items-center justify-center gap-2 rounded-lg px-1 py-1 text-foreground",
            "pointer-coarse:min-h-9 pointer-coarse:min-w-9",
            focusRing,
          )}
        >
          <span aria-hidden className="text-lg leading-none text-primary">
            ♞
          </span>
          {/* Below 640 the wordmark gives its width to the nav, which would
              otherwise clip "Leaderboard" mid-word at 375-390. The link keeps its
              accessible name either way. */}
          <span className="hidden text-sm font-semibold tracking-tight sm:inline sm:text-[0.9375rem]">
            Castle
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <AuthNavLinks />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          <AuthActions />
        </div>
      </div>
    </header>
  );
}
