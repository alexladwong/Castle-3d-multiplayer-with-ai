# Convex + Clerk in Next.js 16 (App Router) — verified reference

Scope: what the 3D chess app needs to wire auth (Clerk), realtime data (Convex), and deploys.
Every claim below was checked against the **installed** packages or the official docs on 2026-09-09.
Installed: `next@16.3.4`, `@clerk/nextjs@7.9.1` (Core 3; pulls `@clerk/shared@4.31.0`, `@clerk/backend@3.17.1`, `@clerk/react@6.15.1`), `convex@1.45.0`, `react@19.2.8`.

Legend for sources:
- **[pkg]** = read from `node_modules/...` of the installed version (authoritative for this repo)
- **[docs]** = fetched from clerk.com / docs.convex.dev / bundled Next.js docs

Project facts that affect the code (checked in repo):
- `tsconfig.json` paths: only `"@/*": ["./src/*"]`. The `convex/` folder is at the **project root** (already exists with `_generated/`, `tsconfig.json`, `README.md`), so `@/convex/...` will NOT resolve. Import generated code with a relative path (`../../convex/_generated/api`) or add `"@convex/*": ["./convex/*"]` to `paths`.
- `.env.local` already contains (names only): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `VERCEL_OIDC_TOKEN`. No Clerk sign-in URL vars yet.
- `next.config.ts` has `reactCompiler: true`. App lives in `src/app`.
- `AGENTS.md` (auto-written by `next dev`) says: read `node_modules/next/dist/docs/` before writing Next code; this version has breaking changes.

---

## 1. Clerk `@clerk/nextjs` v7 (Core 3)

### 1.1 BREAKING: what changed in Core 3 that your training data gets wrong  [pkg + docs]

| Old (Core 2 / v6) | Core 3 (`@clerk/nextjs@7`) |
|---|---|
| `<SignedIn>`, `<SignedOut>`, `<Protect>` | **Removed. Rendering them throws.** Use `<Show when="signed-in">`, `<Show when="signed-out">`, `<Show when={{ role: 'admin' }}>`. Source: `dist/types/removedControlComponents.d.ts` — the stubs are typed `never` and the JSDoc says "Removed in Clerk Core 3 (`@clerk/nextjs@7.0.0`)". |
| `createRouteMatcher` + `auth.protect()` in middleware | `createRouteMatcher` is **`@deprecated`** ("will be removed in the next major version. Use resource-based auth checks instead. Move auth checks into each page, layout, API route, or Server Function") — `dist/types/server/routeMatcher.d.ts`. It still works today. |
| `middleware.ts` | Next.js 16 renamed the convention to **`proxy.ts`** (see 1.2). |
| `@clerk/clerk-react` | renamed `@clerk/react` (transitive; not imported directly here). |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | deprecated → use `*_FALLBACK_REDIRECT_URL` / `*_FORCE_REDIRECT_URL` (see 1.6). |
| Any Next | README: requires **Next.js 15.2.8+, React 18+, Node 20.9+**. |

Upgrade codemod (docs): `npx @clerk/upgrade`.

### 1.2 The middleware file: `src/proxy.ts` (not `middleware.ts`)  [Next docs in pkg + Clerk docs]

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`: "The `middleware.js` file convention has been **deprecated** in Next.js 16 and renamed to `proxy.js`… only the file and export names have changed." Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- `proxy.md`: "Create a `proxy.ts` (or `.js`) file in the project root, or inside `src` if applicable, so that it is located at the same level as `pages` or `app`." → for this repo: **`src/proxy.ts`**.
- `proxy.md`: the exported function is named `proxy` (`export function proxy(request: NextRequest)`) **or a default export** (`export default function proxy(...)`). Clerk uses `export default clerkMiddleware()` which satisfies this.
- `proxy.md` Runtime: "Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in Proxy will throw an error." → do **not** add `export const runtime = 'edge'`.
- `proxy.md`: "The `matcher` values need to be constants so they can be statically analyzed at build-time."
- `proxy.md` gotcha: "Server Functions… are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path. … Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone."
- Clerk `clerkMiddleware` reference (docs): "For Next.js 16+, use `proxy.ts` at your project root or `src/` directory. For Next.js ≤15, use `middleware.ts` instead—the code remains identical."

**Recommended `src/proxy.ts`** (Clerk reference page, verbatim matcher):

```ts
// src/proxy.ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

`clerkMiddleware()` is **required** even if you protect routes elsewhere (it sets up the auth context that `auth()` reads). Signature [pkg `dist/types/server/clerkMiddleware.d.ts`]:

```ts
clerkMiddleware(handler: (auth, request, event) => ..., options?: ClerkMiddlewareOptions | (req) => options)
clerkMiddleware(options?: ClerkMiddlewareOptions)
// ClerkMiddlewareOptions extends AuthenticateRequestOptions (minus acceptsToken) + { debug?: boolean; contentSecurityPolicy?; frontendApiProxy? }
```

**Route protection — do it at the resource (FR-4 "protected by Clerk middleware" is satisfiable either way, but Clerk now recommends resource-level):** [docs: migrate-from-create-route-matcher]

```tsx
// src/app/(protected)/layout.tsx  — protects /play, /game/[id], /profile at once via a route group
import { auth } from '@clerk/nextjs/server'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await auth.protect()          // signed-out → redirect to sign-in (document requests)
  return <>{children}</>
}
```

If you still want the middleware-level gate (works, but deprecated API):

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
const isProtected = createRouteMatcher(['/play(.*)', '/game(.*)', '/profile(.*)'])
export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect()
})
```

`auth.protect()` behaviour table [pkg `app-router/server/auth.d.ts`]: authenticated+authorized → returns Auth object; authenticated but unauthorized → 404; unauthenticated → redirect to sign-in (document requests) / **404 for non-document (API) requests**. Options [pkg `server/protect.d.ts`]: `auth.protect({ role?, permission? } | (has) => boolean, { unauthenticatedUrl?: string; unauthorizedUrl?: string; token? })` → `Promise<SignedInAuthObject>`.

### 1.3 `<ClerkProvider>` placement  [pkg + docs]

- Import: `import { ClerkProvider } from '@clerk/nextjs'` (server component; `dist/types/index.d.ts` exports it from `components.server`).
- Props (`NextClerkProviderProps`, `dist/types/types.d.ts`): all of `ClerkProviderProps` minus required `publishableKey` (auto-read from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`), plus `dynamic?: boolean` (default `false`; "opt into dynamic rendering and make auth data available to all wrapper components").
- Core 3 changelog note: with Next.js cache components, "`ClerkProvider` should be placed inside `<body>` rather than wrapping `<html>`". The Clerk quickstart and the Convex docs both put it inside `<body>`.
- Convex requirement (docs.convex.dev/auth/clerk): "`<ClerkProvider>` must wrap `<ConvexClientProvider>` because Convex needs to be able to access the Clerk context."

```tsx
// src/app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs'
import ConvexClientProvider from '@/components/ConvexClientProvider'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
```

### 1.4 UI + control components  [pkg `dist/types/index.d.ts`, `@clerk/shared/dist/types/clerk.d.ts`]

All from `import { ... } from '@clerk/nextjs'`:
- `SignIn`, `SignUp`, `SignInButton`, `SignUpButton`, `SignOutButton`, `UserButton`, `UserProfile`, `UserAvatar` (client-boundary components; usable from server components).
- `Show` — works server-side and client-side. Props [pkg `app-router/server/controlComponents.d.ts`]: `when: 'signed-in' | 'signed-out' | { permission } | { role } | { feature } | { plan } | ((has) => boolean)`, `fallback?: ReactNode`, `treatPendingAsSignedOut?: boolean`.
- `ClerkLoaded`, `ClerkLoading`, `RedirectToSignIn`, `RedirectToSignUp` still exist.

