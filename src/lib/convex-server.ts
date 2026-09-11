// src/lib/convex-server.ts
// Server-only. Fetches the Convex-audience JWT for `preloadQuery` / `fetchQuery` /
// `fetchMutation` inside Server Components and Route Handlers (§E.1 step 8).
//
// This app authenticates Convex through the Clerk **JWT template named `convex`**
// (verified in clerk-setup.md §0: template id jtmp_3J5WhMRDDwh8FuS83KACkOHJV3H, aud "convex").
// `ConvexProviderWithClerk` on the client calls `getToken({ template: "convex" })` for the
// same reason — the two must agree or the server render and the live subscription would
// authenticate as different principals.
//
// `auth()` requires clerkMiddleware() (src/proxy.ts) to have run for the request.
//
// NOTE: no `import "server-only"` guard — the package is not a direct dependency and does
// not resolve under this pnpm layout (`require.resolve('server-only')` -> MODULE_NOT_FOUND),
// so importing it would break `tsc --noEmit`. `@clerk/nextjs/server` already throws if this
// module is pulled into a client bundle.
import { auth } from "@clerk/nextjs/server";

/**
 * The Convex token for the signed-in user, or `undefined` when signed out.
 * `undefined` (not `null`) is what `preloadQuery`'s `{ token }` option expects.
 */
export async function getAuthToken(): Promise<string | undefined> {
  const { getToken } = await auth();
  return (await getToken({ template: "convex" })) ?? undefined;
}

/** `{ token }` options object, ready to spread into a convex/nextjs call. */
export async function convexAuthOptions(): Promise<{ token: string | undefined }> {
  return { token: await getAuthToken() };
}
