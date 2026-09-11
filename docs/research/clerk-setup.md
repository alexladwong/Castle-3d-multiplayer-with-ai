# Clerk setup for 3D Chess (development instance) — research + applied config

Written 2026-09-09 by the docs-research agent. Everything below was verified against the
installed packages, the live Clerk instance via `clerk` CLI **v3.3.0**, or official docs.
Source of each claim is noted inline. Nothing here is from memory.

## 0. Identity of the Clerk app (all non-secret)

| Item | Value | Verified by |
|---|---|---|
| Application | `3D Chess` — `app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li` | `clerk doctor --json` |
| Development instance | `ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV` (`environment_type: development`) | `clerk api /instance` |
| Production instance | **not created** (`Prod instance: (not set)`) | `clerk doctor --json` |
| Publishable key | `pk_test_Zmxvd2luZy13aWxkY2F0LTE0MDEuY2xlcmsuYWNjb3VudHMuZGV2JA` | `.env.local` |
| Frontend API / JWT issuer domain | `https://flowing-wildcat-1401.clerk.accounts.dev` | base64-decode of pk (`flowing-wildcat-1401.clerk.accounts.dev$`), `GET /.well-known/openid-configuration` → `"issuer":"https://flowing-wildcat-1401.clerk.accounts.dev"`, `GET /.well-known/jwks.json` → HTTP 200 with one RS256 key whose `kid` = `ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV`, and the `iss` claim of a token minted from the template (section 3) |
| Hosted Account Portal (dev) | `https://flowing-wildcat-1401.accounts.dev/sign-in`, `/sign-up` | FAPI `GET /v1/environment` → `display_config` |
| Convex JWT template | name `convex`, id `jtmp_3J5WhMRDDwh8FuS83KACkOHJV3H` | `clerk api /jwt_templates` |
| Users in dev instance | 0 (a throwaway verification user was created and deleted) | `clerk api /users/count` |

`CLERK_JWT_ISSUER_DOMAIN=https://flowing-wildcat-1401.clerk.accounts.dev` — this is **not a secret** (it is
derivable from the publishable key) and it is the value the Convex deployment needs.

## 1. How the CLI was driven (for reproducibility)

- Binary: `clerk` 3.3.0 at `~/.nvm/versions/node/v24.14.1/bin/clerk`. The skill at
  `~/.claude/skills/clerk-cli/SKILL.md` is pinned to 1.4.0 and is stale in one respect: v3.3.0 has
  extra top-level commands (`enable`, `disable`, `deploy`, `impersonate`, `mcp`, `webhooks`, `telemetry`).
  `clerk enable/disable` only cover `orgs` and `billing` — **not** social providers or usernames; those
  are done via `clerk config patch`.
- Ran with `CLERK_MODE=agent` and explicit `--app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV` (or `--instance dev`) on every mutating call.
- `clerk doctor --json`: all checks pass except two `warn`s (no production instance; zsh completion not installed).
- Instance config surface: `clerk config schema` (73 KB JSON Schema; top-level keys include `auth_email`,
  `auth_password`, `auth_username`, `auth_passkey`, `auth_phone`, `auth_multi_factor`, `auth_web3`,
  `connection_oauth_google`, `connection_oauth_github`, `connection_oauth_*` (30+ providers),
  `connections_oauth_custom`, `user_model`, `paths`, `session`, `session_settings`, `organization_settings`,
  `branding`, `billing`, `compliance`, `auth_attack_protection`, `auth_access_control`).
- Backend API discovery: `clerk api ls jwt_templates` → `GET/POST /jwt_templates`, `GET/PATCH/DELETE /jwt_templates/{template_id}`.
  `clerk api ls instance` → `GET /instance`, `PATCH /instance`, `/instance/organization_settings`, `/instance/restrictions`, `/jwks`, `/domains`, etc.
  `clerk api ls sessions` → `POST /sessions` (create active session), `POST /sessions/{id}/tokens/{template_name}` (mint from template).
- Gotcha: `clerk api --fapi /environment --app ... --instance dev` **hung indefinitely** in agent mode (had to be killed).
  Use plain `curl https://flowing-wildcat-1401.clerk.accounts.dev/v1/environment` instead — it is a public,
  unauthenticated endpoint and returns the same `user_settings` / `display_config` payload.

## 2. Sign-in methods + username — what was changed

### Schema keys used (from `clerk config schema`)

```jsonc
// auth_email
{ "used_for_sign_in": bool, "used_for_sign_up": bool, "required_for_sign_up": bool,
  "verify_at_sign_up": bool, "sign_in_strategies": ["email_code"|"email_link"],
  "verification_strategies": ["email_code"|"email_link"], "immutable": bool }
// auth_password
{ "enabled": bool, "required": bool, "min_length": int (8-72, default 15), "max_length": int,
  "min_zxcvbn_strength": 0-4, "require_*": bool, "disable_hibp": bool, "enforce_hibp_on_sign_in": bool,
  "device_trust": { "enabled": bool } }
// auth_username
{ "used_for_sign_up": bool, "used_for_sign_in": bool, "required_for_sign_up": bool,
  "min_length": int (1-64, default 4), "max_length": int (1-64, default 64), "immutable": bool,
  "allow_numeric_usernames": bool, "allow_extended_special_characters": bool }
// connection_oauth_google / connection_oauth_github
{ "enabled": bool, "authenticatable": bool, "client_id": string, "client_secret": string,
  "block_email_subaddresses": bool, /* google only: */ "show_account_selector_prompt": bool }
// user_model
{ "first_name": { "enabled": bool, "required": bool }, "last_name": { "enabled": bool, "required": bool } }
// paths  (all strings matching ^(/|\?|#|$))
{ "sign_in", "sign_up", "home", "after_sign_out_all", "unauthorized_sign_in", "waitlist", "oauth_consent" }
```

