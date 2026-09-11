# Known issues

Platform-level problems that are **not** bugs in this repository's code, plus the decisions taken
in response. Every entry says what is wrong, how to reproduce it, what we do about it, and what
would have to change for the workaround to be removed.

`docs/ARCHITECTURE.md` §I holds the product/architecture deviations from the PRD; this file holds
the ones that come from a dependency or a hosting platform. Where the two overlap, §I is cited.

| # | Issue | Severity | Workaround in the repo | Removable when |
|---|---|---|---|---|
| 1 | `withEve` breaks Next 16.3 segment prefetch on Vercel | High (UX + request volume) | `prefetch={false}` on **every** `next/link` | eve ships a fix; re-test per §1.6 |
| 2 | Clerk still runs its **development** instance in production | High (security + limits) | none — migration steps in §2 | a custom domain + prod OAuth apps exist |
| 3 | AI commentary is not token-streamed | Medium (perceived latency) | NDJSON status heartbeats; commentary lands whole | a `commit_move` tool replaces `outputSchema` |
| 4 | Piece models are CC BY 3.0, not CC0 | Low (licence obligation) | in-app credit + `ATTRIBUTION.md` | a CC0 set is found (do not re-research) |
| 5 | Stockfish 18 default is a 5.6 MB first download | Low (accepted) | lazy, immutable-cached, progress bar, SF11 fallback | never — NFR-3 was waived |
| 6 | `three` is pinned to 0.185.x — 0.186.0 is out of reach | Low (accepted) | pin `three@^0.185.1`; ecosystem not ready | `postprocessing` widens its peer range **and** `@types/three@0.186.x` ships |

---

## 1. `withEve` + Vercel `experimentalServicesV2` breaks Next 16.3 segment prefetch

**Status:** open upstream, mitigated here. Verified still broken on **eve 0.52.4** (repo now pins
`eve: ^0.52.4`). Affects production and preview deployments on Vercel; **not** `next dev`.

### 1.1 What breaks

`next.config.ts` wraps the config in `withEve` (`eve/next`), which on Vercel writes an eve
**service** plus its routes into the Build Output ahead of the Next.js routes
(`experimentalServicesV2`; ARCHITECTURE §F.1). That route table shadows the paths Next 16.3's
router uses for its **segment-tree prefetch**, and two distinct failures follow:

1. **Static routes 404 on the tree request.** A `Next-Router-Segment-Prefetch: /_tree` request for
   a normal route (`/`, `/leaderboard`) answers **404** instead of the segment tree. The router
   treats that as a transient miss.
2. **Optional catch-all routes answer with a corrupted tree.** `/sign-in` and `/sign-up` are
   `[[...sign-in]]` / `[[...sign-up]]` (required by Clerk — see §2 and ARCHITECTURE §G). Their tree
   comes back with the catch-all **param replaced by the internal
   `…/.segments/_tree.segment.rsc` path**. The client compares that tree against the one it asked
   for, rejects the mismatch, and immediately re-prefetches — forever.

Failure 2 is the expensive one. Every visible `<Link href="/sign-in">` / `"/sign-up"` — the header
carries both on every public page — re-prefetches at roughly **4 requests/second, per link**.
Measured on one page view of `/`: **280+ requests in 12 seconds** before the router gave up.

### 1.2 Reproduction

Against a Vercel deployment of this app built **with** `withEve`:

```bash
DEPLOY=https://<your-deployment>.vercel.app

# (a) Static route — expected: 200 text/x-component. Actual: 404.
curl -sS -o /dev/null -D - \
  -H 'RSC: 1' \
  -H 'Next-Router-Prefetch: 1' \
  -H 'Next-Router-Segment-Prefetch: /_tree' \
  "$DEPLOY/leaderboard"

# (b) Optional catch-all route — expected: a tree whose segment carries the route's own
#     param. Actual: 200, but the param slot holds the internal `.segments/_tree.segment.rsc`
#     path, so the router rejects the tree and re-requests it.
curl -sS \
  -H 'RSC: 1' \
  -H 'Next-Router-Prefetch: 1' \
  -H 'Next-Router-Segment-Prefetch: /_tree' \
  "$DEPLOY/sign-in"
```