`SignInProps` [pkg shared `clerk.d.ts` ~L1589]: `RoutingOptions` (`{ path: string; routing?: 'path' } | { routing?: 'hash' }`) & `forceRedirectUrl?`, `fallbackRedirectUrl?`, `signUpUrl?`, `appearance?`, `initialValues?`, `withSignUp?: boolean`, `oauthFlow?: 'auto' | 'redirect' | 'popup'`.
`UserButtonProps`: `showName?`, `defaultOpen?`, `appearance?` (+ others).

Custom pages (Clerk docs "custom sign-in-or-up page"): file `src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs'
export default function Page() { return <SignIn /> }
```
`<SignIn />` alone gives a combined sign-in-or-up flow; a separate `/sign-up/[[...sign-up]]/page.tsx` with `<SignUp />` is optional. The docs' env for this page: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`. With `clerkMiddleware()` having no auth checks (1.2), `/sign-in` is public automatically.

Header example (Clerk quickstart, verbatim shape):
```tsx
<Show when="signed-out"><SignInButton /><SignUpButton /></Show>
<Show when="signed-in"><UserButton /></Show>
```

### 1.5 Hooks and server helpers  [pkg]

Client (`'use client'`), from `@clerk/nextjs`: `useUser`, `useAuth`, `useClerk`, `useSession`, `useSignIn`, `useSignUp`, ...
- `useUser()` → `{ isLoaded, isSignedIn, user }`; `user` (`UserResource`) has `id: string`, `username: string | null`, `imageUrl: string`, `fullName: string | null`, `primaryEmailAddress`, `hasImage` [pkg shared `user.d.ts`]. Use for FR-2 (username + avatar) on the client; but persist them in Convex `players` from the JWT (see 2.4) so the server never trusts client-supplied ids (FR-5).
- `useAuth()` → discriminated union `{ isLoaded, isSignedIn, userId, sessionId, sessionClaims, orgId, orgRole, has, signOut, getToken }` [pkg shared `hooks.d.ts` L60-90].
- `getToken(options?: GetTokenOptions): Promise<string | null>` where `GetTokenOptions = { organizationId?: string; skipCache?: boolean; template?: string }` [pkg shared `session.d.ts` L442-459]. `template` = "The name of the JWT template from the Clerk Dashboard".

Server, from `@clerk/nextjs/server` (**`auth` is NOT exported from `@clerk/nextjs`** — the root export is typed `never` with a fix-it comment) [pkg `dist/types/index.d.ts`, `server/index.d.ts`]:
- `auth()` → `Promise<SessionAuthWithRedirect>`: `userId`, `sessionId`, `sessionClaims`, `orgId`, `has()`, `getToken()`, `isAuthenticated`, `redirectToSignIn(returnBackUrl?)`, `redirectToSignUp()`. "Only available for App Router. Only works on the server-side… Requires `clerkMiddleware()` to be configured." Note in JSDoc: `redirectToSignIn` on the server can only use redirect URLs from **env vars** or clerkMiddleware dynamic keys.
- `auth.protect(...)` as in 1.2.
- Server `getToken` (Clerk auth-object reference): `type ServerGetToken = (options?: { template?: string }) => Promise<string | null>` — example in docs is literally `await getToken({ template: 'convex' })`.
- `currentUser(opts?)` → `Promise<User | null>` — calls Clerk Backend API `GET /v1/users/{id}` (rate-limited, fetch-deduped per request) [pkg `currentUser.d.ts`]. Prefer `auth()` (no network) unless you need profile fields server-side.
- Also exported: `clerkClient`, `createClerkClient`, `verifyToken`, `getAuth` (pages router), webhooks types.

### 1.6 Env vars  [pkg: grep of `@clerk/nextjs/dist/esm`; docs: clerk-environment-variables]

Read by the installed SDK: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`, plus `NEXT_PUBLIC_CLERK_PROXY_URL`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_IS_SATELLITE`, `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED`, `NEXT_PUBLIC_CLERK_KEYLESS_DISABLED`, `NEXT_PUBLIC_CLERK_CHECKOUT_CONTINUE_URL`.
**`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `AFTER_SIGN_UP_URL` are NOT read by v7** (not in the bundle grep; docs mark them deprecated). `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` is also not present — set `afterSignOutUrl` as a prop on `<ClerkProvider>`/`<UserButton>` if needed (unverified prop name for v7; see open questions).

Recommended `.env.local` additions for this app:
```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/play
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/play
```
Semantics (docs): `*_FALLBACK_REDIRECT_URL` = used when there is no `redirect_url` in the query (default `/`); `*_FORCE_REDIRECT_URL` = always used, overriding `redirect_url`.

Clerk CLI: quickstart now recommends `npx -y clerk@latest init` which writes keys to `.env.local` and creates `proxy.ts`/`middleware.ts` based on the Next version. Keys already exist in this repo, so this is optional.

---

## 2. Convex + Clerk integration

### 2.1 Clerk side: Convex integration vs. JWT template  [docs: docs.convex.dev/auth/clerk, clerk.com integrations/convex; pkg convex `react-clerk`]

Current official flow (both Convex and Clerk docs): in the Clerk Dashboard **activate the Convex integration** (https://dashboard.clerk.com/apps/setup/convex) and copy the **Frontend API URL** (dev: `https://verb-noun-00.clerk.accounts.dev`, prod: `https://clerk.<your-domain>.com`). The integration makes Clerk's *default session token* carry `aud: "convex"`, so no template is needed.

Legacy flow (still supported by the installed code): create a JWT template named exactly **`convex`** (Dashboard → JWT templates → New template → Convex). Then tokens are fetched with `getToken({ template: 'convex' })`.

`convex/react-clerk/ConvexProviderWithClerk.tsx` (installed 1.45.0) handles **both** automatically:
```ts
if (sessionClaims?.aud === "convex") {          // Convex integration
  return await getToken({ skipCache: forceRefreshToken });
} else {                                        // JWT template
  return await getToken({ template: "convex", skipCache: forceRefreshToken });
}
```
It re-creates the token fetcher (and calls `setAuth`) when `orgId`, `orgRole` or `sessionId` change.

**Consequence for server-side code (section 3):** pick one Clerk setup and match it: integration → `auth().getToken()`; template → `auth().getToken({ template: 'convex' })`. The Convex SSR docs' example uses the plain `getToken()` (integration).

### 2.2 `convex/auth.config.ts`  [pkg `convex/src/server/authentication.ts`; docs]

```ts
// convex/auth.config.ts
import type { AuthConfig } from 'convex/server'

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,   // the Clerk Frontend API URL / issuer
      applicationID: 'convex',                        // must match the token's `aud`
    },
  ],
} satisfies AuthConfig
```
Type: `AuthProvider = { applicationID: string; domain: string } | { type: 'customJwt'; issuer; jwks; algorithm: 'RS256'|'ES256'; applicationID? }`.

Env var: **set on the Convex deployment, not in Next**. `process.env` in `auth.config.ts` is evaluated by the Convex deployment. Convex docs use the name `CLERK_JWT_ISSUER_DOMAIN`; Clerk's page uses `CLERK_FRONTEND_API_URL` — the name is arbitrary, only the value (issuer URL, no trailing slash) matters. Set it via dashboard (Settings → Environment Variables, per deployment) or CLI:
```
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://verb-noun-00.clerk.accounts.dev        # dev deployment
npx convex env --prod set CLERK_JWT_ISSUER_DOMAIN https://clerk.yourdomain.com             # prod
```
Then `npx convex dev` (or `deploy`) pushes `auth.config.ts`. Dev and prod Clerk instances have different issuers — set both.

### 2.3 Client wiring  [pkg convex `react-clerk`, `react/client.ts`; docs]

