"use client";
// src/components/pro/pro-pricing.tsx  [PRO_TUTOR §1, §2, §7]
// The price band of /pro: Clerk's `<PricingTable/>` in a sunken well, plus the
// welcome state members land on after checkout.
//
// The price itself is never written here. It lives in the Clerk plan (`pro`, 900
// cents) and the component prints it, so the page cannot drift from what a member is
// actually charged. `newSubscriptionRedirectUrl` and the one `session.reload()` on
// arrival are §2's fix for the session token still saying "free" for a few seconds
// after a successful payment.
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PricingTable, useClerk } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { Display, Section } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { clearTutorReturn, readTutorReturn, useTutorAccess } from "@/components/tutor/access";
import { useClerkAppearance } from "@/lib/clerk-appearance";
import { cn, focusRing } from "@/lib/ui";
import "./pro.css";

/** Convex ids are opaque lowercase strings; anything else in storage is not a game. */
const GAME_ID = /^[a-z0-9]{16,64}$/i;

/** Clerk streams the plans in; this holds their shape so the well does not jump. */
function PricingSkeleton() {
  return (
    <div aria-busy className="grid gap-4 sm:grid-cols-2">
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export function ProPricing() {
  const appearance = useClerkAppearance();

  return (
    <Section id="plans" padding="none" className="scroll-mt-20 py-8 sm:py-12">
      <Display level={3} as="h2">
        What it costs.
      </Display>

      {/* `useSearchParams` needs a boundary for the rest of the page to stay static. */}
      <Suspense fallback={null}>
        <WelcomeNotice />
      </Suspense>

      {/* §7's "walnut well". Clerk paints its plan cards in `colorMuted` — cellar in
          this palette — so the panel under them is walnut and the tone steps DOWN
          into each card: espresso ground, walnut panel, cellar cards. Depth is
          tonal here, never a shadow (DESIGN.md, Elevation). */}
      <div
        data-slot="pricing-well"
        className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-6"
      >
        <PricingTable
          appearance={appearance}
          newSubscriptionRedirectUrl="/pro?welcome=1"
          fallback={<PricingSkeleton />}
        />
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        Monthly. Cancel any time.
      </p>
    </Section>
  );
}

/**
 * The state a member arrives in from checkout (`/pro?welcome=1`).
 *
 * `has` is read from the session token, and the token that came back from checkout
 * predates the subscription — so the session is reloaded exactly once here before the
 * answer is believed. The ref, not a state flag, is what makes it once: `isLoaded`
 * flipping and Clerk's context re-identifying would otherwise both re-run the effect.
 */
function WelcomeNotice() {
  const welcome = useSearchParams().get("welcome") === "1";
  const clerk = useClerk();
  const { hasTutor } = useTutorAccess();
  // One piece of state, written once, from a callback rather than from the effect
  // body: two synchronous setState calls in an effect are two cascading renders.
  const [arrival, setArrival] = useState<{ reloaded: boolean; returnTo: string | null }>({
    reloaded: false,
    returnTo: null,
  });
  const started = useRef(false);

  useEffect(() => {
    if (!welcome || started.current || !clerk.loaded) return;
    started.current = true;

    void (async () => {
      const stored = readTutorReturn();
      try {
        await clerk.session?.reload();
      } catch {
        /* the token refreshes itself on the next navigation either way. */
      }
      setArrival({ reloaded: true, returnTo: stored && GAME_ID.test(stored) ? stored : null });
    })();
  }, [welcome, clerk, clerk.loaded]);

  const { reloaded, returnTo } = arrival;

  if (!welcome) return null;

  if (!reloaded || hasTutor === undefined) {
    return (
      <p role="status" className="mt-6 text-[15px] text-muted-foreground">
        Checking your membership…
      </p>
    );
  }

  if (!hasTutor) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h3 className="text-[1.25rem] leading-tight font-semibold tracking-tight text-foreground">
          Not switched over yet
        </h3>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
          The payment has gone through but your plan has not caught up. Reload this page in a
          moment and the tutor will be there.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-4 min-h-11")}
        >
          Reload the page
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h3 className="font-display text-[2rem] leading-[1.1] tracking-[-0.01em] text-foreground">
        You are in.
      </h3>
      <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-pretty text-muted-foreground">
        The tutor is waiting on the left of the board, in every game you play or watch.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {returnTo ? (
          <Link
            prefetch={false}
            href={`/game/${returnTo}`}
            onClick={clearTutorReturn}
            className={cn(buttonVariants({ size: "lg" }), "min-h-11", focusRing)}
          >
            <ArrowLeft aria-hidden data-icon="inline-start" />
            Back to the game
          </Link>
        ) : (
          <Link
            prefetch={false}
            href="/play"
            className={cn(buttonVariants({ size: "lg" }), "min-h-11", focusRing)}
          >
            Find a match
          </Link>
        )}
      </div>
    </div>
  );
}