The schema descriptions for `client_id`/`client_secret` on Google and GitHub say verbatim:
*"not required in development — Clerk provides shared credentials"*. So on the dev instance
`{"enabled": true}` is sufficient; **production will require real OAuth client credentials**.

### State BEFORE (from `clerk config pull --keys ...`)

- `auth_email`: used for sign-in and sign-up, required, `sign_in_strategies: ["email_code"]`, verify at sign-up.
- `auth_password`: `enabled: true`, `required: true`, `min_length: 15`, HIBP on.
- `connection_oauth_google`: `enabled: true` (dev shared creds), `block_email_subaddresses: true`.
- `connection_oauth_github`: `enabled: false`.
- `auth_username`: all `false` (usernames not collected at all).
- `user_model.first_name/last_name`: `enabled: false` (names are NOT collected).

### Patch applied (dry-run first, then `--yes`)

File `patch-auth.json`:

```json
{
  "connection_oauth_google": { "enabled": true, "authenticatable": true },
  "connection_oauth_github": { "enabled": true, "authenticatable": true },
  "auth_username": {
    "used_for_sign_up": true,
    "used_for_sign_in": true,
    "required_for_sign_up": true,
    "min_length": 3,
    "max_length": 20
  }
}
```

```sh
clerk config patch --app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV --file patch-auth.json --dry-run
clerk config patch --app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV --file patch-auth.json --yes
# -> "Config pushed successfully", config_version v1_694ccca7
```

Diff reported by the CLI: `connection_oauth_github.enabled false→true`; `auth_username.used_for_sign_up/used_for_sign_in/required_for_sign_up false→true`; `min_length 4→3`; `max_length 64→20`. Email + password settings were left untouched (already enabled).

### State AFTER — verified two ways

`clerk config pull` after the patch returns exactly the "after" block above. The public FAPI payload
(`curl https://flowing-wildcat-1401.clerk.accounts.dev/v1/environment`) now reports:

```jsonc
user_settings.attributes (enabled only):
  email_address: { required: true, used_for_first_factor: true, first_factors: ["email_code"] }
  username:      { required: true, used_for_first_factor: true }
  password:      { required: true }
user_settings.social: oauth_google {enabled:true}, oauth_github {enabled:true}
user_settings.username_settings: { min_length: 3, max_length: 20, allow_numeric_usernames: false, allow_extended_special_characters: false }
user_settings.sign_up: { progressive: true, mode: "public", captcha_enabled: true, legal_consent_enabled: false }
```

### Resulting sign-in / sign-up experience (UI implications)

- **Sign-up form (`<SignUp/>`)** will render: Google button, GitHub button, **Username (required)**,
  Email (required, verified by 6-digit code), Password (required, min 15 chars, HIBP-checked). First/last name are not collected.
- **Sign-in (`<SignIn/>`)**: identifier field accepts **email or username** (`username.used_for_first_factor: true`), then password; email-code is also an available first factor. Plus Google/GitHub buttons.
- **OAuth sign-ups still get a username**: `sign_up.progressive: true` + `username.required: true` means after a Google/GitHub OAuth round-trip Clerk shows a "continue" step collecting any missing required fields (username). `<SignUp/>` handles this automatically as long as the app routes `/sign-up/[[...sign-up]]` (catch-all) so the `/sign-up/continue` step can render. **Every user will therefore have a non-null `username`**; a derived-username fallback in Convex is only defensive.
- Password policy is the dashboard default (`min_length: 15`). If that is considered too strict for a game, lower via `clerk config patch --json '{"auth_password":{"min_length":8}}'` (schema: valid explicit values 8–72). Not changed.
- Test accounts on dev: emails with `+clerk_test` (e.g. `alice+clerk_test@example.com`) verify with OTP `424242` and do not send real mail (skill `references/recipes.md`). Verified working: the throwaway user in section 3 used such an email and its token showed `email_verified: true`.

## 3. JWT template `convex`

### Why the name must be exactly `convex`

Installed `convex@1.45.0`, file `node_modules/convex/dist/esm/react-clerk/ConvexProviderWithClerk.js` lines 29-35:
`getToken({ template: "convex", skipCache: forceRefreshToken })`. The provider hard-codes the template name.
Convex docs (`docs.convex.dev/auth/debug`): *"For Clerk, specifically verify that the JWT token is named 'convex'."*
Convex `auth.config.ts` matches `applicationID` against the token's `aud` claim and `domain` against `iss`
(`docs.convex.dev/auth/advanced/custom-auth`: *"The `applicationID` property must exactly match the `aud` field of your JWT and the `domain` property must exactly match the `iss` field"*).

### Request body fields for `POST /jwt_templates`

From installed `@clerk/backend@3.17.1` `dist/api/endpoints/JwtTemplatesApi.d.ts` (`CreateJWTTemplateParams`), snake_cased for the raw API:
`name: string` (required), `claims: object` (required), `lifetime?: number` (seconds; docs default 60),
`allowed_clock_skew?: number` (seconds; docs default 5), `custom_signing_key?: boolean`,
`signing_algorithm?: string`, `signing_key?: string`.
Response object (`JwtTemplate`): `id, name, claims, lifetime, allowed_clock_skew, custom_signing_key, signing_algorithm, created_at, updated_at`.
Clerk docs (`clerk.com/docs/guides/sessions/jwt-templates`): default claims `azp, exp, iat, iss, jti, nbf, sub` are always added and cannot be overridden; session-only claims `sid, v, pla, fea` cannot be included in template tokens.

### Claims used

Base = the Convex-recommended claim set (Convex docs / Clerk "Convex" preset:
`aud, email, picture, given_name, updated_at, family_name, email_verified`) **plus** `name: {{user.full_name}}`
and `nickname: {{user.username}}` so the username reaches Convex as `identity.nickname`.