```tsx
// src/components/ConvexClientProvider.tsx
'use client'
import { ReactNode } from 'react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/nextjs'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
```
- `ConvexProviderWithClerk({ children, client, useAuth })` — `useAuth` must return `{ isLoaded, isSignedIn, getToken, orgId, orgRole, sessionId, sessionClaims }` (Clerk's `useAuth` does).
- `new ConvexReactClient(address: string, options?)` throws synchronously if `address` is `undefined` ("make sure to run `convex dev` and ensure the .env.local file is populated") [pkg `react/client.ts` L333-345].

Auth-state helpers from `convex/react` [pkg `react/auth_helpers.tsx`, `ConvexAuthState.tsx`]:
- `useConvexAuth(): { isLoading: boolean; isAuthenticated: boolean; isRefreshing: boolean }` — `isAuthenticated` means **the Convex server has validated the token**. Convex docs: "Use the `useConvexAuth()` hook instead of Clerk's `useAuth()` hook when you need to check whether the user is logged in."
- `<Authenticated>` renders children only when `!isLoading && isAuthenticated`; `<Unauthenticated>` when `!isLoading && !isAuthenticated`; `<AuthLoading>` while `isLoading`; `<AuthRefreshing>` (new) when a confirmed token was rejected and is being refreshed.
- Gotcha (Convex docs): a component calling an authenticated query must be a child of `<Authenticated>`, "Otherwise, it will throw on page load" (the query runs once unauthenticated).

### 2.4 `ctx.auth.getUserIdentity()`  [pkg `server/authentication.ts`]

Returns `Promise<UserIdentity | null>` in queries/mutations/actions (`null` when unauthenticated; **throws** in HTTP actions). Fields (all `readonly`):
- Guaranteed: `tokenIdentifier: string` (= `sub` + `iss`, globally unique) and `issuer: string` (`iss`).
- `subject: string` (`sub`) — for Clerk this is the Clerk user id (`user_...`). Use this as `players.clerkId` (FR-3).
- Optional OIDC claims: `name`, `givenName`, `familyName`, `nickname`, `preferredUsername`, `profileUrl`, `pictureUrl`, `email`, `emailVerified`, `gender`, `birthday`, `timezone`, `language`, `phoneNumber`, `phoneNumberVerified`, `address`, `updatedAt`.
- Any extra custom claim is available via index signature (`identity.custom_claim as string`).
- Which optional fields are populated depends on the Clerk token config (integration "Sessions → claims" mapping or the JWT template claims). Convex docs: the `fva` claim is stripped from the identity to avoid re-running queries on every refresh.

Canonical helper for every mutation (FR-5):
```ts
// convex/lib/auth.ts
import type { QueryCtx, MutationCtx } from '../_generated/server'

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new Error('Not authenticated')
  return identity
}

export async function requirePlayer(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx)
  const player = await ctx.db
    .query('players')
    .withIndex('by_clerkId', (q) => q.eq('clerkId', identity.subject))
    .unique()
  if (!player) throw new Error('Player not provisioned')
  return player
}
```
First-sign-in provisioning (Convex "database-auth" docs pattern): call an `upsert` mutation from a `useEffect` once `useConvexAuth().isAuthenticated` is true (the `useStoreUserEffect` pattern), reading `identity.subject`, `identity.name`/`nickname`/`preferredUsername`, `identity.pictureUrl`. Alternative: Clerk webhooks → Convex `httpAction` + `internalMutation` (needs `@clerk/nextjs/webhooks` verification; not covered here).

---

## 3. Convex React hooks + Next.js server helpers

### 3.1 Hooks (`convex/react`)  [pkg `react/index.ts`, `client.ts`, `use_paginated_query.ts`, `use_queries.ts`]

- `useQuery(api.x.y, args | 'skip')` → `T | undefined` (undefined while loading). Pass the literal string `'skip'` to disable (e.g. `useQuery(api.games.get, gameId ? { gameId } : 'skip')`).
- `useMutation(api.x.y)` → `ReactMutation` (callable `(args) => Promise<Result>`), with `.withOptimisticUpdate((localStore, args) => void)` — handler **must be synchronous** (type-enforced), may only be attached once per mutation reference.
  - `localStore.getQuery(queryRef, args)`, `localStore.getAllQueries(queryRef)`, `localStore.setQuery(queryRef, args, newValue)` [pkg `browser/sync/optimistic_updates.ts`]. Docs: always create new objects; updates are rerun if local results change and rolled back when the mutation completes.
- `useAction(api.x.y)` → callable returning a promise.
- `usePaginatedQuery(api.x.y, args | 'skip', { initialNumItems: number })` → `{ results, status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted', isLoading, loadMore(numItems) }`. The query must take `paginationOpts: paginationOptsValidator` (from `convex/server`) and return `ctx.db.query(...).paginate(args.paginationOpts)`.
- `useQueries({ key: { query: api.x.y, args } })` → `Record<key, result | undefined | Error>`.
- `usePreloadedQuery(preloaded)` (see 3.2), `useConvex()`, `useConvexConnectionState()`.
- Also exported: `useQuery_experimental`, `usePaginatedQuery_experimental` (object-form options) — avoid for now.

### 3.2 Server-side (`convex/nextjs`)  [pkg `src/nextjs/index.ts`]

All functions default to `process.env.NEXT_PUBLIC_CONVEX_URL` and take an optional trailing `NextjsOptions = { token?: string; url?: string; skipConvexDeploymentUrlCheck?: boolean }`. Internally a `ConvexHttpClient` with `fetch` `cache: 'no-store'` (so the route is dynamic).

- `preloadQuery(api.x.y, args?, opts?)` → `Promise<Preloaded<Query>>` — pass to a client component's `usePreloadedQuery` for SSR + live updates.
- `preloadedQueryResult(preloaded)` → the value on the server.
- `fetchQuery(api.x.y, args?, opts?)`, `fetchMutation(...)`, `fetchAction(...)` — for Server Components, Server Actions, Route Handlers.
- Docs caveats: two `preloadQuery` calls are **not** consistent with each other; preloading prevents static rendering.

Auth token pattern (Convex SSR docs; adjust for template vs integration, see 2.1):
```ts
// src/lib/convex-server.ts
import { auth } from '@clerk/nextjs/server'

export async function getAuthToken() {
  const { getToken } = await auth()
  // Convex integration active in Clerk: plain getToken(). JWT-template setup: getToken({ template: 'convex' })
  return (await getToken({ template: 'convex' })) ?? undefined
}
```
```tsx
// src/app/game/[id]/page.tsx (Server Component)
import { preloadQuery } from 'convex/nextjs'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params            // Next 15+/16: params is a Promise
  const token = await getAuthToken()
  const preloaded = await preloadQuery(api.games.get, { gameId: id as Id<'games'> }, { token })
  return <GameClient preloaded={preloaded} />
}
```
```tsx
'use client'
import { usePreloadedQuery, type Preloaded } from 'convex/react'
export function GameClient({ preloaded }: { preloaded: Preloaded<typeof api.games.get> }) {
  const game = usePreloadedQuery(preloaded)   // hydrated immediately, then live
}
```

---

## 4. Convex server functions (v1.45)

### 4.1 Function definitions — object syntax  [pkg `server/registration.ts`, codegen templates]

Import builders from `./_generated/server`: `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`, `httpAction`; ctx types `QueryCtx`, `MutationCtx`, `ActionCtx`, `DatabaseReader`, `DatabaseWriter`. Validators from `convex/values` (`v`). References: `api` (public) and `internal` (internal) from `./_generated/api`; types `Id<'table'>`, `Doc<'table'>`, `TableNames`, `DataModel` from `./_generated/dataModel`.

```ts
import { mutation, query, internalMutation } from './_generated/server'
import { v } from 'convex/values'

export const makeMove = mutation({
  args: { gameId: v.id('games'), san: v.string() },
  returns: v.object({ fen: v.string(), status: v.string() }),   // optional but recommended
  handler: async (ctx, args) => { /* ... */ },
})
```
Supported forms (JSDoc): `query(async (ctx, args) => ...)`, `query({ handler })`, `query({ args, handler })`, `query({ args, returns, handler })`. Internal variants are identical but not callable from clients — use them for anything the scheduler/crons/actions call (matchmaking sweeps, AI-move application, heartbeat timeouts).

Validators (`v.*`) [pkg `values/validator.ts`]: `id(table)`, `null()`, `number()`, `float64()`, `int64()`, `bigint()`, `boolean()`, `string()`, `bytes()`, `literal(x)`, `array(el)`, `object({...})`, `record(keys, values)`, `union(...members)`, `any()`, `optional(v)`, `nullable(v)`, `commitTs()`. Unions of literals for enums: `v.union(v.literal('online'), v.literal('ai'), v.literal('local'))`. Optional field = `v.optional(...)`; nullable-or-absent id = `v.optional(v.union(v.id('players'), v.null()))` (requirements say `whiteId: Id<players> | null`).

### 4.2 Schema  [pkg `server/schema.ts`; docs indexes]

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  players: defineTable({
    clerkId: v.string(), username: v.string(), avatarUrl: v.string(),
    rating: v.number(), ratingHuman: v.number(), ratingAi: v.number(),
    wins: v.number(), losses: v.number(), draws: v.number(),
    roomPreset: v.string(),
    roomColors: v.optional(v.object({ background: v.string(), lightSquare: v.string(), darkSquare: v.string() })),
    roomImageStorageId: v.optional(v.id('_storage')),
    boardFlipEnabled: v.boolean(),
    boardView: v.union(v.literal('2d'), v.literal('3d')),
    qualityTier: v.union(v.literal('auto'), v.literal('low'), v.literal('medium'), v.literal('high')),
    createdAt: v.number(),
  })
    .index('by_clerkId', ['clerkId'])
    .index('by_rating', ['rating'])          // leaderboard: .withIndex('by_rating').order('desc').take(100)
    .index('by_ratingHuman', ['ratingHuman'])
    .index('by_ratingAi', ['ratingAi'])
    .index('by_username', ['username']),
  queue: defineTable({ playerId: v.id('players'), rating: v.number(), joinedAt: v.number() })
    .index('by_joinedAt', ['joinedAt'])
    .index('by_playerId', ['playerId']),
  // games, ratingHistory ...
}, { schemaValidation: true, strictTableNameTypes: true })  // both default true
```
- `.index(name, [field, ...])` (object form `{ fields: [...], staged?: boolean }` also exists). `_creationTime` is appended to every index automatically; do not list it. Limits (docs): 32 indexes/table, 16 fields/index. Index fields must be queried in definition order.
- `.searchIndex(name, { searchField, filterFields? })` for full text (`withSearchIndex`). Not needed for chess unless searching usernames.
- Unique constraints do not exist — enforce `clerkId` uniqueness in the upsert mutation (query index → `.unique()` → insert if null). Mutations are serializable transactions, so this is race-safe.

### 4.3 Database API  [pkg `server/database.ts`, `query.ts`, `index_range_builder.ts`]

- **New preferred 2-arg form**: `ctx.db.get('players', id)`, `ctx.db.patch('games', id, partial)`, `ctx.db.replace('games', id, doc)`, `ctx.db.delete('games', id)`. The old 1-arg (`ctx.db.get(id)`) still works ("Supported for backwards compatibility. Prefer `db.get(tableName, id)` in new code").
- `ctx.db.insert('games', docWithoutSystemFields)` → `Promise<Id<'games'>>`.
- `patch` shallow-merges; fields set to `undefined` are removed; throws if the doc does not exist.
- `ctx.db.normalizeId('games', str)` → `Id<'games'> | null` — use to validate route-param strings before `get`.
- `ctx.db.system.get('_scheduled_functions', id)` / `ctx.db.system.get('_storage', id)`.
- Query chain: `ctx.db.query('t')` → `.withIndex('by_x', q => q.eq('x', v).gt('y', 1).lte('y', 9))` (eq's in index order, then at most one lower bound and one upper bound) or `.fullTableScan()` → `.order('asc'|'desc')` → `.filter(q => ...)` (post-index; avoid on big sets) → terminal: `.collect()` (warns: unbounded), `.take(n)`, `.first()`, `.unique()` (throws if >1), `.paginate(opts)`.
- `paginationOptsValidator` = `v.object({ numItems, cursor: string|null, endCursor?, id?, maximumRowsRead?, maximumBytesRead? })`; `paginate` returns `{ page, isDone, continueCursor, ... }`.

### 4.4 Actions, internal calls, runtimes  [pkg `registration.ts`; docs runtimes/bundling]

- `ActionCtx` has `auth`, `storage`, `scheduler`, `runQuery(ref, args)`, `runMutation(ref, args)`, `runAction(ref, args)` (each a separate transaction; `runAction` only to cross runtimes), `vectorSearch`. **No `ctx.db` in actions.** `MutationCtx` also has `runQuery`/`runMutation` (sub-transactions) but you rarely need them.
- `internal.module.fn` references are only callable from server contexts (actions, scheduler, crons, `fetchMutation` cannot call internal).
- Default runtime (queries/mutations/actions without `'use node'`): V8 isolate; esbuild bundles your `convex/` code **and its npm dependencies** into one bundle (limit 32 MiB). Supports "most npm libraries that work in the browser, Deno, and Cloudflare workers"; no Node APIs except `process.env`, `AsyncLocalStorage`, `AsyncResource`; libraries relying on dynamic `import()`/`require()` fail at runtime. Queries/mutations must be deterministic (Convex provides seeded `Math.random`/`Date.now`).
- **`chess.js@1.4.0` in a mutation: allowed.** Checked `node_modules/chess.js`: pure ESM+CJS builds (`dist/esm/chess.js`), no `require(`/`import(`/`process`/`fs`/`Buffer` usage, no `Math.random`/`Date`. Import in `convex/games.ts` as `import { Chess } from 'chess.js'` and validate SAN before writing FEN (FR-10/FR-43/FR-44).
- `'use node'` (file-level directive at top): only for **actions**; a `'use node'` file must not define queries/mutations, and default-runtime files must not import it. Node runtime arg limit is 5 MiB (vs 16 MiB); `node.externalPackages` in `convex.json` (e.g. `["*"]`) installs packages at runtime instead of bundling (45 MB zipped / 240 MB unzipped). Only relevant if you run a Node-only Stockfish build inside Convex — the requirements prefer computing candidates on the client or in a Vercel route, so probably unnecessary.

Example: matchmaking sweep + AI move application via internal functions:
```ts
// convex/matchmaking.ts
export const pairPlayers = internalMutation({ args: {}, handler: async (ctx) => { /* pair oldest two within ±200 */ } })
// convex/crons.ts
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'
const crons = cronJobs()
crons.interval('pair queued players', { seconds: 10 }, internal.matchmaking.pairPlayers)
export default crons
```

### 4.5 Scheduler  [pkg `server/scheduler.ts`; docs]

- `ctx.scheduler.runAfter(delayMs: number, fnRef, args?)` / `ctx.scheduler.runAt(timestamp: number | Date, fnRef, args?)` → `Promise<Id<'_scheduled_functions'>>`; `ctx.scheduler.cancel(id)`.
- From a mutation, scheduling is transactional: scheduled iff the mutation commits. Use `runAfter(0, internal.ai.replyToMove, { gameId })` to kick off async work after a move, and `runAfter(30_000, internal.games.checkAbandon, { gameId, expectedMoveCount })` for heartbeat/abandonment (FR lastHeartbeat). Status via `ctx.db.system.get('_scheduled_functions', id)` → `state` ∈ Pending/InProgress/Success/Failed/Canceled.

### 4.6 Crons  [pkg `server/cron.ts`; docs]

File **must** be `convex/crons.ts`, default-exporting the result of `cronJobs()`. Methods: `crons.interval(name, { seconds | minutes | hours: n }, fnRef, args?)` (exactly one unit), `crons.cron(name, '* * * * *', fnRef, args?)`, `crons.hourly(name, { minuteUTC? }, ...)` (since 1.43 `minuteUTC` may be omitted; Convex picks a stable minute), `crons.daily(name, { hourUTC, minuteUTC? }, ...)`, `crons.weekly(name, { dayOfWeek, hourUTC, minuteUTC? }, ...)`, `crons.monthly(name, { day, hourUTC, minuteUTC? }, ...)`. Target should be an internal mutation/action.

### 4.7 File storage (FR-21k custom room backgrounds)  [pkg `server/storage.ts`; docs upload-files]

- `StorageWriter` (mutations/actions): `generateUploadUrl(): Promise<string>`, `delete(id)`; `StorageReader` (queries too): `getUrl(id: Id<'_storage'>): Promise<string | null>`, `getMetadata(id)`. Actions additionally get `store(blob)` and `get(id)`.
- Flow: (1) mutation returns `await ctx.storage.generateUploadUrl()` (auth-check inside; URL expires in **1 hour**); (2) client `fetch(postUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })` → JSON `{ storageId }` (POST has a 2-minute timeout); (3) mutation `saveRoomImage({ storageId: v.id('_storage') })` patches `players.roomImageStorageId` (enforce the 5 MB cap client-side and via `ctx.storage.getMetadata(id).size` in the save mutation); (4) query resolves `await ctx.storage.getUrl(player.roomImageStorageId)` and returns the URL to the client.
- Old string storage-id format is deprecated; always type as `Id<'_storage'>`.

---

## 5. CLI, env vars, deploy

Verified against `convex/src/cli/*.ts` and docs.

- `npx convex dev` — logs in (first time), creates/links a project, writes **`CONVEX_DEPLOYMENT`** (dev deployment name, e.g. `dev:happy-otter-123`) and **`NEXT_PUBLIC_CONVEX_URL`** to `.env.local` (Next.js detected → `NEXT_PUBLIC_CONVEX_URL`, from `cli/lib/envvars.ts`), then watches `convex/`, typechecks, runs codegen and pushes. Flags: `--once`, `--until-success`, `--typecheck <mode>`, `--codegen <mode>`, `--run <functionName>`, `--run-sh <command>`, `--tail-logs [mode]`, `--push-all-modules`, `-v`. Run `pnpm dlx convex dev` or `npx convex dev` (package is installed locally so `pnpm convex dev` also works).
- `npx convex codegen` — regenerate `convex/_generated` without pushing (useful in CI typecheck).
- `npx convex env list | get <name> | set <name> <value> | remove <name>`; `set` also supports `--from-file value.txt` / `--from-file .env.defaults`. Add `--prod` to target production (`npx convex env --prod set ...`).
- `npx convex run <module:fn> '<json args>'` (`--prod`, `--push`, `--watch`); `npx convex dashboard` opens the dashboard; `npx convex logs`.
- `npx convex deploy` — pushes to **production** using `CONVEX_DEPLOY_KEY` (from env; generate in Dashboard → Settings → Deploy keys). Flags: `--cmd '<build command>'` (runs the frontend build after pushing, with the prod URL injected), `--cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL` (default name is inferred; set explicitly if unsure), `--preview-run <functionName>`, `--preview-create <name>`, `--check-build-environment <mode>`, `--env-file <file>`, `--message <msg>`, `--allow-deleting-large-indexes`.

**Vercel setup** (Convex hosting docs):
1. Vercel project → Settings → Build & Development → Build Command override: `npx convex deploy --cmd 'pnpm build'` (docs show `npm run build`; this repo uses pnpm).
2. Vercel env `CONVEX_DEPLOY_KEY` = production deploy key, scoped to **Production** only. For preview deployments add a second `CONVEX_DEPLOY_KEY` (a *preview* deploy key) scoped to Preview; Convex creates a per-branch preview backend and you can seed it with `--preview-run 'seed:run'`.
3. Do **not** hard-code `NEXT_PUBLIC_CONVEX_URL` in Vercel for production — `convex deploy --cmd` injects it during the build. Only set it manually if you skip `--cmd`.
4. Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, the `NEXT_PUBLIC_CLERK_SIGN_*` vars) go in Vercel env (`vercel env add`), production Clerk instance keys for Production.
5. On the **Convex** production deployment set `CLERK_JWT_ISSUER_DOMAIN` to the production Clerk Frontend API URL (`https://clerk.<domain>`); on the dev deployment set the `*.clerk.accounts.dev` one. Convex dashboard → deployment switcher (top-left) → Settings → Environment Variables, or `npx convex env [--prod] set ...`.
6. `.gitignore` must exclude `.env.local` (NFR-8). `CONVEX_DEPLOYMENT` is safe but not needed on Vercel.

Handy Convex MCP tools exist in this session (`mcp__plugin_convex_convex__envSet`, `envList`, `status`, `tables`, `run`) if the implementation agent wants to set `CLERK_JWT_ISSUER_DOMAIN` without the CLI.

---

## 6. Minimal end-to-end skeleton (all pieces above)

```
src/proxy.ts                      clerkMiddleware() + matcher (1.2)
src/app/layout.tsx                <ClerkProvider><ConvexClientProvider>… (1.3)
src/components/ConvexClientProvider.tsx   ConvexProviderWithClerk (2.3)
src/app/sign-in/[[...sign-in]]/page.tsx   <SignIn />   (1.4)
src/app/sign-up/[[...sign-up]]/page.tsx   <SignUp />   (optional)
src/app/(protected)/layout.tsx    await auth.protect()  (1.2)  → /play, /game/[id], /profile
convex/auth.config.ts             providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: 'convex' }]
convex/schema.ts                  defineSchema (4.2)
convex/lib/auth.ts                requireIdentity / requirePlayer (2.4)
convex/players.ts                 upsertFromIdentity mutation (called from a useEffect after useConvexAuth().isAuthenticated)
convex/games.ts                   makeMove mutation using chess.js (4.4)
convex/matchmaking.ts + convex/crons.ts   internalMutation + crons.interval (4.6)
```

---

## Unverified / open questions

1. **Clerk Dashboard state for this app** — whether the Convex *integration* is activated or a JWT template named `convex` exists could not be checked (no dashboard access). The client provider handles both; the server `getAuthToken()` must match (see 2.1). Decide and document in `.env.example`.
2. **Exact set of claims Clerk puts in the Convex token** (`name`, `picture`, `nickname`, `preferred_username`, `email`) — depends on the integration's Sessions claim mapping / template; the `UserIdentity` *type* is verified but population is not. Log `identity` once in dev and pick `username` from `nickname ?? preferredUsername ?? name`.
3. `afterSignOutUrl` prop name / `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` — not present in the v7 bundle env grep; prop existence on `<ClerkProvider>`/`<UserButton>` in v7 was not confirmed (grep of `UserButtonProps` returned only `showName`, `defaultOpen`, `appearance` in the awk window).
4. `--cmd-url-env-var-name` default inference for Next.js during `npx convex deploy --cmd` — docs say the URL var is set automatically and the CLI's `envvars.ts` maps Next.js → `NEXT_PUBLIC_CONVEX_URL`; not run end-to-end here. If the built site points at the dev URL, pass the flag explicitly.
5. Whether `auth.protect()` in a route-group **layout** is sufficient for Next 16 cache components / PPR (Clerk docs show page-level examples; layouts render once per navigation). Page-level `auth.protect()` (or per Server Function) is the safest per Clerk's migration guide.
6. Clerk Core 3 `ClerkProvider` "inside `<body>`" recommendation was read from the changelog summary, not the raw page; the placement above follows both quickstarts anyway.
7. Convex free-tier limits (function timeouts, memory) were not pulled; the runtimes page fetched did not list them.

---

## 4.8 Concurrency, matchmaking atomicity and scheduled loops

Covers FR-22..FR-26 (§3.5 Matchmaking) and FR-32 (§3.6 disconnect forfeit). Verified against
`node_modules/convex@1.45.0` (`src/server/*.ts`, `dist/esm-types/server/*.d.ts`, `CHANGELOG.md`,
`dist/esm/cli/insights.js`) and docs.convex.dev (`/database/advanced/occ`, `/error`,
`/scheduling/scheduled-functions`, `/scheduling/cron-jobs`, `/production/state/limits`) plus
stack.convex.dev/how-convex-works via Context7.

### 4.8.1 The transaction model: serializable OCC with automatic server-side retries

| Fact | Value | Source |
|---|---|---|
| Isolation level | **True serializability** — not snapshot isolation. Docs explicitly say Convex "provides true serializability and will yield correct results regardless of what transactions are issued concurrently". | docs `/database/advanced/occ` |
| Mechanism | Each transaction records a **read set** = the exact documents and **index ranges scanned**. At commit Convex checks whether any write landed in that read set between start and commit ts. Overlap ⇒ abort + re-run. | stack.convex.dev/how-convex-works (via Context7) |
| Auto-retry | **Yes.** Mutations are deterministic and side-effect free, so Convex "can run several retries if necessary until we succeed". | docs `/database/advanced/occ` |
| Retry count | **Not documented.** Docs only say "Convex internally does several retries to mitigate this concern." Treat the number as unspecified. | docs `/error` |
| Failure surface | After retries are exhausted the mutation throws and the **client's `await mutation(...)` promise rejects** with a message of the form:<br>`Documents read from or written to the table "queue" changed while this mutation was being run and on every subsequent retry.`<br>The message names the table, the conflicting mutation, and one conflicting document id. | docs `/error` |
| Observability | `npx convex insights` (`--details`, `--json`, `--prod`) reports insight kinds `occRetried` / `occFailedPermanently`, with `occCalls`, `occTableName`, and per-event `occ_retry_count`, `occ_document_id`, `occ_write_source`. Covers the last 72 hours; cloud deployments only. | pkg `dist/esm/cli/insights.js` |
| Atomicity | All writes in a mutation "will only apply together" — write your mutation as if it always succeeds and is atomic. | docs `/database/advanced/occ` |

**What `useMutation` does on retry: nothing.** The retry is entirely server-side and invisible to the
client. `useMutation` (pkg `dist/esm-types/react/client.d.ts` L472) returns a `ReactMutation` whose
call returns `Promise<FunctionReturnType<Mutation>>`; the promise resolves once with the final result
or rejects with the write-conflict error. There is no client-side OCC retry loop in
`src/browser/sync/*` (the only retry logic there is WebSocket reconnect backoff and auth-token
re-confirmation). **Consequence: any user-facing mutation that can lose an OCC race must either be
low-contention or be wrapped in your own try/catch + user-visible retry.**

**Version note (1.42.0+, so present in 1.45.0):** `ctx.runQuery(..., { useStaleSnapshot: true })` — an
advanced `AdvancedRunQueryOptions` flag that reads a recent-but-possibly-stale snapshot to dodge OCC
conflicts (pkg `dist/esm-types/server/registration.d.ts` L890-903). It is **mutations-only**
(`registration_impl.ts` L342-344 throws `"useStaleSnapshot is only supported in mutations, not
queries."`). The doc comment says its "use is generally discouraged except for specific use-cases
where database read conflicts are expected, e.g. reading from an append-only table with immutable
records". **Do not use it for matchmaking** — the queue is not append-only and a stale read would
let you pair an already-paired player.

### 4.8.2 Is a single "read two oldest, delete both, insert game" mutation safe?

**Correctness: yes. Throughput/UX: no — do not run it from every client.**

Because Convex is serializable and the read set includes the scanned index range on `queue`, two
concurrent `findMatch` calls that both scan the same range **cannot both commit**. The loser aborts
and is re-run from scratch, at which point it re-reads the queue and sees the rows the winner
deleted. So double-pairing is impossible. What you get instead is contention: every client-issued
pairing mutation reads a range that every other client's enqueue/pair mutation writes to, so under
even light concurrency you get `occRetried`, and once retries are exhausted the user's "Find match"
button rejects with a write-conflict error. The documented remediation is exactly this: "design data
models to minimize frequent writes to the same document" and "ensure mutations only read necessary
data" (docs `/error`).

**Recommended pattern: split enqueue (per-client, narrow read set) from pairing (single writer).**

- `enqueue` — public mutation, called by the player. Reads **only that user's own rows** via an
  equality index range, so its read set does not overlap other players' rows.
- `pairTick` — `internalMutation`, the **only** function that reads the whole queue and creates
  games. Run it from a driver that guarantees one-at-a-time execution (§4.8.4).

Scheduled mutations additionally get a stronger guarantee than client mutations — from the installed
`Scheduler` docstring (pkg `dist/esm-types/server/scheduler.d.ts`):

> **Scheduled mutations** are guaranteed to execute **exactly once**. They are automatically retried
> on transient errors. **Scheduled actions** execute **at most once**. They are not retried and may
> fail due to transient errors.

So an OCC abort inside `pairTick` is retried by the platform and never reaches a user.

```ts
// convex/schema.ts (fragment)
queue: defineTable({
  userId: v.id("users"),
  rating: v.number(),
  joinedAt: v.number(),          // Date.now() at enqueue; used for window widening (FR-23)
})
  .index("by_user", ["userId"])
  .index("by_joinedAt", ["joinedAt"]),
```

```ts
// convex/matchmaking.ts
import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// FR-22 / FR-26: join the queue. Narrow read set = only this user's rows.
export const enqueue = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not signed in");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (user === null) throw new Error("No user row");

    // FR-26: cannot queue while in an active game.
    const active = await ctx.db
      .query("games")
      .withIndex("by_player_status", (q) =>
        q.eq("playerIds", user._id).eq("status", "active"),
      )
      .first();
    if (active !== null) throw new Error("Already in a game");

    const existing = await ctx.db
      .query("queue")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing !== null) return null;                 // idempotent re-click

    await ctx.db.insert("queue", {
      userId: user._id,
      rating: user.rating,
      joinedAt: Date.now(),
    });
    return null;
  },
});

// FR-25: cancel. Also narrow.
export const dequeue = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => { /* find own row by_user, ctx.db.delete("queue", row._id) */ return null; },
});

