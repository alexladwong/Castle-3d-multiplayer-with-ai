"use client";
// src/components/tutor/access.tsx
// Who may use the tutor. The real app answers from Clerk's session claims
// (`has({ feature: "tutor" })`, docs/PRO_TUTOR.md §2); the dev harness answers from
// a scenario. Server-side gating lives in the tutor route, never here — this only
// decides which panel state to draw.
import { useAuth } from "@clerk/nextjs";
import { createContext, useContext } from "react";
import { TUTOR_FEATURE } from "@/lib/constants";

/**
 * Where the locked panel leaves the game id before it sends the member to `/pro`
 * (docs/PRO_TUTOR.md §2), so the welcome state on that page can offer "Back to the
 * game". `sessionStorage`, not a query string: the id is not something to publish in
 * a URL that a member might paste, and checkout bounces through Clerk's own pages.
 *
 * One key, defined once, because two packages read it: the tutor panel writes it and
 * `src/components/pro` reads it.
 */
export const TUTOR_RETURN_KEY = "castle:tutor:return";

/** Every accessor is guarded: Safari's private mode throws on `sessionStorage`. */
export function rememberTutorReturn(gameId: string): void {
  try {
    sessionStorage.setItem(TUTOR_RETURN_KEY, gameId);
  } catch {
    /* no session storage — the welcome state simply offers no return link. */
  }
}

export function readTutorReturn(): string | null {
  try {
    return sessionStorage.getItem(TUTOR_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearTutorReturn(): void {
  try {
    sessionStorage.removeItem(TUTOR_RETURN_KEY);
  } catch {
    /* nothing to clear. */
  }
}

export interface TutorAccess {
  /** true = Pro member with the tutor feature; false = not; undefined = not known yet. */
  hasTutor: boolean | undefined;
}

const TutorAccessContext = createContext<TutorAccess | null>(null);

/** Wrap a subtree to force an answer (the dev harness, stories, tests). */
export function TutorAccessProvider({
  value,
  children,
}: {
  value: TutorAccess;
  children: React.ReactNode;
}) {
  return <TutorAccessContext.Provider value={value}>{children}</TutorAccessContext.Provider>;
}

/** Clerk-backed answer; `has` is undefined before hydration, so the answer is too. */
function useClerkTutorAccess(): TutorAccess {
  const { isLoaded, isSignedIn, has } = useAuth();
  if (!isLoaded) return { hasTutor: undefined };
  if (!isSignedIn) return { hasTutor: false };
  return { hasTutor: has?.({ feature: TUTOR_FEATURE }) ?? undefined };
}

export function useTutorAccess(): TutorAccess {
  const forced = useContext(TutorAccessContext);
  const clerk = useClerkTutorAccess();
  return forced ?? clerk;
}