```json
{
  "name": "convex",
  "claims": {
    "aud": "convex",
    "name": "{{user.full_name}}",
    "nickname": "{{user.username}}",
    "given_name": "{{user.first_name}}",
    "family_name": "{{user.last_name}}",
    "email": "{{user.primary_email_address}}",
    "email_verified": "{{user.email_verified}}",
    "picture": "{{user.image_url}}",
    "updated_at": "{{user.updated_at}}"
  },
  "lifetime": 60,
  "allowed_clock_skew": 5
}
```

```sh
clerk api /jwt_templates --app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance dev --file jwt-convex.json --dry-run
clerk api /jwt_templates --app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance dev --file jwt-convex.json --yes
# -> {"object":"jwt_template","id":"jtmp_3J5WhMRDDwh8FuS83KACkOHJV3H","name":"convex", ... "lifetime":60,"allowed_clock_skew":5,"custom_signing_key":false,"signing_algorithm":"RS256"}
clerk api /jwt_templates --app app_3J5VGXoZZaRlVFCeRLGD4tvZ1Li --instance dev
# -> exactly one template: convex / jtmp_3J5WhMRDDwh8FuS83KACkOHJV3H
```

### End-to-end token proof

Created a throwaway dev user (`username: jwtcheck`, `jwtcheck+clerk_test@example.com`), `POST /sessions`,
then `POST /sessions/{sid}/tokens/convex`. Decoded payload (secrets omitted):

```json
{"aud":"convex","iss":"https://flowing-wildcat-1401.clerk.accounts.dev","sub":"user_3J5W…",
 "nickname":"jwtcheck","email":"jwtcheck+clerk_test@example.com","email_verified":true,
 "name":null,"given_name":null,"family_name":null,"picture":"https://img.clerk.com/…",
 "updated_at":1788951567,"iat":…,"nbf":iat-5,"exp":iat+60,"jti":"…"}
```
Header: `{"alg":"RS256","kid":"ins_3J5VGTMJ9B0ILvhD1P0P0mDXpHV","typ":"JWT"}` — the `kid` matches the JWKS key.
Session revoked and user deleted afterwards (`/users/count` → 0).

Consequences for Convex code (installed `convex/dist/cjs-types/server/authentication.d.ts`, `interface UserIdentity`):
- `identity.subject` = Clerk `user_…` id → use as `players.clerkId`.
- `identity.nickname` = Clerk username (always set given `required_for_sign_up: true`).
- `identity.pictureUrl` = avatar (`picture` claim; Clerk always returns an image URL, default avatar if none uploaded).
- `identity.email`, `identity.emailVerified` available.
- `identity.name`, `givenName`, `familyName` will be **null** for email/password users because `user_model.first_name/last_name` are disabled; OAuth users may have them. Do not rely on `name`; use `nickname`.
- `identity.tokenIdentifier` = `"<issuer>|<subject>"` (always present per Convex docs).

## 4. Convex side — exactly what it needs

`convex/auth.config.ts` (verbatim from `docs.convex.dev/auth/clerk`; `AuthConfig` type verified in `convex/dist/cjs-types/server/authentication.d.ts`: `{ applicationID: string; domain: string }`):

```ts
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```

Convex deployment env var (set on the Convex dashboard or `npx convex env set`, per Convex docs "Configuring dev and prod instances"):

```
CLERK_JWT_ISSUER_DOMAIN=https://flowing-wildcat-1401.clerk.accounts.dev
```

Then `npx convex dev` syncs `auth.config.ts`. A production Clerk instance will have a different issuer
(`https://clerk.<your-domain>.com`), set separately on the Convex prod deployment.

Client wiring (Convex docs, Next.js section): `ConvexProviderWithClerk` from `"convex/react-clerk"` with
`client={convex}` and `useAuth={useAuth}` where `useAuth` is imported from `@clerk/nextjs`; the component must
be a client component and must sit **inside** `<ClerkProvider>`.

## 5. Next.js app env vars (`.env.local`)

`.env.local` currently contains (names only, values redacted): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<set>`,
`CLERK_SECRET_KEY=<set>`, `VERCEL_OIDC_TOKEN=<set>` (Vercel CLI). `clerk doctor` confirms both Clerk keys belong to
the development instance. `.gitignore` line 34 is `.env*` → `git check-ignore -v .env.local` matches; **never committed**.

Env var names recognised by installed `@clerk/nextjs@7.9.1` (grep of `dist/`):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | required |
| `CLERK_SECRET_KEY` | required (server) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | set to `/sign-in` and `/sign-up` for embedded `<SignIn/>`/`<SignUp/>` pages |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | e.g. `/play` — where to land when there is no `redirect_url` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | optional, overrides `redirect_url` |
| `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED` | optional |
| `NEXT_PUBLIC_CLERK_PROXY_URL`, `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_IS_SATELLITE`, `CLERK_API_URL`, `CLERK_JS_URL`, `CLERK_UI_URL` | advanced — not needed |

Plus for Convex on the client: `NEXT_PUBLIC_CONVEX_URL` (Convex docs) — written by `npx convex dev`.

Recommended additions to `.env.local` (not applied by this agent):
```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/play
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/play
```

`@clerk/nextjs/server` exports `clerkMiddleware` and `createRouteMatcher` (`dist/types/server/index.d.ts` lines 4, 18) for protecting `/play`, `/game/:id`, `/profile` (FR-4). In Next.js 16 the middleware file is `proxy.ts` (see the nextjs skill's file-conventions); Clerk's function is still `clerkMiddleware`.

## 6. Redirect / paths / allowed origins (instance side)

- `paths.*` on the instance config are all `null` (dashboard "Paths" for the hosted Account Portal). The FAPI
  `display_config` therefore points at the hosted `https://flowing-wildcat-1401.accounts.dev/sign-in|sign-up`
  and `/default-redirect`. For embedded components in the Next app these are overridden by the
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` / `_FALLBACK_REDIRECT_URL` env vars above, so **nothing needs to be set on the instance for dev**. If the team prefers instance-level defaults instead, they can be set with `clerk config patch --json '{"paths":{"sign_in":"/sign-in","sign_up":"/sign-up","home":"/"}}'` (verify semantics first — these are Account Portal paths, see open questions).
- `GET /instance` → `allowed_origins: null`, `allowed_subdomains: []`, `subdomain_allowlist_enabled: false`. Development instances accept `http://localhost:*`; nothing to configure. Allowed origins matter only for a production instance / non-standard hosts (`PATCH /instance` has an `allowed_origins` field per `clerk api ls instance`).
- Development instance limits (skill recipes): 100 emails/month, 20 SMS/month for non-test addresses; `+clerk_test` addresses are exempt.