// FR-23 / FR-24: the ONLY writer that pairs. internalMutation => not callable from a client.
export const pairTick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    // Bounded scan: never .collect() an unbounded table (see limits in 4.8.6).
    const waiting = await ctx.db
      .query("queue")
      .withIndex("by_joinedAt")
      .order("asc")
      .take(100);

    const paired = new Set<string>();
    for (let i = 0; i < waiting.length; i++) {
      const a = waiting[i];
      if (paired.has(a._id)) continue;
      // FR-23: ±200 widening by 100 every 10s, derived from joinedAt — no per-player timer needed.
      const windowA = 200 + 100 * Math.floor((now - a.joinedAt) / 10_000);
      for (let j = i + 1; j < waiting.length; j++) {
        const b = waiting[j];
        if (paired.has(b._id)) continue;
        const windowB = 200 + 100 * Math.floor((now - b.joinedAt) / 10_000);
        // Symmetric test: both players must accept the other's rating.
        const diff = Math.abs(a.rating - b.rating);
        if (diff > Math.max(windowA, windowB)) continue;

        // Re-read before writing: makes a duplicate run of this tick a no-op (idempotency, 4.8.5).
        const [freshA, freshB] = await Promise.all([
          ctx.db.get("queue", a._id),
          ctx.db.get("queue", b._id),
        ]);
        if (freshA === null || freshB === null) continue;

        const whiteFirst = Math.random() < 0.5;          // FR-23: random colours
        await ctx.db.insert("games", {
          whiteId: whiteFirst ? a.userId : b.userId,
          blackId: whiteFirst ? b.userId : a.userId,
          status: "active",
          // ...fen, moves, lastHeartbeat, etc.
        });
        await ctx.db.delete("queue", freshA._id);
        await ctx.db.delete("queue", freshB._id);
        paired.add(a._id);
        paired.add(b._id);
        break;
      }
    }
    return null;
  },
});
```

FR-24 ("both clients redirected to `/game/[id]` via subscription") needs no extra machinery: the
clients subscribe with `useQuery(api.matchmaking.myMatch)` — a query that looks up an active `games`
row for the signed-in user — and Convex pushes the new row to both.

**`Math.random()` inside a mutation is allowed** — Convex seeds it deterministically per transaction
so re-runs on OCC retry stay deterministic. (Do not use `Math.random()` to derive an idempotency key
across *different* invocations.)

### 4.8.3 `withIndex(...).order("asc").take(n)` + `delete` inside one mutation

- `take(n)` is on the `OrderedQuery` interface: `take(n: number): Promise<Array<Doc>>` — "Execute the
  query and return the first `n` results ... (or less if the query doesn't have `n` results)"
  (pkg `dist/esm-types/server/query.d.ts` L191-197). Default order is ascending; `.order("asc")` is
  explicit and harmless.
- Every table automatically has the system indexes **`by_id: ["_id"]`** and
  **`by_creation_time: ["_creationTime"]`** (pkg `dist/esm-types/server/system_fields.d.ts` L39-40),
  so `.withIndex("by_creation_time").order("asc").take(2)` works without declaring an index. Prefer
  an explicit `joinedAt` field + index anyway, so a re-queue after a cancelled match sorts correctly.
- **Deleting a doc you read earlier in the same transaction is fine.** The mutation is one atomic
  transaction; reads and writes are ordered within it, and the write set is applied together at
  commit. There is no "cannot delete a row you read" restriction.
- **Gotcha (verified in the installed types):** "Convex queries do not support `.delete()` directly on
  query results. To delete multiple documents, `.collect()` them first, then delete each one
  individually." (pkg `dist/esm-types/server/database.d.ts` L300-305). There is **no**
  `.query(...).delete()`, no `deleteMany`, no bulk delete. Loop over the array.
- v1.45 signatures (table-name form preferred in new code; the id-only form is kept for back-compat):
  `ctx.db.get(table, id)`, `ctx.db.insert(table, value)`, `ctx.db.patch(table, id, partial)`,
  `ctx.db.replace(table, id, value)`, `ctx.db.delete(table, id)` (pkg `database.d.ts` L199/226/267/293).
- Read-set implication: `.take(100)` over `by_joinedAt` puts **that index range** in the read set, so
  any insert into that range (a new player queuing) conflicts with the tick. That is exactly why the
  tick must be a scheduled/cron mutation (auto-retried) rather than a client mutation.

### 4.8.4 Driving the 10s loop: `crons.interval` vs `ctx.scheduler.runAfter` self-rescheduling

**`crons.interval` — verified API and constraints**

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("matchmaking tick", { seconds: 10 }, internal.matchmaking.pairTick);
crons.interval("forfeit absent players", { seconds: 15 }, internal.games.forfeitAbsent);
export default crons;
```

