"use client";

import type { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// `new ConvexReactClient(undefined)` throws synchronously with a helpful message,
// so no extra guard is needed here.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Must be rendered INSIDE `<ClerkProvider>` — the provider reads the Clerk
 * context to mint a Convex token. It branches internally: when
 * `sessionClaims.aud === "convex"` it calls `getToken()`, otherwise
 * `getToken({ template: "convex" })`. This app uses the JWT template.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
