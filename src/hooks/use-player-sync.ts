"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * FR-3 / §E.1 step 5. Calls `players.ensurePlayer` exactly once per session.
 *
 * Gated on `useConvexAuth().isAuthenticated`, NOT Clerk's `isSignedIn`:
 * `isAuthenticated` means the Convex server has already validated the token, so
 * the mutation cannot race the first token exchange.
 *
 * The mutation is idempotent, so a duplicate call would be harmless; the ref is
 * there to avoid the pointless round-trip, and it resets on sign-out so a second
 * account in the same tab is provisioned too.
 */
export function usePlayerSync(): void {
  const { isAuthenticated } = useConvexAuth();
  const ensurePlayer = useMutation(api.players.ensurePlayer);
  const sent = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      sent.current = false;
      return;
    }
    if (sent.current) return;
    sent.current = true;

    ensurePlayer({}).catch((error: unknown) => {
      // Allow a retry on the next auth transition rather than wedging the session.
      sent.current = false;
      console.error("[player-sync] ensurePlayer failed", error);
    });
  }, [isAuthenticated, ensurePlayer]);
}