- Schedule shape is a union — **exactly one** of `{ seconds }`, `{ minutes }`, `{ hours }`; supplying
  zero or two throws `"Must specify one of seconds, minutes, or hours"` (pkg `src/server/cron.ts`
  L317-331).
- The only client-side validation is `validateIntervalNumber`: `Number.isInteger(n) && n > 0`, else
  `"Interval must be an integer greater than 0"` (pkg `src/server/cron.ts` L197-201). **So
  `{ seconds: 10 }` is valid — and so is `{ seconds: 1 }`.** No minimum interval is documented
  anywhere in the package or on `/scheduling/cron-jobs` or `/production/state/limits`.
- Convex's own docstring example uses a sub-minute interval:
  `crons.interval("Clear presence data", {seconds: 30}, api.presence.clear)` (pkg `src/server/cron.ts`
  L302) — sub-minute intervals are an intended use.
- **The single-writer guarantee you want:** "At most one run of each cron job can be executing at any
  moment." If a run overruns its interval, "following runs of the cron job may be skipped to avoid
  execution from falling behind." (docs `/scheduling/cron-jobs`). This is the strongest serialization
  primitive Convex documents, and it is what makes `pairTick` a true single writer.
- Cron identifiers must be printable ASCII and unique per deployment; registering the same identifier
  twice throws `Cron identifier registered twice: <id>` (pkg `src/server/cron.ts` L255-262, L288-290).