All three headers matter: without `RSC: 1` you get the HTML document, and without
`Next-Router-Segment-Prefetch` you get the ordinary (working) full-route prefetch payload. The
same two requests against `http://localhost:3000` under `pnpm dev` behave correctly, which is why
this never shows up locally.

To watch failure 2 in a browser: deploy with the `prefetch={false}` props removed, open the
landing page, and filter the Network panel on `_tree` — the request count climbs continuously
while the two auth links are on screen.

### 1.3 The control (this is what proves it is eve, not Next or Clerk)

Deploy the identical commit with the wrapper removed — `export default nextConfig` instead of
`export default withEve(nextConfig)` — to a preview:

```bash
# in next.config.ts, temporarily:  export default nextConfig;
vercel deploy            # preview, not --prod
```

On that preview both curl calls behave: (a) returns **200** with
`content-type: text/x-component`, and (b) returns a tree with the real catch-all param. Re-adding
`withEve` and redeploying brings both failures straight back. The Next.js version, the Clerk
version, the routes and the app code are identical across the two deployments; the eve service in
the Build Output is the only difference. (The control deployment is only useful for this test —
without `withEve` there is no `/eve/v1/*` mount, so the AI opponent falls back to the direct AI
SDK path; see the README's `EVE_SERVER_SECRET` note.)

### 1.4 Mitigation in this repo

**Every `next/link` in `src/` carries `prefetch={false}`.** Not just the auth links: failure 1
makes the tree request useless for static routes too, so prefetch buys nothing anywhere while this
is broken. The prose reason lives at the top of `src/components/nav/auth-nav.tsx`.

**Do not remove those props** as a "cleanup" — the regression is invisible in `next dev` and only
appears once deployed. The routes most affected (`/sign-in`, `/sign-up`, `/game/[id]`) are dynamic
and were never usefully prefetchable anyway, so the cost of the workaround is close to zero.

### 1.5 Upstream report — file this against eve, verbatim

> **Title:** `withEve` on Vercel breaks Next.js 16.3 segment-tree prefetch (`Next-Router-Segment-Prefetch`)
>
> **Versions:** eve 0.52.2 and 0.52.4 (both reproduce) · next 16.3.4 · React 19 · Node 24 ·
> Vercel production and preview deployments · not reproducible under `next dev`.
>
> **Setup:** `next.config.ts` is `export default withEve(nextConfig)` with the default
> `eveRoot: ./agent`, so on Vercel `withEve` writes an eve service plus its routes into the Build
> Output ahead of the Next.js routes (`experimentalServicesV2`).
>
> **Expected:** Next 16.3's router prefetches a route's segment tree with
> `RSC: 1`, `Next-Router-Prefetch: 1`, `Next-Router-Segment-Prefetch: /_tree`. Those requests
> should reach the Next.js handler and return the segment tree for the requested route.
>
> **Actual, two failures:**
> 1. For static routes (`/`, `/leaderboard`) the segment-prefetch request returns **404**.
> 2. For optional catch-all routes (`/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`) the
>    request returns 200 but the tree has the catch-all **param replaced by the internal
>    `…/.segments/_tree.segment.rsc` path**. The client rejects the mismatched tree and
>    immediately re-prefetches, producing a loop of roughly 4 requests/second per visible link
>    (measured: 280+ requests in 12 s on a single page view with two such links in the header).
>
> **Reproduction:**
> ```bash
> curl -sS -o /dev/null -D - \
>   -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' -H 'Next-Router-Segment-Prefetch: /_tree' \
>   https://<deployment>/leaderboard          # -> 404, expected 200 text/x-component
>
> curl -sS \
>   -H 'RSC: 1' -H 'Next-Router-Prefetch: 1' -H 'Next-Router-Segment-Prefetch: /_tree' \
>   https://<deployment>/sign-in              # -> 200, param slot = .segments/_tree.segment.rsc
> ```
>
> **Control:** the identical commit deployed with `export default nextConfig` (no `withEve`)
> returns 200 + a correct tree for both requests. Re-adding `withEve` reintroduces both failures.
>
> **Impact:** all `next/link` prefetching has to be disabled app-wide (`prefetch={false}`), and
> without that workaround the router issues a sustained ~4 req/s/link loop against the deployment.
>
> **Guess at the cause:** the eve service's route entries in the Build Output are matched before
> Next's own `.segments/*.segment.rsc` internals, so the segment-prefetch paths either miss Next's
> handler entirely (failure 1) or are rewritten into the internal path before the catch-all param
> is filled in (failure 2).

### 1.6 How to re-test after an eve release

1. Bump `eve` in `package.json`, `pnpm install`.
2. Delete `prefetch={false}` from `src/components/nav/auth-nav.tsx` only (two links).
3. `vercel deploy` (preview) and run both curl calls from §1.2 against it.
4. Open the preview's landing page and watch the Network panel filtered on `_tree` for 15 s.
5. If (a) is 200 and the request count is stable, remove the prop everywhere and delete this
   section. If not, revert step 2 and update the version list in §1.

---

## 2. Clerk runs the **development** instance in production

**Status:** open. This is a launch blocker for anything beyond a demo.

### 2.1 What is wrong

The app authenticates against the Clerk **development** instance
(`https://flowing-wildcat-1401.clerk.accounts.dev`, `pk_test_…` / `sk_test_…`). No production
instance exists, because a production instance needs a custom domain to CNAME
`clerk.<domain>` at, and real OAuth credentials for Google and GitHub — the dev instance uses
Clerk's shared demo OAuth apps, which are not licensed for production traffic.

Consequences while this stands:

- **Dev-instance limits apply:** 100 emails/month and 20 SMS/month for non-test addresses
  (`+clerk_test` addresses are exempt). Real users hit that ceiling fast.
- **Dev-instance security posture:** development instances accept `http://localhost:*` origins and
  keep the relaxed session/cookie behaviour Clerk uses for local work.
- **Sign-in with Google/GitHub goes through Clerk's shared demo OAuth apps**, so the consent screen
  is not this app's.
- `clerk doctor --json` reports it: the only failing check is "no production instance".

Details, including the minted-token verification of the `convex` JWT template, are in
`docs/research/clerk-setup.md` (§7 is the migration list this section summarises).

### 2.2 Migration steps (in this order)

1. **Create the production instance** — `clerk deploy`, or the dashboard, then add the
   `clerk.<domain>` CNAME at the DNS provider and wait for Clerk to verify it.
2. **Re-apply the instance config with `--instance prod`**, plus **real** OAuth credentials:
   `connection_oauth_google.client_id` must match
   `^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$`, and GitHub needs its own OAuth app whose
   callback is the new `clerk.<domain>` domain. Keep `username.required` and progressive sign-up —
   the whole app keys display names off `identity.nickname` (ARCHITECTURE §I-13).
3. **Re-create the `convex` JWT template on the production instance.** Templates are per-instance
   and are *not* copied by `clerk deploy`. Same name (`convex`), same audience (`convex`), same
   claims including `nickname`. Convex rejects tokens from a template it cannot verify, so this
   step and step 4 must land together.
4. **Point Convex at the new issuer:**
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<domain> --prod
   ```
5. **Swap the Vercel production env vars** to `pk_live_…` / `sk_live_…`
   (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`). Leave the four
   `NEXT_PUBLIC_CLERK_*_URL` variables exactly as they are — without
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL` the protected-route redirect goes to Clerk's hosted Account
   Portal instead of `/sign-in`.
6. **Redeploy and verify:** sign up with a real address, confirm a `players` row appears
   (`ensurePlayer`, ARCHITECTURE §E.1), and confirm the username shows in the header — a token
   whose `nickname` claim is missing produces a nameless player rather than an error.

**Users do not migrate.** Development and production instances have separate user stores, so every
existing account is a test account. `players.tokenIdentifier` is `issuer|subject` and the issuer
changes, so pre-migration `players` rows in the production Convex deployment are orphaned; clear
them (or accept the dead rows) before launch.

---

## 3. AI commentary is not token-streamed

**Status:** accepted design trade-off. ARCHITECTURE §I-8 records the decision; this is the
platform-side explanation.

**Why.** FR-36 requires the agent to answer with a validated `{move, commentary}` object, because
the move has to be machine-checkable before it is applied to the board. Under eve, a per-turn
`outputSchema` routes the answer through a hidden `final_output` tool, and **that tool's deltas are
filtered out of the event stream** — verified live against eve 0.52.2. Nothing text-shaped arrives
before `result.completed`, so there is no token stream to forward, however the client subscribes.

**What we do instead.** `/api/ai/move` streams NDJSON `status` heartbeats so the panel shows live
"thinking" state and a persona name, then renders the commentary in one piece when the result
lands (typically 2–4 s). The visible effect is a filled progress state rather than a typewriter.

**The documented alternative**, if true token streaming is ever wanted: drop `outputSchema` and
give the agent a real `commit_move` tool, whose `action.input.appended` deltas **do** stream. The
cost is an extra model step (~+4 s), which breaks FR-38's 3 s latency target — so it is only worth
doing if that target is relaxed at the same time.

---

## 4. Piece models are CC BY 3.0 — attribution is mandatory

**Status:** permanent obligation, satisfied. ARCHITECTURE §I-7 has the full decision record.

`public/models/chess-pieces.glb` is baked from six models by **Jarlan Perez** via
[Poly Pizza](https://poly.pizza), licensed
[**CC BY 3.0**](https://creativecommons.org/licenses/by/3.0/). The PRD assumed a CC0 set; none
exists that is reachable without a login (**do not re-research Sketchfab** — its download endpoint
401s without OAuth, and its CC0 chess hits are 180k–500k-face photogrammetry scans).

The licence obligation is **attribution, visibly, in the shipped app**:

- rendered in-app under **Settings → Credits** (`src/components/settings/attributions.tsx`), from
  `PIECE_MODEL_CREDIT` in `src/lib/constants.ts`;
- full text with per-piece sources in `public/models/ATTRIBUTION.md`;
- repeated in the README's "Licences and attribution" section.

If the Credits panel is ever removed or the string is edited to drop the author or the licence
name, the app is out of compliance. `assets.md` §B2's procedural `LatheGeometry` fallback exists
if the licence becomes unacceptable, but it is unrendered and unverified — prefer the GLB.

Two more licences ship with the app and are not optional either: **Stockfish is GPL v3** (engine
files are served from `public/stockfish/` with `LICENSE-GPL-3.0.txt` alongside and the file
banners intact), and the HDRIs are CC0 from Poly Haven (credited anyway).

---

## 5. Stockfish 18 is a 5.6 MB first download (NFR-3 waived)

**Status:** accepted by the user (2026-09-09). NFR-3 as written is not met and will not be.

NFR-3 asked for a WASM bundle "under 2 MB gzipped". The default engine is
`stockfish@18.0.8`'s `lite-single` build: **5.64 MB gzipped** (7,295,411-byte `.wasm` +
~21 KB JS). Nothing in that package is under 2 MB — the smallest published artifact *is*
lite-single — so meeting NFR-3 would mean shipping a different engine. The user chose SF18's NNUE
strength over the byte budget.

What keeps the cost tolerable:

- **Lazy.** The worker is only created in AI mode and is `terminate()`d on unmount. Players who
  only play online or pass-and-play never download it.
- **Immutably cached.** Files live in version-stamped directories (`public/stockfish/sf18/`,
  `sf11/`), so `Cache-Control: immutable` is safe and the download is once per browser.
- **Visible.** The loader shows a real progress bar driven by `STOCKFISH_WASM_BYTES` until the
  response's own `total` arrives.
- **Not universal.** SF18 needs WASM SIMD. Browsers without it fall back automatically to
  `stockfish@11.0.0` (classical eval, **669 KB gzipped**, no SIMD and no SharedArrayBuffer
  required). `EngineBuild` is `"sf18" | "sf11"` and is *not* a user-facing setting.

Neither build needs `SharedArrayBuffer`, so **no COOP/COEP headers are required** — which matters,
because those headers would break Clerk's and Convex's cross-origin traffic.

The route back under 2 MB, if it is ever wanted: build an `ULTRA_LITE_NET=yes` flavour (upstream
`build.js` has the switch, needs emscripten 3.1.7, no published artifact, size unknown), or make
SF11 the default and lose NNUE strength. See `docs/research/stockfish.md` §2.1 and §11.

---

## 6. `three` is pinned to 0.185.x — the r3f post-FX stack cannot take 0.186 yet

**Status:** accepted, re-test on the next `postprocessing` release. Evaluated 2026-09-09 against
**three 0.186.0** (published 2026-09-08, one day earlier).

### 6.1 Why 0.186 was rejected

The bump was attempted for real — `pnpm add three@0.186.0`, then the full gate — and **both
`pnpm exec tsc --noEmit` and `pnpm build` passed**, and `/dev/board3d` rendered with no `THREE`
or WebGL console errors. It was still reverted, because those greens do not mean what they look
like:

1. **`@types/three@0.186.x does not exist.`** The newest published types are **0.185.4**
   (2026-08-04). Running the 0.186 runtime against 0.185 type definitions means `tsc` is checking
   this app's three usage against *the wrong version's* API surface — anything renamed or removed
   in r186 typechecks clean and fails in the browser. The tsc pass above is therefore not evidence
   of compatibility; it is evidence that the types did not change, because they were never
   published.
2. **`postprocessing@6.39.4` explicitly excludes it.** Its peer range is
   `three: ">= 0.168.0 < 0.186.0"` — an upper bound the maintainer wrote deliberately, not a stale
   caret. With three 0.186 installed, `pnpm peers check` reports:
   ```
   ✕ unmet peer three
     Installed: 0.186.0
     Wanted: ">= 0.168.0 < 0.186.0": postprocessing@6.39.4
   ```
   Both `@react-three/postprocessing` and `n8ao` sit on top of `postprocessing`, and the entire
   FR-29/FR-30/FR-31 chain (N8AO → Outline → Bloom → SMAA → Vignette → ToneMapping,
   `src/components/board3d/post-fx.tsx`) runs through it.
3. **A green `next build` cannot exercise any of that.** Turbopack bundles the effect chain but
   never instantiates a `WebGLRenderer`, compiles a shader, or runs a render pass. The failure mode
   a `< 0.186.0` peer bound guards against is a shader/renderer-internals mismatch at runtime —
   precisely the class of breakage a build is blind to.
4. **The runtime check did not clear it either.** `/dev/board3d` renders under 0.186, but the
   preview harness held the quality tier at `low`, and low-tier scenes **unmount** `<PostFX>`
   entirely (see the header comment in `post-fx.tsx`). So the one code path the peer bound warns
   about was never executed. A clean console at `low` says nothing about `high`.
5. **pnpm's own supply-chain gate refuses it.** `pnpm add three@latest` silently resolves to
   0.185.1 and reports "Already up to date", because 0.186.0 is inside the `minimumReleaseAge`
   window. Installing it at all required pinning the exact version, which also wrote a
   `three@0.186.0` entry into `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` (removed again on
   revert). Note this trap: **`pnpm add <pkg>@latest` saying "Already up to date" does not mean you
   are on latest** — check `npm view <pkg> version` before believing it.

Reverted with `pnpm add three@0.185.1`; `@types/three` stays at **^0.185.4**, which is both its
latest release and the matching one. `pnpm peers check` is clean again.

### 6.2 How to re-test

1. `npm view postprocessing peerDependencies` — proceed only once the `three` range admits
   ≥ 0.186, i.e. the upper bound moved or was dropped.
2. `npm view @types/three version` — proceed only once a 0.186.x types release exists.
3. Then `pnpm add three@latest @types/three@latest` (pin exact versions if the release-age gate
   makes `@latest` a no-op) and run the full gate.
4. **Verify in a browser at a post-FX tier, not just at `low`:** open `/dev/board3d`, raise the
   quality control until `<PostFX>` is mounted, and confirm the console is free of `THREE.*` and
   WebGL shader errors. `tsc` and `next build` passing is not sufficient — see §6.1.3.

Only `three` and `@types/three` are pinned by this; nothing else in the r3f stack was held back.

## 7. UI upgrade 2 and the scene round (2026-09-10)

Residues left deliberately after the landing / lobby / game upgrade (`docs/UI_UPGRADE_2.md`) and
the scene work (exact camera fit, sharp backdrops, table, curated rooms). None blocks play.

1. **NFR-9 waived for the Study's HDRI.** `public/hdri/study.hdr` (`combination_room`, CC0) is
   1,661,444 bytes, over the 1,572,864-byte per-file budget. No capped panorama read as a club
   room; the owner's "use the best" stance covers it. Every other room stays under the cap.
   Details and the rejected list: `docs/research/assets.md` §A2d.
2. **Backdrop VRAM.** Each 4k tonemapped backdrop becomes a 6×2048² cube target (~100 MB VRAM)
   plus ~33 MB source. Acceptable on laptops and phones tested; if low-end devices struggle,
   ship 2k variants for the `low` tier (§A2b has the pipeline).
3. **Park floor is soft.** The meadow's ground is drei's projection of the 1k HDR, so the floor
   under the board stays blurred while the sky is sharp. Fixing it means feeding the LDR texture
   to `groundProjectedEnvImpl`; parked.
4. **Arcade far-arc cable.** At the far end of the hero's pendulum a faint magenta-on-magenta
   cable shows at the top of the taller hero canvas. Both alternative sweep centres were worse.
5. **Hero orbit is a pendulum, not a full circle.** By design since the photographic rooms have a
   worst side: `RoomPreset.orbit = { centerAzimuth, halfArc }` (default ±0.95 rad, ~40 s period).
6. **Detector advisories that stay.** Five `design-system-font-size` advisories in
   `ui-kit/display.tsx` (the documented responsive Display ladder) and two `design-system-color`
   for `#000` mask stencils in `play/play.css` (alpha stencils, not colours). Zero blocking.