## 7. Still to do when going to production (not done — no prod instance exists)

1. `clerk deploy` / dashboard → create the production instance and a `clerk.<domain>` CNAME.
2. Re-apply section 2's patch with `--instance prod`, **plus real** `client_id`/`client_secret` for Google and GitHub (`connection_oauth_google.client_id` must match `^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$`).
3. Re-create the `convex` JWT template on prod (templates are per-instance) with the same body.
4. Set `CLERK_JWT_ISSUER_DOMAIN=https://clerk.<domain>` on the Convex **prod** deployment and `pk_live_`/`sk_live_` keys in Vercel prod env.

## Unverified / open questions

- The exact claim set of Clerk's dashboard "Convex" preset template could not be fetched from a first-party page (Clerk's BAPI reference URLs returned 404 and the Convex/Clerk guides now describe a dashboard "Convex integration" toggle instead of showing claims). The claim set used is the one quoted in Convex's documentation via web search (`aud, email, picture, given_name, updated_at, family_name, email_verified`) plus `name`/`nickname`. The minted token proves all nine shortcodes resolve, so the template is functionally correct regardless.
- Whether the newer Clerk dashboard "Convex integration" auto-creates a template named `convex` was not checked; the template now exists either way, so re-running that dashboard flow could fail with a duplicate-name error — do not run it.
- `progressive: true` sign-up collecting the username after OAuth was inferred from the FAPI flags (`sign_up.progressive`, `username.required`) and Clerk's documented progressive sign-up behaviour; it was not exercised in a browser. Test once the `/sign-up/[[...sign-up]]` route exists.
- `paths.*` in the instance config are documented in the schema only as "Display config paths"; whether they also feed `<ClerkProvider>` defaults (in addition to Account Portal) was not confirmed. Prefer the `NEXT_PUBLIC_CLERK_*_URL` env vars, which are verified in the installed SDK.
- The `clerk api --fapi` hang may be an agent-mode bug in CLI 3.3.0; not investigated further.
- Password `min_length: 15` was left as-is; product owner may want to relax it.

---

# Section 8: sign-in/sign-up routes and username capture

Researched 2026-09-09 against the **installed** `@clerk/nextjs@7.9.1` (which resolves
`@clerk/react@6.15.1`, `@clerk/shared@4.31.0`, `@clerk/backend@3.17.1` under `node_modules/.pnpm/`),
the live dev instance FAPI (`https://flowing-wildcat-1401.clerk.accounts.dev`), the Clerk Backend API,
the shipped `@clerk/clerk-js@5` bundle, and clerk.com docs. Closes: FR-1/FR-2 route + username gaps,
`nextjs16-shadcn.md` open question 4 (catch-all convention), `convex-clerk-nextjs.md` open question 3
(`afterSignOutUrl`), and `clerk-setup.md`'s own "progressive sign-up was inferred, not tested" item.

## 8.1 The catch-all route IS still required — and it is now enforced at runtime

**Verdict: keep `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`.
A plain non-catch-all `src/app/sign-in/page.tsx` will throw in dev.**

Verified in the installed package, not from docs:
`node_modules/@clerk/nextjs/dist/esm/client-boundary/uiComponents.js` wraps every `<SignIn/>` /
`<SignUp/>` in `useEnforceCorrectRoutingProps(...)`
(`dist/esm/client-boundary/hooks/useEnforceRoutingProps.js`), which calls
`useEnforceCatchAllRoute` (`dist/esm/client-boundary/hooks/useEnforceCatchAllRoute.js`). That hook,
**in non-production only** (`if (isProductionEnvironment()) return;`), issues a real
`fetch(`${origin}${pathname}/${component}_clerk_catchall_check_${Date.now()}`)` and, on a `404`,
throws:

> `Clerk: The <SignIn/> component is not configured correctly. … 1. The "/sign-in" route is not a catch-all route. It is recommended to convert this route to a catch-all route, eg: "/sign-in/[[...rest]]/page.tsx". Alternatively, you can update the <SignIn/> component to use hash-based routing by setting the "routing" prop to "hash". 2. … all routes under "/sign-in" are protected by the middleware … consider adding "(.*)" to the end of the route pattern, eg: "/sign-in(.*)"`

Two things fall out of that error text, both load-bearing for us:

1. **The catch-all segment name is arbitrary.** Clerk's own suggestion is `[[...rest]]`; the docs use
   `[[...sign-in]]`. `usePathnameWithoutCatchAll` derives the base path by stripping every array-valued
   entry of `useParams()` off the end of `usePathname()`, so any optional-catch-all name works
   identically. Use `[[...sign-in]]` / `[[...sign-up]]` to match Clerk's Next.js docs
   (verified 2026-09-09 at https://clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page,
   which shows `app/sign-in/[[...sign-in]]/page.tsx`).
