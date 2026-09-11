import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";

/**
 * Second of the three FR-4 layers. `src/proxy.ts` already gates these prefixes,
 * but proxy coverage can silently vanish (a matcher change, a Server Function
 * POSTing to a path the matcher skips), so the check is repeated here. Convex
 * re-derives identity server-side regardless (FR-5).
 *
 * `auth.protect()` is a static property on the `auth` function, not a method on
 * the awaited auth object. It redirects document requests to `/sign-in` and
 * answers 404 for non-document requests.
 *
 * The route group `(protected)` does not appear in any URL, so this layout has
 * no route of its own to key `LayoutProps<…>` off.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return children;
}
