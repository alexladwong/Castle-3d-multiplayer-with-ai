# Next.js 16.3.4 App Router + shadcn/ui (Base UI) + Tailwind v4 — verified notes for the 3D chess app

Scope: framework/UI-layer facts that every implementation agent needs. Verified against the
installed packages in `node_modules/` (exact versions below), the bundled Next docs at
`node_modules/next/dist/docs/`, the repo scaffold files, context7 (`/vercel/next.js`), and the
official Clerk / shadcn / Tailwind / Base UI docs (WebFetch). Sources are cited per section.
Anything not confirmed is in the last section.

## 0. Repo state as scaffolded (read these before touching config)

| File | What it says | Source |
|---|---|---|
| `package.json` | `next 16.3.4`, `react 19.2.8`, `react-dom 19.2.8`, `typescript ^5`, `eslint ^9`, `eslint-config-next 16.3.4`, `tailwindcss ^4` (installed 4.3.3), `@tailwindcss/postcss ^4` (4.3.3), `babel-plugin-react-compiler 1.0.0`, `shadcn ^4.21.0`, `@base-ui/react ^1.8.0`, `cn ^0.2.6`, `class-variance-authority ^0.7.1`, `lucide-react ^1.42.0`, `tw-animate-css ^1.4.0`, `sonner ^2.0.8`, `next-themes ^0.4.6`, `@clerk/nextjs ^7.9.1`. Scripts: `dev: next dev`, `build: next build`, `start: next start`, `lint: eslint`. `packageManager: pnpm@11.24.0`. | `/package.json` |
| `next.config.ts` | Only `reactCompiler: true`. No `typedRoutes`, no `headers()`, no `images`, no `cacheComponents`. | `/next.config.ts` |
| `tsconfig.json` | `strict: true`, `moduleResolution: bundler`, `jsx: react-jsx`, `paths: {"@/*": ["./src/*"]}`, `plugins: [{name:"next"}]`, `include` has `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`. | `/tsconfig.json` |
| `eslint.config.mjs` | ESLint 9 flat config: `defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**","out/**","build/**","next-env.d.ts"])])` importing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. | `/eslint.config.mjs` |
| `postcss.config.mjs` | `plugins: { "@tailwindcss/postcss": {} }` | `/postcss.config.mjs` |
| `pnpm-workspace.yaml` | `allowBuilds: { esbuild: true, sharp: false, stockfish: true, unrs-resolver: false }` (pnpm 11 build-script allowlist). | `/pnpm-workspace.yaml` |
| `components.json` | `style: "base-nova"`, `rsc: true`, `tsx: true`, `tailwind.css: "src/app/globals.css"`, `baseColor: "neutral"`, `cssVariables: true`, `prefix: ""`, `iconLibrary: "lucide"`, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`. | `/components.json` |
| `src/lib/utils.ts` | `export { cn } from "cn"` (the `cn` npm package, NOT clsx+tailwind-merge; neither clsx nor tailwind-merge is installed). | `/src/lib/utils.ts` |
| `src/app/layout.tsx` | Uses `Geist`/`Geist_Mono` from `next/font/google` with CSS vars `--font-geist-sans` / `--font-geist-mono`; root layout typed as `RootLayout({ children }: LayoutProps<"/">)` (global helper, no import). | `/src/app/layout.tsx` |
| `src/components/ui/` | 26 shadcn components already present: alert-dialog, avatar, badge, button, card, dialog, drawer, dropdown-menu, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, toggle-group, toggle, tooltip. | `ls src/components/ui` |
| `AGENTS.md` | Auto-written by `next dev`: "This is NOT the Next.js you know … read `node_modules/next/dist/docs/`". Re-created on every `next dev`; commit it. | `/AGENTS.md` |
| `.gitignore` | ignores `/.next/`, `.env*`, `.vercel`, `next-env.d.ts`, `*.tsbuildinfo`. | `/.gitignore` |
| `src/proxy.ts` / `middleware.ts` | Do not exist yet. | `ls` |

Node/TS minimums for Next 16: Node.js >= 20.9, TypeScript >= 5.1; browsers Chrome/Edge/Firefox 111+, Safari 16.4+ (`02-guides/upgrading/version-16.md`).

---

## 1. `proxy.ts` (was `middleware.ts`) and Clerk

Source: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
`02-guides/upgrading/version-16.md` ("`middleware` to `proxy`"), Clerk docs (WebFetch of
`clerk.com/docs/reference/nextjs/clerk-middleware` and `/docs/nextjs/getting-started/quickstart`),
`node_modules/@clerk/nextjs/dist/types/server/*.d.ts`.

Facts (v16):
- File is `proxy.ts` at project root **or inside `src/`** (same level as `app`). For this repo: **`src/proxy.ts`**. `middleware.ts` / `export function middleware` are deprecated (still work, warn). Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- Export a named `proxy` function **or** a default export (Clerk uses default export). Signature `(request: NextRequest, event?: NextFetchEvent)`. Type shorthand: `import type { NextProxy } from 'next/server'`.
- **Runtime is Node.js and cannot be configured.** `export const runtime = 'edge'` in a proxy file throws. (v16 upgrade guide: "The `edge` runtime is NOT supported in `proxy`".)
- `export const config = { matcher: ... }` — string, array of strings, or objects `{ source, locale?, has?, missing? }`. Values must be constants (statically analysed). Without a matcher, proxy runs on every request including `_next/static`, `_next/image`, `public/` assets. `/_next/data` is always matched even if excluded.
- Config flags renamed: `skipMiddlewareUrlNormalize` -> `skipProxyUrlNormalize`.
- Server Functions are POSTs to the page route they are used on, so a matcher that excludes a path also skips proxy for server actions on that path. **Always re-check auth inside each Server Action / route handler / Convex function**, never rely on proxy alone (proxy.md "Good to know", and Clerk says the same).

Clerk 7.9.1 wiring (peer range `next: ^15.2.8 || … || ^16.0.10 || ^16.1.0-0` covers 16.3.4 — `node_modules/@clerk/nextjs/package.json`):

```ts
// src/proxy.ts  (verbatim from clerk.com/docs/reference/nextjs/clerk-middleware, Next 16+ naming)
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

- `clerkMiddleware` overloads (from `dist/types/server/clerkMiddleware.d.ts`): `clerkMiddleware()`, `clerkMiddleware(options)`, `clerkMiddleware((auth, request, event) => ..., options | (req) => options)`. The handler's `auth` is `AuthFn` with `auth.protect()`; the awaited auth object also has `redirectToSignIn()` / `redirectToSignUp()`. Options include `debug`, `contentSecurityPolicy`, `frontendApiProxy`, plus `AuthenticateRequestOptions` (e.g. `signInUrl`, `publishableKey`).
- Exports from `@clerk/nextjs/server` (`dist/types/server/index.d.ts`): `clerkMiddleware`, `createRouteMatcher`, `auth`, `currentUser`, `getAuth`, `clerkClient`, `createClerkClient`, `verifyToken`, `buildClerkProps`, `clerkFrontendApiProxy`, `createFrontendApiProxyHandlers`, webhook types.
- **`createRouteMatcher` is `@deprecated`** in 7.9.1 ("will be removed in the next major … Use resource-based auth checks instead … Move auth checks into each page, layout, API route, or Server Function") and logs a runtime warning. For FR-4 ("`/play`, `/game/[id]`, `/profile` protected") prefer `await auth.protect()` / `const { userId } = await auth(); if (!userId) redirect(...)` inside a route-group layout (e.g. `src/app/(protected)/layout.tsx`) and in every Server Action. If you still want a proxy-level gate, match manually inside the handler on `request.nextUrl.pathname` (no `createRouteMatcher`).
- `ClerkProvider` goes **inside `<body>`**, not around `<html>` (Clerk quickstart).
- Clerk's own `proxy.js` module (`dist/esm/server/proxy.js`) is the *Frontend-API proxy* (`clerkFrontendApiProxy`, `/__clerk/(.*)` route) — unrelated to the Next `proxy.ts` file name. Do not confuse them.

---

## 2. Async `params` / `searchParams`, typed helpers, route-type generation

Sources: `03-file-conventions/page.md`, `route.md`, `layout.md`, `05-config/02-typescript.md`,
`.next/types/routes.d.ts` (generated in this repo), `next-env.d.ts`,
`node_modules/next/dist/server/lib/router-utils/route-types-utils.js`.

- Since v15 `params` and `searchParams` are **Promises** in pages/layouts and `context.params` is a Promise in route handlers. Always `await`.
- Global helpers generated by `next dev` / `next build` / `next typegen` into `.next/types/routes.d.ts` (imported by `next-env.d.ts`; `.next/types/**/*.ts` and `.next/dev/types/**/*.ts` are in tsconfig `include`): **`PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>`** — available without import. `.next/types/validator.ts` type-checks that each page/layout default export has a compatible signature.
- "Generating route types" at scaffold time = this manifest. It does **not** by itself type `<Link href>`. `route-types-utils.js` line 311: `link.d.ts` is only written when `config.typedRoutes === true`. So: `PageProps/LayoutProps/RouteContext` always exist; **typed `href` requires adding `typedRoutes: true` to `next.config.ts`** (stable option; do not use `experimental.typedRoutes`). With it, literal hrefs in `next/link` and `router.push/replace/prefetch` are validated; non-literal strings need `as Route` (`import type { Route } from 'next'`).
- `next typegen` (CLI) regenerates types without a build: `pnpm next typegen && pnpm tsc --noEmit`. `next dev` writes to `.next/dev` (dev and build can run concurrently; a lockfile prevents two `next dev`s).

```tsx
// src/app/game/[id]/page.tsx
export default async function GamePage({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params
  // searchParams: Promise<Record<string, string | string[] | undefined>>
}

// src/app/profile/[username]/page.tsx
export default async function ProfilePage(props: PageProps<'/profile/[username]'>) {
  const { username } = await props.params
}

// route handler
import type { NextRequest } from 'next/server'
export async function GET(_req: NextRequest, ctx: RouteContext<'/api/games/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

Client components cannot `await`; read params with `useParams()` / `useSearchParams()` from `next/navigation` (wrap `useSearchParams` users in `<Suspense>` to avoid CSR bail-out).

---

## 3. Route handlers (`route.ts`)

Source: `03-file-conventions/route.md`, `01-getting-started/15-route-handlers.md`,
`02-route-segment-config/runtime.md`, `maxDuration.md`, `index.md`.

- File `route.ts|js`; export `GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`. A `route.ts` cannot sit in the same segment as a `page.tsx`.
- Not cached by default (since v15 GET is dynamic). Opt in with `export const dynamic = 'force-static'` (only when `cacheComponents` is off).
- Streaming: return `new Response(readableStream)`; the doc's LLM example still shows the long-removed `StreamingTextResponse` from an ancient AI SDK — **ignore it**; with `ai@7` use the AI SDK's own response helpers (see the AI SDK research doc).
- Segment config exports allowed in route.ts: `dynamic`, `dynamicParams`, `revalidate`, `fetchCache`, `runtime`, `preferredRegion` (deprecated), `maxDuration`.
  - `export const runtime = 'nodejs'` is the default; **`'edge'` is deprecated** ("Remove the `runtime` export"). Don't write it.
  - `export const maxDuration = 30` (seconds) — platform (Vercel) reads it from build output. Put it on the Eve/AI route (NFR-5 10 s timeout means ~15–30 s is plenty). For Server Actions, set `maxDuration` on the **page** that uses them.
  - With `cacheComponents: true`, `dynamic`, `dynamicParams`, `revalidate`, `fetchCache` are removed (index.md v16 row).
- `use cache` cannot be used directly in a route handler body; extract to a helper (15-route-handlers.md).

---

## 4. Server Actions / Server Functions

Source: `03-api-reference/01-directives/use-server.md`, `02-guides/server-actions.md`,
`01-getting-started/07-mutating-data.md`, `05-config/01-next-config-js/serverActions.md`,
`maxDuration.md`.

- `'use server'` at top of a file (e.g. `src/app/actions.ts`) makes every export a Server Function; or inline at the top of an `async function` inside a Server Component. Client components must import from a `'use server'` file.
- Invoked via `<form action={fn}>`, `useActionState`, or plain event handlers (`startTransition`). Return only serialisable data.
- Security: authenticate **inside** each action (`const { userId } = await auth()`), never trust client ids (matches FR-5). Proxy coverage can silently vanish (section 1).
- Config: `experimental.serverActions.bodySizeLimit` (default 1mb; accepts `'2mb'`), `allowedOrigins`.
- For this app most mutations go through Convex mutations from the client, so Server Actions are mainly for Eve/AI orchestration if not done as a route handler.

---

## 5. `next/dynamic` and `ssr: false` (R3F Canvas, 2D/3D board, Stockfish UI)

Source: `02-guides/lazy-loading.md`.

- `dynamic(() => import('./X'), { ssr: false, loading: () => <Skeleton/> })`.
- **`ssr: false` only works inside a Client Component.** Using it in a Server Component errors: "`ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component." Pattern:

```tsx
// src/components/board/board-loader.tsx
'use client'
import dynamic from 'next/dynamic'
export const Board3D = dynamic(() => import('./board-3d').then(m => m.Board3D), {
  ssr: false,
  loading: () => <div className="aspect-square animate-pulse rounded-xl bg-muted" />,
})
```
Then render `<Board3D />` from the server page. The `import()` path must be a literal, and `dynamic()` must be called at module top level (not inside render). Named exports: `.then(m => m.Named)`.
- For NFR-2a (preload 3D in the background) call `import('./board-3d')` in a `useEffect` after mount or use the same dynamic module; Turbopack code-splits it.

---

## 6. Metadata API

Source: `01-getting-started/14-metadata-and-og-images.md`, `04-functions/generate-metadata.md`.

- Static: `export const metadata: Metadata = { title: { default: '3D Chess', template: '%s · 3D Chess' }, description }` in layouts/pages (server files only).
- Dynamic: `export async function generateMetadata({ params }: PageProps<'/profile/[username]'>, parent: ResolvingMetadata): Promise<Metadata>` — `await params`. Streams since v15.2.
- `themeColor`, `colorScheme`, `viewport` inside `metadata` are **deprecated since v14** — use `export const viewport: Viewport = { themeColor: [...] }` (`import type { Viewport } from 'next'`).
- File conventions: `app/icon.png|svg`, `app/opengraph-image.tsx` (`ImageResponse` from `next/og`), `app/manifest.ts`, `robots.ts`, `sitemap.ts`. In v16 the `params` of icon/opengraph-image generators and `sitemap` `id` are async (upgrade guide).

---

## 7. `next.config.ts` options this app needs

Source: `05-config/01-next-config-js/{headers,images,reactCompiler,typedRoutes,transpilePackages,cacheComponents,turbopack,turbopackRustReactCompiler}.md`, `02-components/image.md`, `08-turbopack.md`, `config-shared.d.ts`.

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,          // already set; stable in 16; needs babel-plugin-react-compiler (installed 1.0.0)
  typedRoutes: true,            // OPTIONAL: turns on typed <Link href> (writes .next/types/link.d.ts)
  images: {
    remotePatterns: [new URL('https://img.clerk.com/**')],   // Clerk avatars; URL form is documented
    // or: [{ protocol: 'https', hostname: 'img.clerk.com', pathname: '/**' }]
  },
  async headers() {
    return [
      {
        // ONLY if you ship the multi-threaded Stockfish build (needs SharedArrayBuffer)
        source: '/stockfish/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
}
export default nextConfig
```

Notes:
- `headers()` entries: `{ source, headers: [{key,value}], has?, missing?, basePath?, locale? }`; checked before filesystem/`public`; later matches override earlier ones for the same key. **COOP/COEP must be on the HTML document that creates the worker (the `/game/[id]` page), not just the worker script**, for `SharedArrayBuffer` to exist — cross-origin isolation is a document property. That header on the game page will break any non-CORP third-party subresources (Clerk images, HDRIs from other origins) unless they send CORP/CORS headers; so default to the **single-threaded** Stockfish build and skip COOP/COEP (see section 8).
- `images.remotePatterns` accepts `URL` objects or `{protocol, hostname, port, pathname, search}`; omitted fields imply `**`. `images.domains` is deprecated in 16. `<img>` triggers `@next/next/no-img-element` (warn) — use `next/image` for Clerk avatars, or shadcn `AvatarImage` (plain `<img>` under Base UI; add an eslint-disable comment or accept the warning).
- `reactCompiler` accepts `true` or `{ compilationMode: 'annotation' }`; opt a component out with the `'use no memo'` directive (useful for R3F `useFrame` code that mutates refs each frame). Experimental faster path: `experimental.turbopackRustReactCompiler: true`.
- `transpilePackages: ['pkg']` — only for `node_modules` packages shipping raw TS/JSX; not needed for three/drei/fiber (they ship JS). Cannot combine with `serverExternalPackages` for the same package.
- **`webpack()` config is ignored under Turbopack** (default bundler in 16). Use `turbopack: { resolveAlias, resolveExtensions, rules }` if needed. `next dev --webpack` / `next build --webpack` opt out.
- `cacheComponents: true` enables `'use cache'`, `cacheLife`, `cacheTag` and PPR; requires Node runtime and removes `dynamic/revalidate/fetchCache` segment configs. **Not needed for v1** (all live data is Convex subscriptions). Leave it off unless a static landing/leaderboard shell is wanted later.
- `experimental.ppr`, `experimental_ppr`, `experimental.dynamicIO`, `experimental.useCache`, `next lint`, the `eslint` config key, AMP, and runtime config (`publicRuntimeConfig`) are removed in 16.

---

## 8. Web Workers under Turbopack (Stockfish)

Sources: `08-turbopack.md` (Magic Comments: "work with … `new Worker()` expressions"; config table `turbopackWorkerAssetPrefix`: "Custom asset prefix for Web Worker URLs (entrypoint + module chunks)"), context7 `/vercel/next.js` (e2e test `test/e2e/app-dir/worker/app/module/page.js`; runtime helper `turbopack-ecmascript/js/src/worker/browser/createWorker.ts`), `node_modules/stockfish/README.md` and `bin/`.

- Turbopack **does** bundle `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` from a `'use client'` component: the worker becomes its own chunk group. Gotcha: the runtime helper **strips `type: 'module'`** and loads worker chunks via `importScripts()`, so the worker entry is a classic script — top-level `import` statements are fine (bundled), but don't rely on ESM-only worker semantics (`import.meta.url` inside the worker, dynamic `import()` of non-bundled URLs).
- Installed `stockfish@18.0.8` ships in `node_modules/stockfish/bin/`:
  - `stockfish-18-lite-single.js` (21 KB) + `stockfish-18-lite-single.wasm` (7.3 MB) — **single-threaded lite, no COOP/COEP needed; the README's recommended default.**
  - `stockfish-18-lite.js` + `.wasm` (7.1 MB) — multi-threaded lite, **needs cross-origin isolation** (COOP/COEP).
  - `stockfish-18-single.*` / `stockfish-18.*` — full NNUE, ~113 MB each; not for the browser.
  - `stockfish-18-asm.js` — 10.5 MB asm.js fallback.
  - `index.js` is a Node loader (`initEngine(enginePath?, cb?)`); `bin/stockfish.js`/`.wasm` are tiny stubs.
- The `bin/*.js` files are already written to run **as the worker script itself** (they set `onmessage`, call `postMessage`, detect `importScripts`), and locate the `.wasm` from `self.location` (script URL) with an override via URL hash (`#<wasmUrl>,worker`). Simplest, Turbopack-proof approach: copy `stockfish-18-lite-single.js` + `.wasm` to `public/stockfish/` (postinstall or checked in) and `new Worker('/stockfish/stockfish-18-lite-single.js')` from a client module — no bundler involvement, satisfies NFR-3 (lazy, AI mode only). Note the 7.3 MB wasm exceeds the "under 2 MB gzipped" wish in NFR-3 — flag to the Stockfish agent.
- Use the multi-threaded build only if you accept COOP/COEP on the game page (section 7). `pnpm-workspace.yaml` already allows the `stockfish` build script.

---

## 9. CLI / dev server

Source: `03-api-reference/06-cli/next.md`, `version-16.md`.

- `next dev` (Turbopack default): `-p/--port`, `-H/--hostname`, `--experimental-https` (self-signed cert; handy for Clerk/webhooks), `--webpack` to opt out, `--turbopack`/`--turbo` (no-op, default). Output dir `.next/dev`.
- `next build`: `--webpack`, `--debug-build-paths="app/game/**/page.tsx"` to build a subset, `--debug-prerender`.
- `next typegen [dir]`, `next upgrade`, `next experimental-analyze` (bundle analyzer, port 4000), `next info`. **`next lint` is removed** — `pnpm lint` runs plain `eslint`.

---

## 10. ESLint 9 flat config — rules that will bite

Source: `05-config/03-eslint.md`, installed `eslint-config-next@16.3.4` (`dist/index.js` merges `eslint-plugin-react` recommended + `eslint-plugin-react-hooks@7.1.1` **`configs.recommended`** + `@next/eslint-plugin-next` recommended; `core-web-vitals.js` appends the plugin's `core-web-vitals` overrides), `typescript-eslint ^8.46`.

`react-hooks` 7.1.1 recommended (verified via `require('eslint-plugin-react-hooks').configs.recommended.rules`) enables the React-Compiler lint rules, all **error** unless noted:
`rules-of-hooks`, `exhaustive-deps` (warn), `static-components`, `use-memo`, `preserve-manual-memoization`, `incompatible-library` (warn), `immutability`, `globals`, `refs`, `set-state-in-effect`, `error-boundaries`, `purity`, `set-state-in-render`, `unsupported-syntax` (warn), `config`, `gating`.

Practical consequences for R3F/three/zustand code:
- `react-hooks/refs`: reading/writing `ref.current` during render is an error — do it in `useFrame`/effects/handlers.
- `react-hooks/immutability`: mutating props/state objects (e.g. `mesh.position.set` on an object from state during render) errors; mutate inside `useFrame`/effects.
- `react-hooks/set-state-in-effect`: calling `setState` synchronously in `useEffect` body errors — derive state or use event handlers / `useSyncExternalStore` / zustand selectors.
- `react-hooks/purity`: `Math.random()`/`Date.now()` during render errors.
- `@next/next/no-img-element` is **warn** (core-web-vitals list), `no-html-link-for-pages` and `no-sync-scripts` are **error**; `no-async-client-component` warn.
- `react-hooks/exhaustive-deps` is warn. Disable per line with `// eslint-disable-next-line react-hooks/<rule>`; per component opt out of the compiler with `'use no memo'`.

---

## 11. Tailwind v4 conventions in this scaffold

Source: `src/app/globals.css`, `01-getting-started/11-css.md`, tailwindcss docs (WebFetch `tailwindcss.com/docs/dark-mode`), `node_modules/shadcn/dist/tailwind.css`.

- Installed Tailwind **4.3.3** via `@tailwindcss/postcss` (no `tailwind.config.*`; `components.json` has `tailwind.config: ""`). CSS-first config.
- `globals.css` top: `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";`
  - `shadcn/tailwind.css` (package export `./tailwind.css` -> `dist/tailwind.css`) defines Base-UI-aware variants used by the generated components: `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-selected`, `data-disabled`, `data-active`, `data-horizontal`, `data-vertical`, plus `accordion-down/up` keyframes, `no-scrollbar` utility, scroll-fade properties. Keep this import.
  - `tw-animate-css` provides `animate-in/out`, `fade-in-0`, `zoom-in-95`, etc. used by dialog/sheet.
- Dark mode: `@custom-variant dark (&:is(.dark *));` — **class strategy** (Tailwind docs show `&:where(.dark, .dark *)`; the scaffold's `&:is(.dark *)` is equivalent for descendants). Toggle by putting `class="dark"` on `<html>`. `next-themes@0.4.6` is installed (pulled in by the sonner component): wrap the app in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>` from `next-themes` (props verified in `dist/index.d.ts`) and add `suppressHydrationWarning` to `<html>`. `useTheme()` is exported (used by `sonner.tsx`).
- Tokens: `@theme inline { --color-background: var(--background); … --radius-sm…4xl derived from --radius; --font-sans: var(--font-sans); --font-mono: var(--font-geist-mono); --font-heading: var(--font-sans) }`; `:root` and `.dark` define the oklch palette (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar*`, `--radius: 0.625rem`). Utilities: `bg-background`, `text-muted-foreground`, `border-border`, `rounded-lg` (= `--radius`), etc. Add app tokens (e.g. `--board-light`, `--board-dark`) the same way: define in `:root`/`.dark`, expose via `@theme inline { --color-board-light: var(--board-light) }`.
- `@layer base { * { @apply border-border outline-ring/50 } body { @apply bg-background text-foreground } html { @apply font-sans } }`.
- **Font wiring gotcha (observed, not yet fixed):** `layout.tsx` exposes `--font-geist-sans`, but `@theme inline` maps `--font-sans: var(--font-sans)` (self-reference) and `--font-heading: var(--font-sans)`; only `--font-mono` points at `--font-geist-mono`. Geist Sans is therefore probably not applied. Fix: change to `--font-sans: var(--font-geist-sans);` (or rename the font variable to `--font-sans` in `layout.tsx`).
- `cn()` comes from the `cn` package (`import { cn } from "cn"` inside ui files; `@/lib/utils` re-exports it). API: `cn(...inputs: ClassValue[])` = clsx-style args + tailwind-merge conflict resolution; also exports `twMerge`, `clsx`, `twJoin`, `createEngine` (`node_modules/cn/dist/index.d.ts`).

---

## 12. shadcn/ui as initialised here (Base UI, "base-nova")

Source: `components.json`, `node_modules/shadcn` (4.21.0, `dist/index.js add --help`, dry-run), `src/components/ui/*.tsx`, `node_modules/@base-ui/react` d.ts, shadcn docs (WebFetch `ui.shadcn.com/docs/components/base/button`, `/base/dialog`), Base UI handbook (WebFetch `base-ui.com/react/handbook/composition`).

- Preset: `style: "base-nova"` = **Base UI primitives (`@base-ui/react` 1.8.0), not Radix**. Every component imports `@base-ui/react/<part>` (e.g. `@base-ui/react/dialog`, `/menu`, `/select`, `/tabs`, `/tooltip`, `/slider`, `/switch`, `/toggle-group`, `/radio-group`, `/scroll-area`, `/progress`, `/avatar`, `/popover`, `/alert-dialog`, `/drawer`, `/input`, `/separator`, `/button`, `/merge-props`, `/use-render`). Sheet is built on `@base-ui/react/dialog`; Drawer on `@base-ui/react/drawer` (no `vaul`). No Radix packages are installed — do not paste Radix-era shadcn snippets.
- Add command (CLI 4.21.0): `pnpm dlx shadcn@latest add <items...>`; flags `-y/--yes`, `-o/--overwrite`, `-c/--cwd`, `-a/--all`, `-p/--path`, `-s/--silent`, `--dry-run`, `--diff [path]`, `--view [path]`. Dry-run of the full list `button card dialog alert-dialog drawer sheet tabs table badge avatar select slider switch toggle toggle-group tooltip dropdown-menu input label separator scroll-area skeleton sonner progress popover radio-group` resolved to 26 files (all already present, "skip (identical)") and 4 npm deps: `cn`, `@base-ui/react`, `sonner`, `next-themes` — **all four are already in `package.json`**. Nothing else to install for these components. Other candidates if needed later: `command`, `accordion`, `checkbox`, `textarea`, `form`/`field`, `sidebar`, `chart` (chart pulls `recharts`).
- Exports available (verified from the files):
  - `button`: `Button`, `buttonVariants`; variants `default | outline | secondary | ghost | destructive | link`; sizes `default | xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`. Props = `ButtonPrimitive.Props & VariantProps`.
  - `dialog`: `Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent (prop showCloseButton?: boolean, default true), DialogHeader, DialogFooter, DialogTitle, DialogDescription`.
  - `alert-dialog`: `AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogMedia, AlertDialogAction, AlertDialogCancel`.
  - `sheet`: `Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription`.
  - `drawer`: `Drawer, DrawerPortal, DrawerOverlay, DrawerSwipeHandle, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription` (use for NFR-6 mobile history panel).
  - `dropdown-menu`: `DropdownMenu, DropdownMenuPortal, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent`.
  - `select`: `Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton`.
  - `tabs`: `Tabs, TabsList (variant default|line), TabsTrigger, TabsContent, tabsListVariants`. `tooltip`: `TooltipProvider, Tooltip, TooltipTrigger, TooltipContent (side, sideOffset, align, alignOffset)`. `popover`: `Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription`.
  - `card`: `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter`. `table`: `Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption`. `avatar`: `Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge`. `progress`: `Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue`.
  - Singles: `Badge, badgeVariants`, `Input`, `Label`, `Separator`, `Skeleton`, `Slider`, `Switch`, `Toggle, toggleVariants`, `ToggleGroup, ToggleGroupItem`, `RadioGroup, RadioGroupItem`, `ScrollArea, ScrollBar`, `Toaster` (sonner).
- **Base UI API differences vs Radix (verified in `@base-ui/react` d.ts):**
  - No `asChild`. Composition uses the **`render` prop**: `render={<Link href="/play" />}` or `render={(props, state) => <span {...props}/>}`; the custom component must forward `ref` and spread props. For a trigger that should look like a button: `<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>`. shadcn's Button page explicitly says **do not** do `<Button render={<a />} nativeButton={false} />` for links — use `<Link className={buttonVariants({ variant })} href="…">` instead.
  - Change handlers receive `(value, eventDetails)`: `Dialog onOpenChange(open: boolean, details)`, `Select onValueChange(value, details)` (plus `items`, `multiple`), `Tabs onValueChange(value, details)`, `Slider onValueChange(value | number[], details)` and `onValueCommitted`, `Switch onCheckedChange(checked, details)`, `ToggleGroup value: readonly Value[]`, `onValueChange(groupValue: Value[], details)`, `multiple?: boolean`. Radix names like `onCheckedChange` match; `Select`'s `SelectValue` renders the selected item; `Slider` `value` may be a number or array (shadcn wrapper renders one thumb per value).
  - State attributes are `data-open`/`data-closed`/`data-checked`/… (hence `shadcn/tailwind.css` variants), not only `data-state="open"`.
  - `TooltipProvider` accepts `delay` (default 0 in the wrapper).
- Sonner: put `<Toaster />` (from `@/components/ui/sonner`, a `'use client'` file that reads `useTheme()` from `next-themes`) once in `src/app/layout.tsx` inside `<body>`; fire toasts anywhere with `import { toast } from 'sonner'` — `toast('msg')`, `toast.success/error/info/warning/loading/promise(...)` (sonner 2.0.8 exports `Toaster, toast, useSonner`). Because `sonner.tsx` calls `useTheme()`, wrap with next-themes' `ThemeProvider` or the theme will just be `"system"`.
- `"use client"` is already at the top of the interactive ui files; server pages can import and render them directly.

---

## 13. Suggested routing skeleton (from requirements §6, all App Router)

```
src/app/layout.tsx                 ClerkProvider inside <body>, ThemeProvider, <Toaster/>
src/app/page.tsx                   / landing (public)
src/app/leaderboard/page.tsx       public
src/app/sign-in/[[...sign-in]]/page.tsx, src/app/sign-up/[[...sign-up]]/page.tsx  (Clerk catch-all convention — verify in Clerk doc)
src/app/(protected)/layout.tsx     await auth.protect()  -> covers /play, /settings, /game/[id], /profile/[username]
src/app/(protected)/play/page.tsx
src/app/(protected)/settings/page.tsx
src/app/(protected)/game/[id]/page.tsx        PageProps<'/game/[id]'>
src/app/(protected)/profile/[username]/page.tsx
src/app/api/ai/move/route.ts       Eve route handler, export const maxDuration = 30
src/proxy.ts                       clerkMiddleware() + matcher (section 1)
public/stockfish/…                 worker + wasm (section 8)
```
Route groups `(protected)` don't affect URLs. Parallel-route slots (`@modal`) now **require `default.tsx`** or the build fails (v16 upgrade guide).

---

## Unverified / open questions

1. Whether cross-origin isolation (COOP/COEP) breaks Clerk's hosted assets/iframes on the game page was not tested — reason to stay on the single-threaded Stockfish build. The COOP/COEP-on-document requirement is standard web-platform behaviour, not from the Next docs.
2. ~~Turbopack worker bundling was verified via context7, not by running a build in this repo.~~ **RESOLVED** - built and run in this repo (dev + `next build`/`next start`). `new Worker(new URL('./x.worker.ts', import.meta.url))` bundles and round-trips; see "Verified build smoke test" §4a at the end of this file. Note §4b: Turbopack passes the worker chunk list in the URL **hash**, which collides with the Stockfish glue - keep the engine as a classic `/public` worker.
3. The `--font-sans: var(--font-sans)` self-reference in `globals.css` looks like a shadcn-init artefact; I did not render the page to confirm Geist is missing. Fix is one line either way.
4. Clerk sign-in/sign-up catch-all folder naming (`[[...sign-in]]`) and `auth.protect()` in a layout are Clerk-doc conventions to be confirmed by the Clerk research doc; only `clerkMiddleware`, `auth`, `createRouteMatcher` deprecation and the proxy matcher were verified here.
5. `typedRoutes: true` was not enabled/run in this repo; the behaviour (writes `.next/types/link.d.ts`) is from Next source `route-types-utils.js`, the `as Route` cast requirement from `02-typescript.md`.
6. The exact `@next/eslint-plugin-next` rule `no-location-assign-relative-destination` (present in the installed core-web-vitals set) is not in the bundled docs table; treat as a warn-level rule.
7. `next-themes` `ThemeProvider` export name was inferred from its d.ts props block (`attribute`, `defaultTheme`, `enableSystem`, `disableTransitionOnChange`) and sonner's `useTheme` import; the component name itself was not grepped.

---

## 14. Charts for FR-53 (rating history sparkline + rating chart)

FR-53: "Player profile page: rating history sparkline, recent games with results, and links to replay each game."
Route `/profile/[username]` — "Stats, rating chart, game history" (requirements §6).
Data source is the `ratingHistory` table: `{ playerId, gameId, before, after, createdAt }` (requirements §4). So a chart series is
`ratingHistory.map(r => ({ t: r.createdAt, rating: r.after }))` sorted ascending by `createdAt`.

### 14.1 What `shadcn add chart` actually resolves (verified)

Verified by running in the repo root:

```
pnpm dlx shadcn@latest add chart --dry-run
```

Output (shadcn CLI 4.21.0, style `base-nova`, registry `https://ui.shadcn.com/r/styles/base-nova/`):

```
├ Files (2) +1 new, =1 skip
│ = src/components/ui/card.tsx   skip (identical)
│ + src/components/ui/chart.tsx  create
│
├ Dependencies (2)
│ + cn
│ + recharts@3.8.0
```

- Only **one** new file: `src/components/ui/chart.tsx` (373 lines). `card.tsx` is already present and identical, so it is skipped.
- npm deps added: `cn` (already in package.json at ^0.2.6) and **`recharts@3.8.0`**. `recharts` is currently NOT in package.json — you must run the add (without `--dry-run`) or `pnpm add recharts@3.8.0`.
- `chart.tsx` starts with `"use client"` and imports `cn` from the **`cn` package**, not `@/lib/utils` (this scaffold's `src/lib/utils.ts` is just `export { cn } from "cn"`). Do not "fix" that import.

### 14.2 recharts 3.8.0 vs React 19.2 (verified against the published package)

`npm view recharts@3.8.0 peerDependencies` and the tarball's `package/package.json`:

```json
"peerDependencies": {
  "react":     "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
  "react-dom": "^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0",
  "react-is":  "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
}
```

There is **no `peerDependenciesMeta`**, so all three are *required* peers. **React 19 is explicitly supported** — recharts 3.x is React-19-clean; recharts 2.x is the version that had the React 19 peer problem. Use 3.8.0.

Gotchas verified:

1. **`react-is` is a hard peer and is NOT currently in `node_modules`** (checked: `node_modules/react-is` does not exist). This repo has no `.npmrc`, so it relies on pnpm's default `auto-install-peers` (true on pnpm 8+; this repo pins `pnpm@11.24.0`). `pnpm config get auto-install-peers` returned `undefined` (unset → default). If you get an unmet-peer warning or a `Cannot find module 'react-is'` at runtime, fix with `pnpm add react-is`.
2. **recharts 3 is a heavy dependency.** Its `dependencies` (from the published package.json) are:
   `@reduxjs/toolkit ^1.9.0 || 2.x.x`, `react-redux 8.x.x || 9.x.x`, `immer ^10.1.1`, `reselect 5.1.1`, `es-toolkit ^1.39.3`, `victory-vendor ^37.0.2` (the d3-scale/d3-shape bundle), `decimal.js-light`, `eventemitter3`, `tiny-invariant`, `clsx`, `use-sync-external-store`.
   recharts 3 moved its internal state to a Redux store — that is why `react-redux` and `@reduxjs/toolkit` come along. `react-redux@9` peers are `react: "^18.0 || ^19"` (verified via `npm view react-redux@9 peerDependencies`), so React 19 is fine, but this is roughly 150–200 kB of client JS on the profile route.
   **Recommendation for this project:** use the hand-rolled SVG sparkline in §14.5 for the small FR-53 sparkline (zero deps, renders in an RSC), and only pull recharts in for the full interactive "rating chart" on `/profile/[username]` — behind `next/dynamic` so it never lands in the shared bundle. If you want a lean build, §14.5 alone can satisfy both, and you can skip recharts entirely.

### 14.3 Exact exports of the generated `src/components/ui/chart.tsx` (verified via `--dry-run --view`)

```ts
// value exports
export { ChartContainer, ChartTooltip, ChartTooltipContent,
         ChartLegend, ChartLegendContent, ChartStyle }
// type export
export type ChartConfig
```

Note what is **not** exported: `useChart`, `ChartLegendContent`'s internals, and `getPayloadConfigFromPayload` are module-private. `ChartTooltip` and `ChartLegend` are **re-exports of recharts primitives** (`RechartsPrimitive.Tooltip` / `RechartsPrimitive.Legend`), not wrappers.

Exact signatures:

```ts
export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; icon?: React.ComponentType } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<"light" | "dark", string> }
  )
>

function ChartContainer(props: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  initialDimension?: { width: number; height: number }   // default { width: 320, height: 200 }
})

function ChartTooltipContent(props:
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean          // default false
    hideIndicator?: boolean      // default false
    indicator?: "line" | "dot" | "dashed"   // default "dot"
    nameKey?: string
    labelKey?: string
  } & Omit<RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, number | string>, "accessibilityLayer">)

function ChartLegendContent(props:
  React.ComponentProps<"div"> & { hideIcon?: boolean; nameKey?: string }
  & RechartsPrimitive.DefaultLegendContentProps)   // verticalAlign defaults to "bottom"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => …
```

Version-specific details worth knowing (these are recharts-3-only APIs; do NOT copy a recharts-2 chart.tsx over this file):

- `chart.tsx` imports `import type { TooltipValueType } from "recharts"` and uses `RechartsPrimitive.DefaultTooltipContentProps` / `DefaultLegendContentProps`. All three exist in recharts 3.8.0 — verified in the tarball's `types/index.d.ts`:
  `export type { Props as DefaultLegendContentProps, LegendPayload } from './component/DefaultLegendContent'` and
  `export type { Props as DefaultTooltipContentProps, …, ValueType as TooltipValueType, … } from './component/DefaultTooltipContent'`.
- `ChartContainer` passes `initialDimension` to `<ResponsiveContainer>`. That prop exists in recharts 3.8.0 (`types/component/ResponsiveContainer.d.ts:34`, documented default `{ width: -1, height: -1 }`) and prevents the 0-width flash on first paint. shadcn overrides the default to `{ width: 320, height: 200 }`.
- `ChartContainer` renders a `<div class="flex aspect-video justify-center …">`. **`aspect-video` is the default sizing** — for a sparkline you must override `className` (e.g. `className="aspect-auto h-10 w-32"`).
- `ChartStyle` emits `--color-<key>` CSS variables scoped to `[data-chart=chart-…]`, and mirrors them under a `.dark` selector when you use the `theme` form of `ChartConfig`. Consume them as `stroke="var(--color-rating)"`.
- Dark mode here is keyed off the literal `.dark` class (`const THEMES = { light: "", dark: ".dark" }`), which matches `next-themes` with `attribute="class"` as configured in this scaffold (§12).

### 14.4 Minimal verified LineChart (full rating chart) and a recharts sparkline

```tsx
"use client"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  rating: { label: "Rating", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RatingChart({
  data,
}: { data: { createdAt: number; after: number }[] }) {
  const points = data.map((d) => ({
    date: new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    rating: d.after,
  }))

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      <LineChart data={points} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis width={40} tickLine={false} axisLine={false} domain={["dataMin - 40", "dataMax + 40"]} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Line
          dataKey="rating"
          type="monotone"
          stroke="var(--color-rating)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
```

Prop names above are verified against recharts 3.8.0's own types: `Line` accepts `dot` (`DotType`: `false | true | object | ReactElement | function`), `activeDot`, `isAnimationActive?: boolean | 'auto'`, `type`, `dataKey`, `strokeWidth` (`types/cartesian/Line.d.ts`). `ChartContainer` requires exactly one recharts chart element as `children` (it is `ResponsiveContainer`'s `children` type).

Tiny recharts sparkline (if you must use recharts for it):

```tsx
<ChartContainer config={chartConfig} className="aspect-auto h-10 w-32">
  <LineChart data={points} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
    <Line dataKey="rating" type="monotone" stroke="var(--color-rating)"
          strokeWidth={1.5} dot={false} isAnimationActive={false} />
  </LineChart>
</ChartContainer>
```

Next.js note: `chart.tsx` is `"use client"`. `ResponsiveContainer` measures the DOM, so the chart body only appears after hydration. On the profile page either accept that, or lazy-load: `const RatingChart = dynamic(() => import("./rating-chart"), { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> })` (see §5 for `next/dynamic` in this repo).

### 14.5 Zero-dependency fallback: hand-rolled inline SVG polyline sparkline

Works in a Server Component, no hydration, no recharts. This is the recommended implementation for the FR-53 *sparkline* regardless of whether you also install recharts.

**Path-building math.** Given values `v[0..n-1]`, viewBox `W × H`, and padding `p` (half the stroke width plus a hair, so the line never clips):

```
xStep = n > 1 ? (W - 2p) / (n - 1) : 0
x_i   = n > 1 ? p + i * xStep : W / 2

min = Math.min(...v), max = Math.max(...v), span = max - min
y_i = span === 0 ? H / 2 : p + (1 - (v_i - min) / span) * (H - 2p)
```

`y` is inverted because SVG's y-axis grows downward, so the *highest* rating must map to the *smallest* y. Both degenerate cases must be guarded: `n === 1` (divide by `n-1 = 0`) and `span === 0` (a flat rating history — every game a draw against an equal — divides by zero and yields `NaN` in the `points` string, which silently renders nothing).

```tsx
// src/components/rating-sparkline.tsx — no "use client" needed
export function RatingSparkline({
  values,
  width = 120,
  height = 32,
  strokeWidth = 1.5,
  className,
}: {
  values: number[]
  width?: number
  height?: number
  strokeWidth?: number
  className?: string
}) {
  if (values.length === 0) return null

  const p = strokeWidth          // padding, keeps the stroke inside the viewBox
  const n = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const pts = values.map((v, i) => {
    const x = n > 1 ? p + (i * (width - 2 * p)) / (n - 1) : width / 2
    const y = span === 0 ? height / 2 : p + (1 - (v - min) / span) * (height - 2 * p)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const last = values[n - 1]
  const first = values[0]
  const trendClass = last > first ? "text-emerald-500" : last < first ? "text-rose-500" : "text-muted-foreground"
  const [lastX, lastY] = pts[n - 1].split(",")

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn(trendClass, className)}
      role="img"
      aria-label={`Rating history, ${first} to ${last}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth * 1.4} fill="currentColor" />
    </svg>
  )
}
```

Notes on the SVG attributes above (all standard SVG 1.1/2, not library-specific):

- `preserveAspectRatio="none"` lets the sparkline stretch to whatever CSS width you give it (e.g. `className="w-full"`); combine it with `vectorEffect="non-scaling-stroke"` so the stroke stays a constant visual width instead of being stretched into a wedge. If you keep a fixed `width`/`height`, you can drop both.
- `stroke="currentColor"` + a Tailwind `text-*` class is what makes it theme-aware in both light and dark; do not hardcode a hex.
- `role="img"` + `aria-label` covers NFR-7 (accessibility) — a bare `<svg>` is announced as nothing useful.
- For a filled area under the line, add a second element:
  `<polygon points={`${p},${height} ${pts.join(" ")} ${width - p},${height}`} fill="currentColor" fillOpacity={0.12} />` before the polyline.

Downsample before rendering if `ratingHistory` is long: taking every k-th point where `k = Math.ceil(n / 60)` keeps the SVG string small; a sparkline cannot resolve more than ~60 points at 120 px wide anyway.

---

## 15. Colour input for FR-21j (background / light square / dark square)

FR-21j: "Custom colour mode: pick a solid background colour and board light/dark square colours with a colour picker. **Live preview as you drag.**"
Persisted to `players.roomColors` (FR-21l).

### 15.1 There is no ready-made colour picker available (verified — both dead ends)

**Base UI 1.8.0 ships no colour picker.** `ls node_modules/@base-ui/react` gives the full list of parts:
`accordion, alert-dialog, autocomplete, avatar, button, checkbox, checkbox-group, collapsible, combobox, context-menu, csp-provider, dialog, direction-provider, drawer, field, fieldset, form, input, menu, menubar, merge-props, meter, navigation-menu, number-field, otp-field, popover, preview-card, progress, radio, radio-group, scroll-area, select, separator, slider, switch, tabs, toast, toggle, toggle-group, toolbar, tooltip, unstable-use-media-query, use-render`.
Grepping that listing for `color`/`picker` returns **nothing**. There is no `ColorPicker` primitive to wrap.

**The shadcn registry has no `color-picker` item for this style.** Verified:

```
$ pnpm dlx shadcn@latest view color-picker
Message: The item at https://ui.shadcn.com/r/styles/base-nova/color-picker.json was not found.

$ pnpm dlx shadcn@latest search @shadcn -q color
Found 4 items matching "color" in @shadcn
- @shadcn/login-03 (block) — A login page with a muted background color.
- @shadcn/signup-03 (block) …
- @shadcn/login-02 (block) …
- @shadcn/signup-02 (block) …
```

(Also note the CLI syntax: `shadcn search` now requires a registry namespace starting with `@` — `shadcn search color` errors with `Invalid registry namespace: "color"`. The query goes in `-q` / `--query`.)

**Conclusion: build it yourself, zero new dependencies.** Two composable pieces below; ship §15.2 first, add §15.3 only if the design needs an in-page (non-OS) picker.

### 15.2 Native `<input type="color">` — the event that makes "live preview as you drag" work

Verified against MDN (`developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/color`):

- **`input` fires continuously while the user drags in the picker widget**: "`input` is fired on the `<input>` element every time the color changes."
- **`change` fires only when the picker is dismissed**: "The `change` event is fired when the user dismisses the color picker."

So `change` is the *wrong* event for FR-21j. **This is the single most important gotcha in this section.**

And verified against the React docs (`react.dev/reference/react-dom/components/input`): React's `onChange` is **not** the DOM `change` event —

> "Fires immediately when the input's value is changed by the user (for example, it fires on every keystroke). **Behaves like the browser `input` event.**"

and `onInput` "Fires immediately when the value is changed by the user. For historical reasons, in React it is idiomatic to use `onChange` instead which works similarly."

**Therefore: in React, `onChange` on `<input type="color">` already gives you live-while-dragging updates.** You do not need `onInput`, and you must NOT reach for a native `addEventListener("change", …)` thinking it is the same thing.

Value format (MDN): the default value is `#000000` if `value` is omitted or invalid. Modern browsers accept any CSS colour format including `oklab(… / 0.5)`, plus optional `alpha` and `colorspace` (`"limited-srgb"` default, or `"display-p3"`) attributes — **but do not rely on those for this project**: keep the stored value a plain 7-char `#rrggbb` hex, which is what every browser round-trips and what THREE.js `new THREE.Color(hex)` / `Color.set(hex)` accepts directly. Validate with `zod`: `z.string().regex(/^#[0-9a-f]{6}$/i)`.

```tsx
"use client"
import { Label } from "@/components/ui/label"

export function ColorField({
  id, label, value, onChange, onCommit,
}: {
  id: string
  label: string
  value: string                       // "#rrggbb"
  onChange: (hex: string) => void     // fires on every drag tick -> live 3D preview
  onCommit: (hex: string) => void     // fires once -> persist to Convex
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}   // React onChange === DOM "input"
        onBlur={(e) => onCommit(e.currentTarget.value)}
        className="size-8 cursor-pointer rounded-md border border-input bg-transparent p-0.5
                   [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0
                   [&::-webkit-color-swatch-wrapper]:p-0
                   [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0"
      />
      <Label htmlFor={id} className="flex-1">{label}</Label>
      <code className="text-xs text-muted-foreground tabular-nums uppercase">{value}</code>
    </div>
  )
}
```

Pattern for FR-21j + FR-21l: drive the R3F scene from a **local/zustand** colour value on every `onChange` (instant, 60 fps, no network), and write to Convex only on commit. `zustand` 5.0.15 is already installed and is the right home for the transient value. Debounce or fire the Convex mutation on `onBlur` / on drawer close — **never on every `onChange`**, or you will fire a mutation per drag tick.

Cross-browser caveats (behavioural, not verified per-browser here — see open questions): the "dismiss" moment differs (Safari/Firefox open a modal panel, Chrome an inline popup), so `change`-vs-`blur` timing varies; `onBlur` is the more reliable commit signal. `<input type="color">` also cannot be styled beyond the swatch box, and its picker UI is the OS one — if the design requires a themed in-page picker, use §15.3.

### 15.3 HSL slider composition using the installed shadcn `Slider` (Base UI)

The repo already has `src/components/ui/slider.tsx` wrapping `@base-ui/react/slider`. Its exported component `Slider` takes `SliderPrimitive.Root.Props` directly and spreads `...props`, so all Base UI Root props pass through. Note it hardcodes `thumbAlignment="edge"` and renders one `Thumb` per value.

Verified signatures from `node_modules/@base-ui/react/slider/root/SliderRoot.d.ts` — **this is the Base UI signature, not Radix's**:

```ts
onValueChange?: (
  value: Value extends number ? number : Value,
  eventDetails: SliderRoot.ChangeEventDetails
) => void

onValueCommitted?: (
  value: Value extends number ? number : Value,
  eventDetails: SliderRoot.CommitEventDetails
) => void
```

Key differences from Radix (which is what most shadcn snippets on the web assume):

1. **The callback takes a second `eventDetails` argument.** Radix's is `(value: number[]) => void`.
2. **The value is `number` when you pass a scalar `value`/`defaultValue`, and `readonly number[]` only when you pass an array.** Radix always gives you an array. For a single H/S/L slider, pass `value={h}` and you receive a plain `number`.
3. Radix calls the commit callback `onValueCommit`; **Base UI calls it `onValueCommitted`** (past tense, extra `d`). Getting this wrong fails silently — it just becomes an unknown DOM prop.
4. `eventDetails.reason` tells you what caused it. Verified union (`SliderRootChangeEventReason`): `'input-change' | 'track-press' | 'drag' | 'keyboard' | 'none'`. The doc comment says `'drag'` fires **while dragging a thumb** — so `onValueChange` is your live-preview hook and `reason === "drag"` distinguishes a drag tick from a keyboard step.
5. `onValueCommitted` "Does not fire if the value did not change, or if the change was canceled" — exactly the Convex-write trigger you want.

Other Root props confirmed present: `value`, `defaultValue`, `min` (default 0), `max` (default 100), `step`, `orientation`, `disabled`.

```tsx
"use client"
import * as React from "react"
import { Slider } from "@/components/ui/slider"
import type { SliderRoot } from "@base-ui/react/slider"

// h 0-360, s 0-100, l 0-100  ->  "#rrggbb"
function hslToHex(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function HslPicker({
  onPreview, onCommit,
}: { onPreview: (hex: string) => void; onCommit: (hex: string) => void }) {
  const [hsl, setHsl] = React.useState<[number, number, number]>([210, 60, 50])

  const set = (i: 0 | 1 | 2) => (v: number, _d: SliderRoot.ChangeEventDetails) => {
    const next = [...hsl] as [number, number, number]
    next[i] = v
    setHsl(next)
    onPreview(hslToHex(...next))     // every drag tick -> live 3D preview
  }
  const commit = () => onCommit(hslToHex(...hsl))

  return (
    <div className="space-y-4">
      <Slider value={hsl[0]} min={0} max={360} step={1}
              onValueChange={set(0)} onValueCommitted={commit}
              className="[&_[data-slot=slider-track]]:bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]
                         [&_[data-slot=slider-range]]:bg-transparent" />
      <Slider value={hsl[1]} min={0} max={100} step={1}
              onValueChange={set(1)} onValueCommitted={commit} />
      <Slider value={hsl[2]} min={0} max={100} step={1}
              onValueChange={set(2)} onValueCommitted={commit} />
      <div className="h-8 rounded-md border" style={{ background: hslToHex(...hsl) }} />
    </div>
  )
}
```

The `data-slot` attributes used in the gradient selectors (`slider-track`, `slider-range`, `slider-thumb`) are the ones actually emitted by this repo's `src/components/ui/slider.tsx`.

Simplest shipping recommendation for FR-21j: three `ColorField`s (§15.2) in the settings drawer — background, light square, dark square — each wired to a zustand store that the R3F materials read, with a single Convex `updateRoomColors` mutation fired on drawer close. That satisfies "live preview as you drag" with **zero new dependencies** and zero cross-browser picker-UI risk.

---

## Unverified / open questions (sections 14–15)

1. `recharts@3.8.0` was **not installed** into this repo — the dry-run and the published tarball were inspected instead. The generated `chart.tsx` was read via `shadcn add chart --dry-run --view`, and every recharts type it references (`TooltipValueType`, `DefaultTooltipContentProps`, `DefaultLegendContentProps`, `ResponsiveContainer.initialDimension`) was confirmed present in `recharts-3.8.0.tgz`'s `types/`. It still has not been type-checked against React 19.2's `@types/react`; run `pnpm add recharts@3.8.0 && pnpm exec tsc --noEmit` before committing to it.
2. Whether pnpm 11.24.0 auto-installs the `react-is` peer in this repo was not proven — `pnpm config get auto-install-peers` returned `undefined` (i.e. the default). If a `Cannot find module 'react-is'` appears, `pnpm add react-is`.
3. The 150–200 kB bundle estimate for recharts 3 is an inference from its dependency list, not a measured `@next/bundle-analyzer` figure.
4. `<input type="color">` `input`-vs-`change` semantics are from MDN's spec-level description; the *exact* moment each browser considers the picker "dismissed" (and therefore when React's `onBlur` fires) was not tested in Chrome/Safari/Firefox. Use `onBlur` + drawer-close as the commit signal rather than depending on it.
5. The `::-webkit-color-swatch` / `::-moz-color-swatch` Tailwind arbitrary-variant styling of the swatch was not rendered; those pseudo-elements are standard but the exact Tailwind v4 arbitrary-variant syntax should be eyeballed once in the browser.
6. `hslToHex` above is standard maths, not copied from a verified source — unit-test it against a couple of known values before shipping.
7. Base UI's `Slider` `onValueChange` firing rate during a drag (every pointermove vs. every step change) was read from the type's doc comments, not measured. If the 3D preview stutters, throttle with `requestAnimationFrame`.
8. Whether a third-party colour picker exists in some *other* shadcn-compatible registry (e.g. `@originui`, `@kibo`) was not searched — only `@shadcn` and the `base-nova` style were checked.

---

# Verified build smoke test (three + postprocessing + worker + wasm)

**Status: run empirically in THIS repo on 2026-09-09.** Next.js 16.3.4 (Turbopack), React 19.2.8, pnpm 11.24.0,
Node (repo default), macOS 25.6.0, Apple M5 Max (GPU string `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)`).
Everything below is an observation from a real `pnpm dev` / `pnpm build` / `pnpm start` run plus a real browser
session against those servers - not from docs. It settles the open questions flagged in `r3f-drei.md`,
`postprocessing.md`, `stockfish.md` and item 2 of this file's own Unverified list.

## 0. TL;DR - the answers

| Question | Answer |
|---|---|
| `transpilePackages: ['three']` needed for `three/examples/jsm/*`? | **No.** Direct `three/examples/jsm/geometries/RoundedBoxGeometry.js` import compiles and runs in dev and build with zero config. |
| `transpilePackages` needed for `three-stdlib` (via drei)? | **No** for drei's internal use. But you **cannot import `three-stdlib` from app code** - see §5. |
| `transpilePackages` needed for `postprocessing` 6.39.4 / `n8ao` 2.0.1 (pure ESM, `type: module`)? | **No.** Both load in the browser bundle *and* during the Node prerender with zero config. |
| Does `next dev` serve `/public/**/*.wasm` as `application/wasm`? | **Yes.** Verified header. |
| Does `next build && next start` serve it as `application/wasm`? | **Yes.** Verified header. |
| Does `new Worker(new URL('./x.worker.ts', import.meta.url))` bundle under Turbopack? | **Yes**, in dev *and* in `next build` - emits `.next/static/chunks/turbopack-worker-<hash>.js`. But see the `#params=` gotcha in §4 - it is still the **wrong** vehicle for the Stockfish glue. |
| `serverExternalPackages` needed? | **No** - nothing in the 3D/engine client path is server-imported. |
| Any `'use client'` / RSC errors? | **None.** |
| Anything that actually *broke* the build? | **One thing: the missing `@types/three` devDependency.** See §2. |

**Net next.config.ts change required for the 3D + engine path: nothing.** The only config added is an optional
`headers()` block for cache-control on the copied engine files. Final file in §7.

## 1. The harness (kept in the repo - delete when no longer useful)

- `/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/app/smoke/page.tsx` - `"use client"` page:
  `<Canvas>` with `Environment preset="city"`, `MeshReflectorMaterial`, `OrbitControls`, and
  `<EffectComposer enableNormalPass multisampling={0}>` + `<N8AO halfRes>` + `<Bloom mipmapBlur>` +
  `<ToneMapping mode={ToneMappingMode.ACES_FILMIC}>`; plus both worker probes.
- `/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/app/smoke/echo.worker.ts` - trivial TS worker
  used only to prove Turbopack's `new URL(..., import.meta.url)` worker bundling.
- `/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/public/stockfish/` - `stockfish-18-lite-single.js`
  (21 KB), `stockfish-18-lite-single.wasm` (7,295,411 B), `LICENSE-GPL-3.0.txt` (copied from
  `node_modules/stockfish/Copying.txt` - GPLv3 compliance, keep it).

Copy commands used (exactly as `stockfish.md` §3.1 prescribes):

```bash
mkdir -p public/stockfish
cp node_modules/stockfish/bin/stockfish-18-lite-single.js   public/stockfish/
cp node_modules/stockfish/bin/stockfish-18-lite-single.wasm public/stockfish/
cp node_modules/stockfish/Copying.txt public/stockfish/LICENSE-GPL-3.0.txt
```

To re-run the harness: `pnpm dev`, open `/smoke`, and read the on-page log (top-left) - it prints
`BUNDLED_WORKER_OK echo:ping`, `STOCKFISH_UCIOK <ms>`, `STOCKFISH_BESTMOVE E2E4 PONDER E7E6`.

## 2. The one required change: `@types/three` must be a devDependency

`next build` runs `tsc` after Turbopack compiles. With three 0.185.1 (which ships **no** `types` field) and pnpm's
strict `node_modules`, `@types/three` is only a *transitive* dep of drei/fiber and is therefore **not resolvable**.
Observed failure on the very first build:

```
✓ Compiled successfully in 4.6s
  Running TypeScript ...
src/app/smoke/page.tsx(4,24): error TS7016: Could not find a declaration file for module 'three'.
  '/…/node_modules/.pnpm/three@0.185.1/node_modules/three/build/three.module.js' implicitly has an 'any' type.
src/app/smoke/page.tsx(9,36): error TS7016: Could not find a declaration file for module
  'three/examples/jsm/geometries/RoundedBoxGeometry.js'. …
Failed to type check.
```

Note that **Turbopack compiled fine** - this is purely the type-check phase. Fix (already applied to this repo):

```bash
pnpm add -D @types/three     # resolved to 0.185.4, matches three 0.185.1
```

After that the identical build passes. This confirms and upgrades the r3f-drei.md bullet
"`@types/three@0.185.4` is only a transitive dep … add it as a devDependency if `tsc` reports implicit `any`"
from *maybe* to **required**.

### 2b. Related tsconfig landmine (seen in passing, will bite Convex work)

During one build a Convex file that used a BigInt literal (Convex `int64`) failed the same type-check pass:

```
convex/chessProbe.ts(81,32): error TS2737: BigInt literals are not available when targeting lower than ES2020.
```

Root cause: the root `tsconfig.json` has `"target": "ES2017"` and `"include": ["**/*.ts", …]`, so `next build`
type-checks `convex/**` with the *Next* tsconfig, not `convex/tsconfig.json` (which correctly uses
`"target": "ESNext"`). Fix: bump the root `target` to `"ES2020"` or later, or add `"convex/**"` to the root
`exclude`. (The probe file was transient; the tsconfig conflict is not.)

## 3. Module resolution: what Turbopack actually emitted

No `transpilePackages`, no `webpack`/`turbopack` config. Chunks observed being fetched by the dev browser -
every one of these is a *separate, successfully resolved* Turbopack chunk:

```
0hqc_three_build_three_core_15pyy7s.js
0hqc_three_build_three_module_21b0uez.js
0hqc_three_examples_jsm_11oe5df._.js          <- three/examples/jsm/* : NO transpilePackages needed
1rvs_@react-three_fiber_dist_1i_n06j._.js
07_-_three-stdlib_1cymyg5._.js                <- drei's internal three-stdlib: fine
0yh4_postprocessing_build_index_0o_guef.js    <- postprocessing 6.39.4 (type: module): fine
04d0_n8ao_dist_N8AO_1u-tdnq.js                <- n8ao 2.0.1 (type: module): fine
1-tm_maath_dist_0sd04n0._.js
03wz_@react-three_postprocessing_dist_index_1djawsf.js
turbopack-worker-[client-fs]__next_static_chunks_1_hyozq._.js   <- bundled TS worker (dev)
```

Adding `transpilePackages: ["three", "postprocessing", "n8ao", "three-stdlib"]` was also tested: the build still
succeeds, timings are identical (2.6s vs 2.3s compile, within noise) and the emitted worker chunk hash is
byte-identical. **It is inert - do not add it.** (This is the Next-13-era webpack advice in the r3f docs; Turbopack
does not need it.)

Production `.next/static/chunks` after the build: 1.9 MB total, largest chunk **1,241,880 B**
(`three` + drei + `postprocessing` + `n8ao` vendor chunk, uncompressed). Budget for that on the game route.

### 3b. Module-scope code in a `"use client"` file runs in Node during prerender

Proven with a temporary `console.log` at module scope of `src/app/smoke/page.tsx`; the build log shows:

```
[smoke module-scope] undefined RoundedBoxGeometry e11d48
```

i.e. `typeof window === "undefined"`, yet `new RoundedBoxGeometry(...)` and `new THREE.Color(...)` construct fine
in Node - `three`, `three/examples/jsm`, `postprocessing` and `n8ao` all import cleanly server-side, which is why
no `serverExternalPackages` entry is needed. **Gotcha:** anything at module scope that touches `document`,
`window` or a WebGL context *will* crash the prerender. Keep loaders, geometry caches and engine boots inside
components/effects, or behind `typeof window !== "undefined"`.

## 4. Web Workers under Turbopack

### 4a. Bundled TS worker - works, dev and prod

```ts
// src/app/smoke/echo.worker.ts
self.addEventListener("message", (e: MessageEvent) => {
  (self as unknown as Worker).postMessage(`echo:${String(e.data)}`);
});
export {};
```

```ts
const w = new Worker(new URL("./echo.worker.ts", import.meta.url));
w.onmessage = (e) => console.log(e.data);   // -> "echo:ping"
w.postMessage("ping");
```

- dev: emits `turbopack-worker-[client-fs]__next_static_chunks_1_hyozq._.js`, round-trips.
- `next build`: emits `.next/static/chunks/turbopack-worker-2ru9m5gbh1na6.js` (849 B stub), served
  `Content-Type: application/javascript; charset=UTF-8`, `Cache-Control: public, max-age=31536000, immutable`.
  Round-trips against `next start`.

**This resolves item 2 of the Unverified list above: yes, it bundles.** Requires no `next.config.ts` entry.

### 4b. …but you must NOT use it for Stockfish - the `#params=` fragment collision

The URL Turbopack actually loads the worker from (observed in prod):

```
/_next/static/chunks/turbopack-worker-2ru9m5gbh1na6.js#params=[["/_next/static/chunks/turbopack-01k1r-l5pfyb5.js","/_next/static/chunks/10mhe51jxiwni.js"],"","/_next/",null,null]
```

Turbopack passes the worker's chunk list **in the URL hash**. The Stockfish glue reads its own
`location.hash` first comma-separated field and `decodeURIComponent`s it as the **wasm path**
(`stockfish.md` §3.2). Those two mechanisms collide head-on. The worker stub also hard-fails with
`"Worker entrypoint must be loaded in a worker context"` unless it is the Turbopack entry itself.

→ **Keep Stockfish as a classic `new Worker("/stockfish/stockfish-18-lite-single.js")` from `/public`**, exactly
as `stockfish.md` recommends. Use bundled workers only for your *own* TS workers (e.g. a move-generation or
eval-parsing worker), where the hash is yours to lose.

### 4c. React StrictMode kills naive worker boots (dev-only, cost me 20 minutes)

Next dev runs StrictMode, so effects go mount → cleanup → mount. This pattern **silently never boots the engine**:

```ts
// WRONG - the ref guard blocks the second mount, the first cleanup already terminated the only worker
const started = useRef(false);
useEffect(() => {
  if (started.current) return;
  started.current = true;
  const sf = new Worker("/stockfish/stockfish-18-lite-single.js");
  …
  return () => sf.terminate();
}, []);
```

Symptom: no console error at all, the worker fetches its `.js`, and `uciok` never arrives. Correct pattern
(what the harness now uses) - no guard, create and terminate per effect run:

```ts
useEffect(() => {
  const sf = new Worker("/stockfish/stockfish-18-lite-single.js");
  sf.onmessage = (e) => { /* … */ };
  sf.postMessage("uci");
  return () => sf.terminate();
}, []);
```

In dev this boots the 7.3 MB wasm twice; it is fine (~110 ms each, browser-cached) and prod boots once. If that
is unacceptable, hoist the engine into a module-level singleton created lazily on first use and never terminated,
rather than reintroducing a ref guard with a terminating cleanup.

## 5. `three-stdlib` cannot be imported from app code (pnpm strict)

Adding `import { SimplexNoise } from "three-stdlib";` to the smoke page:

```
Error: Turbopack build failed with 2 errors:
Error: Module not found: Can't resolve 'three-stdlib'
```

`three-stdlib@2.36.1` exists only as drei's transitive dep under `node_modules/.pnpm/`. drei's *own* imports of it
work perfectly (see the chunk list in §3). If app code needs it directly (e.g. `SimplexNoise`, `MeshSurfaceSampler`),
run `pnpm add three-stdlib` and pin the same 2.36.1 drei uses, or import the equivalent from `three/examples/jsm/*`
which needs no new dependency.

## 6. Stockfish wasm over HTTP - headers verified

`curl -D -` against both servers, on `/stockfish/stockfish-18-lite-single.wasm` (7,295,411 B):

| | `next dev` | `next start` (after `next build`) |
|---|---|---|
| `Content-Type` | `application/wasm` | `application/wasm` |
| `Cache-Control` (no config) | `public, max-age=0` | `public, max-age=0` |
| `Cache-Control` (with §7 `headers()`) | `public, max-age=31536000, immutable` | `public, max-age=31536000, immutable` |
| `Content-Encoding` with `Accept-Encoding: gzip` | `gzip` | `gzip` |
| `Accept-Ranges` | `bytes` | `bytes` |

The `.js` glue is served `application/javascript; charset=UTF-8`. **`WebAssembly.instantiateStreaming` therefore
works out of the box** - the wrapper's missing non-streaming fallback (`stockfish.md` §3.2) is not a problem on
Next dev or Next prod. The gzip Content-Encoding is transparent to streaming instantiation (Chrome sends
`Accept-Encoding: gzip` by default and the live browser run succeeded).

Runtime, measured in a real Chrome tab (`uci` posted immediately after `new Worker`, time to `uciok`):

| | dev | prod (`next start`) |
|---|---|---|
| cold `uciok` | **103-108 ms** | **274-346 ms** (first, uncached 7.3 MB fetch) |
| `go depth 8` from startpos | `bestmove e2e4 ponder e7e6` | same |

`crossOriginIsolated === false`, `typeof SharedArrayBuffer === "undefined"` in that tab - confirming lite-single
needs **no COOP/COEP**, so no cross-origin-isolation headers, and no risk to Clerk/Convex/HDRI loads.

## 7. Final `next.config.ts` (as committed)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Long-cache the immutable Stockfish engine files copied into /public.
  // NOTE: no transpilePackages and no wasm MIME override are needed - verified below.
  async headers() {
    return [
      {
        source: "/stockfish/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

`headers()` is applied by **both** `next dev` and `next start` (verified). It is the *only* addition; strip it and
everything still works, you just refetch 7.3 MB on every reload. Do **not** add COOP/COEP.

## 8. The 3D pipeline really renders (not just compiles)

Verified in a live browser against both servers by driving one frame manually
(`frameloop="demand"` + `advance()`, `preserveDrawingBuffer: true`) and reading pixels back:

```
gl.info: { programs: 18, textures: 41, geometries: 16 }, gl.getError() === 0
centerPixel = [164, 0, 35, 255]   // the crimson RoundedBoxGeometry, post-ACES
cornerPixel = [ 21, 22, 30, 255]  // the <color attach="background" args={["#0b0b12"]} />
```

18 compiled programs with `EffectComposer` + `N8AO` (`enableNormalPass`, `halfRes`) + `Bloom` (`mipmapBlur`) +
`ToneMapping(ACES_FILMIC)` + `MeshReflectorMaterial` (`blur=[300,100]`, `resolution=1024`) + `Environment preset="city"`
all live, **no runtime error, no shader-compile error, no console error**. The `city` preset fetched
`https://raw.githack.com/pmndrs/drei-assets/456060a…/hdri/potsdamer_platz_1k.hdr` in 78-990 ms - note that is a
third-party CDN on the critical path; `public/hdri/*.hdr` (already in this repo) avoids it.

Two three r185 deprecation warnings appear (harmless, but they are yours to silence):

```
THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.
    -> emitted by @react-three/fiber 9.7.0 internals. Nothing you can do; ignore.
THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
    -> caused by <Canvas shadows> (boolean).
```

Verified in `node_modules/@react-three/fiber/dist/events-4c71f21f.cjs.prod.js:7705-7725`: a **boolean** `shadows`
maps to `THREE.PCFSoftShadowMap` (deprecated in r185), while a **string** maps through
`{ basic: BasicShadowMap, percentage: PCFShadowMap, soft: PCFSoftShadowMap, variance: VSMShadowMap }`.
Use **`<Canvas shadows="percentage">`** (or `"variance"`) to silence it; `shadows={{ type: … }}` object form is
`Object.assign`-ed onto `gl.shadowMap`.

## 9. Timings (Apple M5 Max, pnpm 11.24.0)

`next dev` (Turbopack), `.next` deleted beforehand:

| | |
|---|---|
| `✓ Ready in` | **189-246 ms** |
| first `GET /smoke` (compiles the whole 3D route) | **4.5 s** first ever / **1.96 s** on a later cold start |
| second `GET /smoke` | **12 ms** |

`pnpm build`:

| Run | Turbopack compile | tsc | total wall |
|---|---|---|---|
| cold (`rm -rf .next`), first ever | 4.6 s | *failed - no @types/three* | 7.8 s |
| cold, after `@types/three` | 2.3 s | 1.61 s | **5.98 s** |
| cold, final config | 2.3 s | 1.73 s | **6.06 s** |
| cold, + inert `transpilePackages` | 2.6 s | 1.80 s | 6.50 s |
| **warm** (`.next` kept - Turbopack persistent cache) | **116 ms** | 810 ms | **2.94 s** |

Static generation of all 5 pages: ~250 ms with 6 workers. `/smoke` prerenders as `○ (Static)` despite being a
`"use client"` page with a `<Canvas>` - the Canvas simply renders nothing server-side.

## 10. Corrections to earlier research docs

- **`r3f-drei.md` → "`transpilePackages: ['three']`"**: RESOLVED - **not needed** on Next 16.3.4 + Turbopack,
  for `three`, `three/examples/jsm/*` or drei's `three-stdlib`. Adding it is inert. Do not add it.
- **`r3f-drei.md` → "`@types/three@0.185.4` is only a transitive dep"**: RESOLVED - it **is** required as a
  devDependency; `next build` fails TS7016 without it. Already installed (`0.185.4`).
- **`postprocessing.md` → open question 4** ("whether Next 16 / Turbopack needs `transpilePackages` for
  `postprocessing` or `n8ao`"): RESOLVED - **no**. Both pure-ESM packages resolve in the browser bundle and in
  the Node prerender with zero config.
- **`stockfish.md` → open question** ("Next dev/prod serving `.wasm` with `Content-Type: application/wasm`"):
  RESOLVED - **yes**, on both `next dev` and `next start`, verified by response header. Streaming instantiation
  works; the missing fallback is a non-issue on Next. (Vercel's CDN is still unverified - see below.)
- **`stockfish.md` → §3.2 "do not use `new Worker(new URL(...))` for the engine"**: CONFIRMED, and now with a
  concrete mechanism - Turbopack puts its chunk list in the URL **hash**, which is exactly where the Stockfish
  glue looks for the wasm path (§4b).
- **This file → Unverified item 2** ("Turbopack worker bundling was verified via context7, not by running a
  build"): RESOLVED - built and run here, dev and prod. See §4a.

## Unverified / open questions (this section)

1. **Vercel's edge/CDN** `Content-Type` for `/public/*.wasm` was not tested - only the local `next dev` and
   `next start` Node servers. Vercel serves `/public` as static assets with the same mime table, but confirm with
   `curl -I https://<deployment>/stockfish/stockfish-18-lite-single.wasm` on the first preview deploy.
2. The browser tab used for verification was a **hidden** pane, so `innerWidth/innerHeight` were 0 and
   `requestAnimationFrame` was paused. R3F's `react-use-measure` never fires its ResizeObserver in that state, so
   `<Canvas>` stays at the default 300x150 and never initialises. I worked around it with
   `resize_window` + `window.dispatchEvent(new Event('resize'))` + `frameloop="demand"` + manual `advance()`.
   **This is a test-harness artefact, not an app bug** - but it means *sustained* rAF rendering, FPS, and the
   adaptive-quality tiers in `postprocessing.md` were **not** measured. No perf numbers here.
3. `next dev --turbopack` vs the (removed) webpack path was not compared; Next 16.3.4 uses Turbopack for
   `dev` **and** `build` by default (banner says `(Turbopack)` on both), so webpack-era advice is moot.
4. Clerk was not mounted on the smoke page, so any interaction between `ClerkProvider` and the 3D route
   (bundle size, `'use client'` boundaries) is still untested.
5. The 1.24 MB vendor chunk was not analysed for tree-shaking headroom (e.g. whether importing `postprocessing`
   effect classes individually shrinks it) and no bundle analyzer was run.
6. Multi-threaded Stockfish (`stockfish-18-lite.js` + COOP/COEP) was deliberately **not** tested - lite-single
   needs no isolation and worked, and COOP/COEP risk to Clerk/Convex remains unquantified.
7. `output: "standalone"` / Docker packaging of `/public/stockfish` was not exercised.