- Crons run in UTC; `crons.cron()` takes standard five-field syntax. Named helpers:
  `hourly({minuteUTC?})`, `daily({hourUTC, minuteUTC?})`, `weekly({dayOfWeek, hourUTC, minuteUTC?})`,
  `monthly({day, hourUTC, minuteUTC?})` (pkg `src/server/cron.ts` L20-48). Note `weekly` uses
  **`dayOfWeek: "monday"`** (a string), not a number — the docs summary that says `day: number` is
  wrong for weekly; trust the installed types.

**`ctx.scheduler` — verified API and constraints** (pkg `dist/esm-types/server/scheduler.d.ts`)

- `runAfter(delayMs, fnRef, args?) => Promise<Id<"_scheduled_functions">>` — non-negative delay; `0`
  means "immediately after this mutation commits".
- `runAt(timestampMs | Date, fnRef, args?) => Promise<Id<"_scheduled_functions">>` — timestamp can't
  be more than five years in the past or future.
- Scheduling from a mutation is **transactional**: if the mutation rolls back, nothing is scheduled.
- Execution guarantees (docstring, quoted above): scheduled **mutations = exactly once, auto-retried
  on transient errors**; scheduled **actions = at most once, not retried**. Put your matchmaking and
  forfeit logic in `internalMutation`s, never `internalAction`s.
