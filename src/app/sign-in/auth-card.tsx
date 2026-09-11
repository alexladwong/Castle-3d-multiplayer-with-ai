"use client";
// src/app/sign-in/auth-card.tsx  [U4]
// The Clerk <SignIn/> and <SignUp/> cards, themed onto the Study tokens
// (UI_REDESIGN §1.1). Shared by both auth routes — it lives beside the sign-in
// page because both routes belong to this package and Next only treats reserved
// filenames (page/layout/route/…) inside app/ as routes.
//
// The palette itself is `src/lib/clerk-appearance.ts`, the one place the Study
// tokens are written in Clerk's appearance vocabulary — the same values the
// pricing table and the user-profile modal use, so the auth card cannot drift
// away from the billing surfaces (this file used to carry its own copy).
import { SignIn, SignUp } from "@clerk/nextjs";
import { useClerkVariables } from "@/lib/clerk-appearance";

/**
 * Neither component takes routing props: the Next SDK fills `routing: "path"`
 * and `path` from the pathname.
 */
export function AuthCard({ kind }: { kind: "sign-in" | "sign-up" }) {
  // Variables only: the plan-card element override in `useClerkAppearance` has
  // nothing to say about a sign-in card.
  const appearance = { variables: useClerkVariables() };

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 py-12">
      {kind === "sign-in" ? (
        <SignIn appearance={appearance} />
      ) : (
        <SignUp appearance={appearance} />
      )}
    </div>
  );
}