2. **The middleware must not protect these routes.** If `clerkMiddleware` returns a redirect/404 for
   `/sign-in/<anything>`, the probe fetch fails the same way. Any route matcher must be
   `'/sign-in(.*)'`, not `'/sign-in'`.

Note the flag `requireSessionBeforeCheck`: it is `true` for `<UserProfile/>`/`<OrganizationProfile/>`
but **`false` for `<SignIn/>` and `<SignUp/>`** — so the probe runs for signed-out visitors too, i.e.
you will hit this on the very first dev page load.

### Minimal correct route files

```tsx
// src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'
export default function Page() {
  return <SignIn />
}
```

```tsx
// src/app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'
export default function Page() {
  return <SignUp />
}
```

No `path`/`routing` props are needed — see 8.2. These are client-rendered Clerk components; the page
files themselves do **not** need `'use client'` (the SDK's `client-boundary/*` modules carry it).

## 8.2 Exact `<SignIn />` / `<SignUp />` props in Core 3 (`@clerk/shared@4.31.0` `dist/types/clerk.d.ts`)

### Routing

```ts
// clerk.d.ts:1463
type RoutingStrategy = 'path' | 'hash' | 'virtual';

// clerk.d.ts:1589 — this is what SignInProps/SignUpProps actually extend
type RoutingOptions =
  | { path: string | undefined; routing?: Extract<RoutingStrategy, 'path'> }
  | { path?: never;             routing?: Extract<RoutingStrategy, 'hash'> };
```

Gotchas, all type-level facts from the installed `.d.ts`:

- **`routing="virtual"` is NOT assignable to `<SignIn/>` / `<SignUp/>`.** `'virtual'` exists on
  `RoutingStrategy` but `RoutingOptions` narrows to `'path' | 'hash'`; `'virtual'` is used internally
  by the modal variants (`SignInModalProps = WithoutRouting<SignInProps> & …`).
- `path` and `routing:'hash'` are **mutually exclusive** — passing both throws
  `incompatibleRoutingWithPathProvidedError` at runtime.
- Default is **`'path'`**, and `path` is auto-filled. From `@clerk/react/dist/internal.mjs`
  (`useRoutingProps`): `const path = props.path || routingOptions?.path;` and
  `if ((props.routing || routingOptions?.routing || 'path') === 'path') { if (!path) throw noPathProvidedError(...) }`.
  The Next.js SDK supplies `routingOptions.path` from `usePathnameWithoutCatchAll()`, so **`<SignIn />`
  with zero props is correct** and self-configures to `routing:'path', path:'/sign-in'`.

### `SignInProps` (clerk.d.ts:1597)

| Prop | Type | Notes |
|---|---|---|
| `path` / `routing` | see above | leave unset in Next.js |
| `forceRedirectUrl` | `string \| null` | after successful sign-in; **wins over everything** (env vars, search params, fallback) |
| `fallbackRedirectUrl` | `string \| null` | used only when no other redirect source is present |
| `signInUrl` | `string` | fills the "Sign in" link |
| `signUpUrl` | `string` | fills the "Sign up" link |
| `signUpForceRedirectUrl` / `signUpFallbackRedirectUrl` | `string \| null` | via `SignUpForceRedirectUrl & SignUpFallbackRedirectUrl` |
| `afterSignOutUrl` | `string \| null` | via `AfterSignOutUrl` — **yes, it is on `SignInProps`** |
| `appearance` | `ClerkAppearanceTheme` | merged over the `<ClerkProvider appearance>` global |
| `initialValues` | `SignInInitialValues & SignUpInitialValues` | prefill |
| `withSignUp` | `boolean` | enables the combined sign-in-or-up flow in one component |
| `transferable` | `boolean` (default `true`) | when `false`, an OAuth sign-in with an unknown email will **not** silently become a sign-up |
| `oauthFlow` | `'auto' \| 'redirect' \| 'popup'` | how Google/GitHub buttons open |
| `oidcPrompt` | `string` | OIDC `prompt` param |
| `waitlistUrl` | `string` | n/a for us |
| `unsafeMetadata` | `SignUpUnsafeMetadata` | |
| `__experimental` | `{ newComponents?: boolean }` | do not use |

### `SignUpProps` (clerk.d.ts:1750)

Same shape, mirrored: `forceRedirectUrl`, `fallbackRedirectUrl`, `signInUrl`,
`signInForceRedirectUrl`, `signInFallbackRedirectUrl`, `afterSignOutUrl`, `appearance`,
`unsafeMetadata`, `initialValues?: SignUpInitialValues`, `waitlistUrl`, `oauthFlow`, `oidcPrompt`,
`__experimental`. **`SignUpProps` has no `signUpUrl`, no `withSignUp`, and no `transferable`.**

### Env vars actually read by the installed SDK

`grep -roh "NEXT_PUBLIC_CLERK_[A-Z_]*" node_modules/@clerk/nextjs/dist/{esm,cjs}` →
`PUBLISHABLE_KEY, SIGN_IN_URL, SIGN_UP_URL, SIGN_IN_FORCE_REDIRECT_URL, SIGN_IN_FALLBACK_REDIRECT_URL,
SIGN_UP_FORCE_REDIRECT_URL, SIGN_UP_FALLBACK_REDIRECT_URL, DOMAIN, IS_SATELLITE, PROXY_URL, JS_URL,
JS_VERSION, UI_URL, UI_VERSION, PREFETCH_UI, KEYLESS_DISABLED, CHECKOUT_CONTINUE_URL, TELEMETRY_*,
UNSAFE_DISABLE_DEVELOPMENT_MODE_CONSOLE_WARNING`.
**There is no `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `_AFTER_SIGN_UP_URL` or `_AFTER_SIGN_OUT_URL`.**

> ⚠️ **Action item:** `.env.example` lists `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
> `_SIGN_UP_URL=/sign-up`, `_SIGN_IN_FALLBACK_REDIRECT_URL=/play`, `_SIGN_UP_FALLBACK_REDIRECT_URL=/play`,
> but **`.env.local` currently contains only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
> `CLERK_SECRET_KEY`.** Without `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `clerkMiddleware`'s redirect for a
> protected route (FR-4) falls back to the instance `display_config.sign_in_url`, which on this dev
> instance is the hosted Account Portal `https://flowing-wildcat-1401.accounts.dev/sign-in`, not our
> own page. Add all four lines to `.env.local` before building `/play`.

## 8.3 `afterSignOutUrl` — settles `convex-clerk-nextjs.md` open question 3

Grepped `@clerk/shared@4.31.0/dist/types/{clerk,redirects}.d.ts`:

```ts
// redirects.d.ts
type AfterSignOutUrl = { afterSignOutUrl?: string | null };
// clerk.d.ts:1282
type ClerkOptions = … & AfterSignOutUrl & AfterMultiSessionSingleSignOutUrl & { … };
// clerk.d.ts:2749
type IsomorphicClerkOptions = Without<ClerkOptions, 'isSatellite'> & { … };
// @clerk/react/dist/types-8bkUI4Jw.d.mts:10894
type ClerkProviderProps<TUi> = Omit<IsomorphicClerkOptions, 'appearance'|'publishableKey'|…> & { … };
// @clerk/nextjs/dist/types/types.d.ts
type NextClerkProviderProps<TUi> = Without<ClerkProviderProps<TUi>, 'publishableKey'> & { … };
```

Conclusions (all three verified from the type graph above):

- ✅ **`<ClerkProvider afterSignOutUrl="/">` is valid in v7** — it reaches `ClerkOptions` through
  `IsomorphicClerkOptions`. This is the app-wide setting to use.
- ✅ `afterSignOutUrl` is also valid on `<SignIn />` and `<SignUp />`.
- ❌ **`afterSignOutUrl` is NOT a prop of `<UserButton />` in Core 3.** The full `UserButtonProps`
  (clerk.d.ts:1948) is: `userProfileUrl`/`userProfileMode` (a discriminated pair — `'navigation'`
  requires the URL, `'modal'` forbids it), `showName?: boolean`, `defaultOpen?: boolean`,
  `signInUrl?: string`, `afterSwitchSessionUrl?: string`, `appearance?`, `userProfileProps?`,
  `customMenuItems?: CustomMenuItem[]`, `__experimental_asStandalone?`. Passing `afterSignOutUrl` to
  `<UserButton>` is a TS error.
- For a one-off sign-out target use `<SignOutButton redirectUrl="/" />`
  (`SignOutButtonProps = { redirectUrl?: string; sessionId?: string; signOutOptions?: SignOutOptions /* deprecated */; children? }`,
  `@clerk/react/dist/index.d.mts:256`).

**Recommended for this app** — in `src/app/layout.tsx`:

```tsx
<ClerkProvider afterSignOutUrl="/">{children}</ClerkProvider>
```

### Related Core 3 breaking change (bites the board/lobby header)

`@clerk/nextjs/dist/esm/removedControlComponents.js` — `<SignedIn>`, `<SignedOut>` and `<Protect>`
now **throw at render**: `Clerk: <SignedIn> is not available in @clerk/nextjs Core 3.` Use the
exported `<Show>` instead:

```ts
// @clerk/shared/dist/types/authorization.d.ts:61-86
type ShowWhenCondition = 'signed-in' | 'signed-out' | ShowProtectParams
                       | ((has: CheckAuthorizationWithCustomPermissions) => boolean);
type ShowProps = PendingSessionOptions & { when: ShowWhenCondition; fallback?: unknown };
```

```tsx
import { Show, SignInButton, UserButton } from '@clerk/nextjs'
<Show when="signed-out"><SignInButton /></Show>
<Show when="signed-in"><UserButton showName /></Show>
```

## 8.4 Google + GitHub: nothing to do beyond the providers already being on

Re-pulled the live instance config (`clerk config pull`, config_version `v1_9bec58c5`):

```jsonc
"connection_oauth_google": { "enabled": true, "authenticatable": true,
  "client_id": "", "client_secret": "", "block_email_subaddresses": true,
  "show_account_selector_prompt": false },
"connection_oauth_github": { "enabled": true, "authenticatable": true,
  "client_id": "", "client_secret": "", "block_email_subaddresses": false }
```

Exact CLI key names, for the record: **`connection_oauth_google`** and **`connection_oauth_github`**
(singular `connection_`, not `connections_`; `connections_oauth_custom` is a separate array key).
Both were already `enabled: true` from Section 2's push — **no change was needed and none was made.**
Empty `client_id`/`client_secret` = Clerk's **shared development credentials**.

The FAPI `/v1/environment` confirms the components will render both buttons:

```jsonc
"user_settings.social": {
  "oauth_google": { "enabled": true, "authenticatable": true, "not_selectable": false,
                    "strategy": "oauth_google", "name": "Google" },
  "oauth_github": { "enabled": true, "authenticatable": true, "not_selectable": false,
                    "strategy": "oauth_github", "name": "GitHub" }
}
```

**Proved end-to-end (live FAPI calls, 2026-09-09).** `POST /v1/client/sign_ups` with
`strategy=oauth_google` and with `strategy=oauth_github` both returned
`status: "missing_requirements"` and a real provider authorize URL:

- Google → `https://accounts.google.com/o/oauth2/auth?…client_id=787459168867-….apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fclerk.shared.lcl.dev%2Fv1%2Foauth_callback&scope=openid userinfo.email userinfo.profile`
- GitHub → `https://github.com/login/oauth/authorize?…client_id=456274a3f3e4821d16e4&redirect_uri=https%3A%2F%2Fclerk.shared.lcl.dev%2Fv1%2Foauth_callback&scope=user:email read:user`

So **FR-1 needs zero extra app code or dashboard work for the dev instance** — the `<SignIn/>` /
`<SignUp/>` components render the buttons from `user_settings.social`. Real OAuth apps are only
needed for the production instance (already tracked in Section 7 step 2).

### Bot protection will block any scripted/custom sign-up

`user_settings.sign_up = { progressive: true, mode: "public", captcha_enabled: true,
captcha_widget_type: "smart", legal_consent_enabled: false, custom_action_required: false }`.
A raw `POST /v1/client/sign_ups` without a captcha token fails with
`{"code":"captcha_missing_token","message":"Authentication unsuccessful due to failed security validations."}`.
Implications:

- The **prebuilt** `<SignUp/>` handles this itself (renders the Turnstile widget) — nothing to do.
- If anyone later builds a **custom** sign-up with `useSignUp()`, they must render
  `<div id="clerk-captcha" />` in the form or the same error appears.
- For **automated tests / scripts**, mint a testing token and pass it as a FAPI query param:
  `POST https://api.clerk.com/v1/testing_tokens` (Bearer `CLERK_SECRET_KEY`) →
  `{"object":"testing_token","token":"…","expires_at":…}`, then append
  `&__clerk_testing_token=<token>` to the FAPI URL. Verified working — this is how 8.5 was proved.

## 8.5 Username after OAuth: the "continue" step is automatic — now proved, not inferred

Instance state (FAPI `/v1/environment`, `user_settings`):

```jsonc
"sign_up":   { "progressive": true, "mode": "public", "captcha_enabled": true, "mfa": {"required": false} },
"attributes.username":      { "enabled": true, "required": true, "used_for_first_factor": true,
                              "verify_at_sign_up": false, "immutable": false },
"attributes.email_address": { "enabled": true, "required": true, "used_for_first_factor": true,
                              "first_factors": ["email_code"], "verify_at_sign_up": true },
"attributes.password":      { "enabled": true, "required": true, "used_for_first_factor": false },
"attributes.first_name":    { "enabled": false, "required": false },
"attributes.last_name":     { "enabled": false, "required": false },
"username_settings": { "min_length": 3, "max_length": 20,
                       "allow_numeric_usernames": false, "allow_extended_special_characters": false },
"password_settings": { "min_length": 15, "enforce_hibp_on_sign_in": true, … }
```

**Proof 1 — the server really does defer the username (live FAPI, testing token used to bypass
captcha).** `POST /v1/client/sign_ups` with only `email_address` + `password`:

```jsonc
{ "status": "missing_requirements",
  "missing_fields":   ["username"],
  "required_fields":  ["email_address", "username", "password"],
  "optional_fields":  ["oauth_github", "oauth_google"],
  "unverified_fields":["email_address"],
  "created_session_id": null, "created_user_id": null }
```

That is progressive sign-up: the attempt is **created and persisted** in `missing_requirements`
state with `missing_fields: ["username"]` instead of being rejected. `optional_fields` listing
`oauth_google`/`oauth_github` confirms an OAuth connection is an accepted way to satisfy the same
attempt (this is the "transfer" path a Google/GitHub button takes).

**Proof 2 — clerk-js navigates to the continue step off exactly that field.** Grepped the shipped
`@clerk/clerk-js@5` bundle (`cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.headless.js`). Inside
`_handleRedirectCallback` (the OAuth return handler) it builds:

```js
o = { status: i.status, missingFields: i.missingFields, externalAccountStatus: a.status, … }
g = c(e.continueSignUpUrl || e0({ base: r.signUpUrl, hashPath: "/continue" }, { stringify: true }))
_ = ({ missingFields: t }) => t.length ? g() : (({ signUp, verifyEmailP… }))
```

i.e. **after the Google/GitHub round-trip, if `signUp.missingFields` is non-empty, clerk-js navigates
to `<signUpUrl>/continue`** (`/sign-up/continue` for us) and the mounted `<SignUp/>` renders the
missing-field form there. Nothing to wire up — **but this is precisely why the catch-all in 8.1 is
mandatory**: `/sign-up/continue` must resolve to the same page, and so must `/sign-up/sso-callback`
and `/sign-up/verify-email-address`.

Clerk's docs describe the same lifecycle for the à-la-carte primitives — `<SignUp.Step name="continue">`
is documented as "triggered when a user initiates a sign-up but has not provided all required fields,
such as when using a social connection", with `username` as the worked example
(clerk-docs `guides/customizing-clerk/elements/{guides,reference}/sign-up.mdx`). The prebuilt
`<SignUp/>` implements that step internally.

**Conclusion for FR-2: every player, however they sign up, ends with a non-null `username` of 3–20
chars, no numeric-only, no extended special characters.** The defensive derived-username fallback in
Convex stays optional.

Two caveats an implementer should know:

- The username picked at `/sign-up/continue` is user-chosen, **not** derived from the Google/GitHub
  profile — expect a real extra form step in the OAuth flow. Budget for it in the UX.
- `username_settings.immutable: false`, so players can later change it in `<UserProfile/>`. Convex's
  `players` record must therefore be keyed on the Clerk **user id** (`sub`), never on the username,
  and the leaderboard should refresh `username` from the token / a `user.updated` webhook.

## 8.6 `identity.nickname` for a non-password (OAuth-shaped) user — verified

The existing `convex` JWT template (`jtmp_3J5WhMRDDwh8FuS83KACkOHJV3H`, fetched live via
`GET https://api.clerk.com/v1/jwt_templates`) is unchanged:

```jsonc
{ "aud": "convex", "name": "{{user.full_name}}", "email": "{{user.primary_email_address}}",
  "picture": "{{user.image_url}}", "nickname": "{{user.username}}",
  "given_name": "{{user.first_name}}", "family_name": "{{user.last_name}}",
  "updated_at": "{{user.updated_at}}", "email_verified": "{{user.email_verified}}" }
```

Section 3's proof used an email+password user. To cover the OAuth case as closely as possible without
real Google/GitHub credentials, a **password-less** user was created via the Backend API
(`POST /v1/users` with `username` + `email_address` + `skip_password_requirement: true`), a session
minted (`POST /v1/sessions`), and a token issued (`POST /v1/sessions/{sid}/tokens/convex`). Decoded
payload:

```jsonc
{ "aud": "convex", "iss": "https://flowing-wildcat-1401.clerk.accounts.dev",
  "sub": "user_3J5Z53p0RLpPvCOzLsRuutZZUBw",
  "nickname": "oauthproxy",                      // ← username resolves
  "email": "oauthproxy+clerk_test@example.com", "email_verified": true,
  "picture": "https://img.clerk.com/eyJ0eXBlIjoiZGVmYXVsdCIs…",   // ← never null
  "name": null, "given_name": null, "family_name": null,
  "updated_at": 1788952716, "exp": …, "iat": …, "nbf": …, "jti": … }
```

*(The throwaway user was deleted afterwards; `GET /v1/users` now returns `[]`.)*

Takeaways for the Convex side:

- `nickname` is resolved from the **user attribute**, independent of how the account was created —
  password, OAuth or Backend API. Since `username.required_for_sign_up: true`, `identity.nickname`
  is safe to treat as always-present. ✅
- `picture` (`identity.pictureUrl` in Convex) is always populated: a provider avatar for OAuth users,
  a Clerk-generated `img.clerk.com` default otherwise. Good enough for FR-2's avatar on board / lobby /
  leaderboard — **do not** render `<img>` unguarded on `name`.
- ⚠️ **`name` / `given_name` / `family_name` are `null` on this instance** because
  `user_model.first_name.enabled` and `.last_name.enabled` are both `false`. Any UI or Convex code
  reading `identity.name` (or `givenName`/`familyName`) must fall back to `identity.nickname`.
  Whether an OAuth sign-up back-fills `first_name`/`last_name` from the Google/GitHub profile even
  while those attributes are disabled is **not verified** (see open questions).

## 8.7 Copy-paste checklist for the implementation agent

1. Add the four missing Clerk URL vars to `.env.local` (8.2):
   `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`,
   `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/play`,
   `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/play`.
2. Create `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`
   exactly as in 8.1 — **optional catch-all, no props**.
3. In `proxy.ts` (Next 16's middleware), make the public matcher `'/sign-in(.*)'` / `'/sign-up(.*)'`,
   never the bare paths, or the dev-mode catch-all probe 404s and `<SignIn/>` throws.
4. `<ClerkProvider afterSignOutUrl="/">` in `src/app/layout.tsx`; **do not** put `afterSignOutUrl` on
   `<UserButton>`.
5. Replace any `<SignedIn>/<SignedOut>/<Protect>` with `<Show when="signed-in" | "signed-out">`.
6. Expect a `/sign-up/continue` username step after Google/GitHub. Do not build a custom one.
7. Read the display name from `identity.nickname` (Convex) / `user.username` (client), and the avatar
   from `identity.pictureUrl` / `user.imageUrl`. Never from `identity.name`.
8. Password sign-up on this instance needs **≥15 characters** and is HIBP-checked — a weak demo
   password returns `form_password_pwned`. Mention this if you write a QA script.

## Unverified / open questions (Section 8)

- **The post-callback half of the OAuth flow was not driven in a browser.** Everything up to the
  provider redirect was executed live (8.4), and the clerk-js code that reacts to `missingFields` on
  return was read from the shipped bundle (8.5), but no one actually logged into Google/GitHub. The
  claim "after OAuth, `<SignUp/>` shows a username step" is therefore code-and-API-proved rather than
  click-proved. Confirm with one manual sign-up once `/sign-up/[[...sign-up]]` exists.
- The exact set of internal sub-paths the catch-all must cover is only partly confirmed:
  `/sign-up/continue` is verified from the clerk-js bundle; `sso-callback`,
  `verify-email-address`, `factor-one` are the conventional siblings and were **not** individually
  located in the bundle (Core 3 moved the UI out of clerk-js into a separate `@clerk/ui` CDN bundle,
  which was not downloaded). The catch-all covers all of them regardless, so this is informational.
- Whether an OAuth sign-up populates `first_name`/`last_name` (and therefore `name`/`given_name`/
  `family_name` in the Convex JWT) while `user_model.first_name.enabled = false` — untested. Treat
  those claims as possibly-null either way.
- Whether Clerk sets `has_image: true` / a provider avatar URL for Google/GitHub users on a shared-dev-
  credentials instance — untested (the Backend-API-created proxy user got the default `img.clerk.com`
  avatar with `has_image: false`).
- `instance.paths.{sign_in,sign_up}` are still `null` and were deliberately **not** changed; the
  `NEXT_PUBLIC_CLERK_*_URL` env vars are the verified mechanism. The earlier open question about
  whether `paths.*` also feeds `<ClerkProvider>` defaults remains open (it feeds
  `display_config.sign_in_url`, which is the fallback the SDK uses when the env var is absent — that
  much is confirmed by `display_config` returning the accounts.dev URLs).
- `oauthFlow: 'auto' | 'redirect' | 'popup'` — the actual default behaviour of `'auto'` (which
  conditions choose popup) was not determined; leaving the prop unset is fine.