- **`ctx.scheduler.cancel(id)` guarantees** (docstring, verbatim paraphrase): for scheduled
  **actions**, if it hasn't started it won't run; if it's already in progress it keeps running but
  anything *it* schedules is cancelled; cancelling an already-completed one **throws an error**. For
  scheduled **mutations**, the job is only ever `pending` / `completed` / `failed` — never
  `inProgress` — and "canceling a mutation will atomically cancel it entirely or fail to cancel if it
  has committed. It is a transaction that will either run to completion and commit or fully roll
  back." So: **cancel is all-or-nothing for mutations, and you must tolerate it throwing** if the job
  already ran. Wrap in try/catch when cancelling a heartbeat/forfeit timer.
- The `_scheduled_functions` system table (read with `ctx.db.system.get("_scheduled_functions", id)`)
  carries `name`, `args`, `scheduledTime`, `completedTime`, `state` ∈ Pending / InProgress (actions
  only) / Success / Failed / Canceled. Results are retained **7 days**.
- 1.42.0+ exposes the running job's own id as `scheduledFunctionId` from
  `ctx.meta.getRequestMetadata()` (pkg `CHANGELOG.md`).

**Recommendation for FR-23: use `crons.interval({ seconds: 10 })`, not a self-rescheduling
`runAfter` loop.**

