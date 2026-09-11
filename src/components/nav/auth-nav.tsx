"use client";

import Link from "next/link";
import { Show, UserButton, useAuth } from "@clerk/nextjs";
import { NavLinks, NAV_LINKS, PUBLIC_NAV_LINKS } from "@/components/nav/nav-links";
import { buttonVariants } from "@/components/ui/button";
import { useConvexAuth, useQuery } from "convex/react";
import { Star, UserRound } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { cn, focusRing } from "@/lib/ui";

/**
 * Client-side auth-aware header parts.
 *
 * Why client-side (and not the server `<Show>`): calling `auth()` in the root layout
 * (1) forces every route — including `/`, `/leaderboard` and the not-found page — to
 * render dynamically, and (2) throws "Clerk can't detect clerkMiddleware()" whenever
 * a static-extension URL (e.g. `/favicon.png`) 404s, because the proxy matcher
 * deliberately skips those paths. `useAuth()` reads Clerk's client state instead;
 * the header reserves its width until Clerk loads so nothing jumps.
 *
 * Why `prefetch={false}` on the two auth links: `/sign-in` and `/sign-up` are optional
 * catch-all routes (`[[...sign-in]]`, required by Clerk). On Vercel with Next 16.3 the
 * router's segment-tree prefetch for those routes comes back with the catch-all param
 * replaced by the internal `…segments/_tree.segment.rsc` path, the client rejects the
 * mismatched tree and immediately re-prefetches — ~4 requests/second per visible link
 * until it gives up (measured: 280+ requests in 12 s on one page view). The routes are
 * dynamic anyway, so there is nothing useful to prefetch.
 */
function useProfileHref() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  return isAuthenticated && me ? `/profile/${encodeURIComponent(me.username)}` : null;
}

export function AuthNavLinks() {
  const { isLoaded, isSignedIn } = useAuth();
  const profileHref = useProfileHref();
  const links = isLoaded && isSignedIn
    ? [...NAV_LINKS, ...(profileHref ? [{ href: profileHref, label: "Profile" }] : [])]
    : PUBLIC_NAV_LINKS;
  return <NavLinks links={links} />;
}

export function AuthActions() {
  const { isLoaded, isSignedIn } = useAuth();
  const profileHref = useProfileHref();

  if (!isLoaded) {
    // Same footprint as the two buttons so the header does not shift on hydration.
    return <div aria-hidden className="h-8 w-[8.25rem]" />;
  }

  if (isSignedIn) {
    return (
      <>
        <ProLink />
        <UserButton>
          {profileHref ? (
            <UserButton.MenuItems>
              <UserButton.Link label="My profile" labelIcon={<UserRound size={16} />} href={profileHref} />
            </UserButton.MenuItems>
          ) : null}
        </UserButton>
      </>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        prefetch={false}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Sign in
      </Link>
      <Link href="/sign-up" prefetch={false} className={buttonVariants({ size: "sm" })}>
        Sign up
      </Link>
    </>
  );
}

/** Clerk owns membership; both states lead to the plan overview and pricing. */
function ProLink() {
  return (
    <Show
      when={{ plan: "pro" }}
      fallback={
        <Link href="/pro" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Upgrade to Pro
        </Link>
      }
    >
      <Link
        prefetch={false}
        href="/pro"
        aria-label="Pro membership"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap text-primary",
          "pointer-coarse:min-h-9 transition-colors duration-(--dur-micro) hover:bg-muted/60",
          focusRing,
        )}
      >
        <Star aria-hidden className="size-3.5 fill-current" />
        Pro
      </Link>
    </Show>
  );
}

/** Landing-page call to action; same reasoning as `AuthActions`. */
export function HeroActions() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn) {
    return (
      <>
        <Link prefetch={false} href="/play" className={buttonVariants({ size: "lg" })}>
          Play now
        </Link>
        <Link prefetch={false} href="/leaderboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Leaderboard
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/sign-up" prefetch={false} className={buttonVariants({ size: "lg" })}>
        Create an account
      </Link>
      <Link
        href="/sign-in"
        prefetch={false}
        className={buttonVariants({ variant: "outline", size: "lg" })}
      >
        Sign in
      </Link>
    </>
  );
}