7. **Mobile bar naming.** The bar shows "Hint" with the count on its face; the accessible name
   stays "Ask for a hint · N left" everywhere. Flip lives in the More sheet on phones so five
   buttons fit 390 px without truncating.

8. **No vignette on the game canvas.** The §4.2 dissolve mask and room-tinted ground were
   removed on 2026-09-11 at the owner's request; the 3D canvas now meets the nameplates and the
   sidebar hairline with a clean edge, in both themes. The landing hero keeps its own blend.

## 8. Castle Pro and the tutor (2026-09-11)

Shipped per `docs/PRO_TUTOR.md`; verified end to end (Clerk checkout with the test card, a real
model turn, the browser-side Stockfish tool round trip, annotations on both boards). Residues:

1. **Conversation is not persisted** (§9, by design) and is also lost when the panel moves between
   surfaces: resizing across 1024 or 1280, or entering and leaving fullscreen. Within one surface
   it survives collapsing.
2. **Overlay semantics at 1024–1279.** The tutor overlay is `aria-modal="true"` with a working
   focus trap, but the board behind it is deliberately NOT `inert`, because §3 puts the panel over
   the board's left half so the drawing stays visible and playable. A stricter resolution needs a
   spec decision.
3. **Dev harness badge at phone width** (`src/app/dev/game/harness.tsx`): the scenario badge sits
   over the left of the chat-peek expander at 390. No free corner exists at every phone size; the
   fix is a dismiss control or auto-hide. Development only.
4. **Gateway credentials.** The tutor route reports 503 `tutor-unavailable` when no AI Gateway
   credential is present. It resolves the OIDC token the way `@vercel/oidc` does: the per-request
   `x-vercel-oidc-token` header on Vercel, else the local `VERCEL_OIDC_TOKEN` that `vercel env pull`
   writes (an expired one counts as absent). No `AI_GATEWAY_API_KEY` is configured anywhere; the
   opponent's agent uses the same credential.
5. **Free plan copy lives in Clerk config**, not source: `clerk config patch` set the `free_user`
   description on 2026-09-11. The Pro plan's price is never written in the repo.
6. **The e2e test user `castle-e2e` is now a Pro subscriber** (dev gateway, test card), so
   `e2e/pro.spec.ts` skips the checkout branch and annotates the run; cancel the subscription
   from the Clerk dashboard to re-exercise checkout.
7. **Convex production is deployed by hand.** Vercel builds the Next app only; new Convex
   functions (the tutor's `games.useTutorTurn`) reach `hallowed-impala-527` with
   `npx convex deploy --yes`. Forgetting it made production answer 503 `tutor-unavailable`
   from the quota step on 2026-09-11 while the dev deployment worked. Deploy Convex before
   Vercel whenever `convex/` changed.