Why:
1. The cron gives you a documented **"at most one run executing at any moment"** guarantee for free.
   A `runAfter` self-loop has no such guarantee — if anything ever double-schedules it (a retry, a
   deploy, a manual dashboard run) you get two concurrent pairing writers and you're back to OCC
   contention. Enforcing single-ness yourself requires a singleton lock document, which is itself a
   hot contended row.
2. Crons are declarative in `convex/crons.ts`, so a deploy can't leave an orphaned loop running with
   stale arguments; a `runAfter` chain survives deploys and must be manually killed.
3. Convex's own docstring blesses sub-minute intervals (`{seconds: 30}`), and `{ seconds: 10 }`
   passes validation.
4. FR-23's "widen by 100 every 10 seconds" needs **no timer at all** — derive the window from
   `now - joinedAt` inside the tick (see `pairTick` above). The 10s cadence is only the *evaluation*
   cadence, which is exactly what a cron is for.

Use `ctx.scheduler.runAfter` instead only for **one-shot, per-entity deadlines** — e.g. FR-33's
optional per-side clock flag-fall, or a "cancel this queue entry after 5 minutes" timeout — where
each timer belongs to one document and there is no shared writer.

**Latency caveat + optional hybrid.** A pure 10s cron means the first two players can wait up to ~10s
to be paired, which is poor UX on an empty lobby. If you want sub-second pairing, add a *kick* from
`enqueue`: `await ctx.scheduler.runAfter(0, internal.matchmaking.pairTick, {})`. Two concurrent
enqueues then schedule two ticks that can run concurrently and conflict — but they are **scheduled
mutations, so Convex auto-retries them and the user never sees the error**, and serializability still
prevents double-pairing. Keep the 10s cron as the widening/liveness driver either way.

**Cost note (arithmetic, not a documented figure):** a `{ seconds: 10 }` cron is 6 runs/min = 8,640
runs/day ≈ 260k function calls/month, plus a second forfeit cron. Check this against your Convex plan's
included function-call allowance before shipping; if it's tight, run the tick at `{ seconds: 30 }`
and rely on the `runAfter(0, ...)` kick for latency, or make the tick a cheap early-return when the
queue is empty (a `.take(2)` that returns `[]` is one tiny index read).

### 4.8.5 Idempotency for pairing and for the FR-32 forfeit job

Scheduled mutations are exactly-once, but you should still write these jobs so a duplicate run is a
no-op — a deploy, a manual dashboard invocation, or your own `runAfter(0)` kick can all produce a
second run.

Rules that make a run idempotent:

1. **Guard on the state you are about to leave, inside the same transaction as the write.**
   Read the doc, check `status === "waiting"` / `status === "active"`, then write. Because the
   mutation is serializable, that check-then-write is atomic — no separate lock is needed. This is
   the whole idempotency story in Convex.
2. **Re-`ctx.db.get` a doc before acting on it** if you read it earlier via a bulk query and the
   transaction has done other work since (as `pairTick` does with `freshA`/`freshB`). A `null` means
   someone else consumed it; `continue` rather than throwing.
3. **Make queue membership unique per user** (`by_user` + `.unique()` in `enqueue`) so a double-click
   or a client retry after a network blip cannot insert two rows for the same player.
4. **Never key off wall-clock alone.** Compare against a stored timestamp field
   (`lastHeartbeat`, `joinedAt`) so a second run in the same second sees an already-updated value.

FR-32 forfeit job:

```ts
// convex/games.ts
export const forfeitAbsent = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 60_000;                 // FR-32: absent for 60s
    const active = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(200);                                       // bounded, not .collect()
    for (const game of active) {
      if (game.status !== "active") continue;           // (1) guard
      const wDead = game.lastHeartbeat.w < cutoff;
      const bDead = game.lastHeartbeat.b < cutoff;
      if (!wDead && !bDead) continue;
      if (wDead && bDead) {
        await ctx.db.patch("games", game._id, { status: "abandoned" });
        continue;
      }
      await ctx.db.patch("games", game._id, {
        status: "abandoned",
        winner: wDead ? "b" : "w",
        endReason: "disconnect",
      });
      // Rating updates etc. are safe here precisely because the status guard above
      // means a second run of this tick finds status !== "active" and skips.
    }
    return null;
  },
});
```

The heartbeat write itself (`patch("games", id, { lastHeartbeat: {...} })`) is a **per-game document
write**, so it only conflicts with other writes to that same game — fine. But note the forfeit tick
reads an index range over all active games while every playing client patches games in that range, so
the tick will take OCC retries under load; keeping it a cron/scheduled mutation means those retries
are automatic. Keep the heartbeat interval coarse (e.g. one patch every 10-15s per player, not per
frame) — the docs' remediation for write conflicts is literally "avoid calling mutations an excessive
number of times".

### 4.8.6 Documented execution and transaction limits (docs `/production/state/limits`)

| Limit | Value |
|---|---|
| **Query / mutation execution time** | **1 second of user code** (time spent in database operations is excluded) |
| Convex-runtime action execution time | 30 minutes |
| Node-runtime action execution time | 10 minutes |
| Data read per transaction | 16 MiB |
| Data written per transaction | 16 MiB |
| **Documents scanned per transaction** | **32,000** |
| Documents written per transaction | 16,000 |
| Functions a single mutation can schedule | 1,000 |
| Scheduled-function argument size | 4 MiB (16 MiB total across one mutation's schedules) |
| Outstanding scheduled functions | 1,000,000 |
| Function argument size | 16 MiB |
| Concurrent scheduled jobs (by deployment class) | S16: 8 · S256: 256 · D1024: 512 · D2048: 1024 |

Practical consequences for matchmaking:

- The **1s user-code budget** is why `pairTick` must bound its candidate set. An O(n²) pairing scan
  over `.collect()` of a large queue will blow the budget and, separately, put the entire table in the
  read set. `.take(100)` keeps the scan at ≤ 4,950 comparisons and the read set to a bounded index
  range.
- Insights (`npx convex insights`) surfaces `bytesReadLimit` / `documentsReadLimit` /
  `documentsReadThreshold` alongside OCC insights — watch these once the queue and games tables grow.

---

## Unverified / open questions (§4.8)

- **Exact OCC retry count.** Docs say only "several retries" / "internally does several retries". No
  number is published in the package or the docs. Do not build logic that assumes a specific count.
- **Whether cron-triggered mutations get the same "exactly once / auto-retried on transient errors"
  treatment as `ctx.scheduler`-scheduled mutations.** The guarantee is documented on the `Scheduler`
  interface docstring; crons are implemented on top of scheduled functions, so it almost certainly
  applies, but I could not find that stated for crons specifically.
- **Documented minimum `crons.interval` frequency.** None found in `src/server/cron.ts`,
  `/scheduling/cron-jobs`, or `/production/state/limits` — only `Number.isInteger(n) && n > 0`. There
  may be an undocumented backend floor; `{ seconds: 10 }` is well inside the range Convex's own
  example (`{seconds: 30}`) uses, but `{ seconds: 1 }` is untested here.
- **Maximum number of cron jobs per deployment.** Not documented on the limits page.
- **Convex plan function-call allowance** (used in the cost estimate above) — not verified; check
  convex.dev/pricing for the current included quota before committing to a 10s tick.
- **Whether `Math.random()` is deterministically seeded per transaction so OCC retries reproduce the
  same colour assignment.** Convex's OCC design requires mutation determinism, which implies a seeded
  RNG, but I could not find this stated explicitly in the installed package or the OCC page. If it
  matters, derive the colour from a stable value instead (e.g. parity of `a._creationTime`).
- **`ctx.db.vars.commitTs`** (a commit-timestamp placeholder resolving to an ordered `bigint`, pkg
  `database.d.ts` L308-319) exists in 1.45 and could give a stricter queue ordering than
  `_creationTime`, but I found no docs page describing its intended use — not used above.
