"use client";
// src/components/landing/hero-ctas.tsx  [U1]
// §3: "▐ Play now ▌ Watch live games". Two buttons, always the same two labels and
// the same footprint — only the destination of the first one depends on Clerk, so
// nothing moves when `useAuth()` resolves.
//
// Semantics are the ones `HeroActions` (nav/auth-nav.tsx) has today: a signed-in
// visitor goes straight to the lobby, a guest goes to sign-up. Why client-side and
// not `auth()`: see the note at the top of auth-nav.tsx.
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";

/** Both hero buttons are taller than the app's default 36px control. */
/* `transition-colors` replaces buttonVariants' `transition-all`, which would
   otherwise animate height and width too. */
const HERO_BUTTON = "h-11 cursor-pointer px-5 text-[15px] transition-colors duration-(--dur-micro)";

export function HeroCtas({ className }: { className?: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  // While Clerk loads, point at /play: the proxy sends a guest to /sign-in with the
  // destination attached, which is the same place the sign-up link lands them.
  const playHref = isLoaded && !isSignedIn ? "/sign-up" : "/play";

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Link
        prefetch={false}
        href={playHref}
        className={cn(buttonVariants({ size: "lg" }), HERO_BUTTON)}
      >
        Play now
      </Link>
      <Link
        prefetch={false}
        href="#live-now"
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), HERO_BUTTON)}
      >
        Watch live games
      </Link>
    </div>
  );
}
