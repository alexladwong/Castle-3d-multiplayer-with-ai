# Clerk Billing (Core 3, @clerk/nextjs 7.9) — verified 2026-09-10

Sources: `clerk` CLI 3.3.0 (`--help` output and `clerk config schema --keys billing`),
https://clerk.com/docs/nextjs/guides/billing/for-b2c, https://clerk.com/docs/guides/billing/overview,
https://clerk.com/docs/guides/sessions/session-tokens, https://clerk.com/docs/guides/sessions/jwt-templates,
node_modules/@clerk/{nextjs,react,backend,shared,testing}. The Clerk-published skill at
`~/.claude/skills/clerk-billing/` is useful but has two errors (noted below).

## State of this instance (after provisioning)

- `clerk config pull --keys billing` → `user_enabled: true`; features `{ tutor }`; plans
  `{ free_user (auto), pro: amount 900, currency usd, payer_type user, is_recurring, features [tutor] }`.
- Backend API `GET /v1/billing/plans?payer_type=user` (Bearer `CLERK_SECRET_KEY`):
  `cplan_3J91JAvthSMAWxf7GMVIenCwVaL free_user`, `cplan_3J91JCm7kGNI2K1eTg64Iugeoad pro`.
- Development instances use Clerk's shared **test** Stripe gateway; no Stripe account needed. Test
  card (from `@clerk/testing` `fillTestCard`): 4242 4242 4242 4242 · 12/34 · 123 · United States · 12345.
- UNVERIFIED: whether the dev gateway must be selected once in Dashboard → Billing → Settings.
  There is no CLI key for the gateway. Check once if checkout does not open.

## Provisioning facts

- No `clerk billing` / `clerk plans` command. Plans and features are created with
  `clerk config patch --json '{"billing":{...}}'` (`--yes` skips prompts; `--dry-run` shows the diff).
  Both `plans` and `features` are **objects keyed by slug** (the skill's array example is wrong).
- Plan fields: `name, description, amount` (monthly cents), `annual_monthly_amount, currency,
  payer_type ("user"|"org"), is_recurring, publicly_visible, free_trial_enabled, free_trial_days,
  features[]` (slugs, display order). Feature fields: `name, description, avatar_url,
  publicly_visible (default false), include_in_jwt (default true), jwt_value`.
- Slugs are per payer type and immutable. The Backend API can list plans/prices and manage
  subscription items but cannot create plans; the Platform API has no billing endpoints.
- `clerk api /billing/plans --yes` hung when run non-interactively; use curl.

## Gating APIs (Core 3)

- `Protect`, `SignedIn`, `SignedOut` are removed (`@clerk/nextjs/dist/types/removedControlComponents.d.ts`
  declares them `never`; they throw). Use `Show`:
  `<Show when={{ feature: "tutor" }} fallback={<Locked/>}>…</Show>` (also `{ plan: "pro" }` or a
  `(has) => …` function). `Show` is exported from `@clerk/nextjs` and works in Server Components.
- Server: `const { userId, has } = await auth()` (`@clerk/nextjs/server`); `has({ feature: "tutor" })`,
  `has({ plan: "pro" })`. `auth.protect((has) => …)` exists but answers 404, not 403.
- Client: `const { has } = useAuth()`; `has?.({ feature: "tutor" })` (undefined pre-hydration).
- Stable billing UI from `@clerk/nextjs`: `PricingTable` (props `for`, `newSubscriptionRedirectUrl`,
  `fallback`, `appearance`, `checkoutProps`, `collapseFeatures`, `ctaPosition`), `UserProfile`
  (Billing/Plans section). Experimental, from `@clerk/nextjs/experimental`: `CheckoutButton`
  (needs the `cplan_…` id, must be inside a signed-in `Show`), `PlanDetailsButton`,
  `SubscriptionDetailsButton`, `CheckoutProvider`, `PaymentElement`, `useCheckout`,
  `useSubscription`, `usePlans`, `usePaymentMethods`. (The skill lists `useSubscription` beside
  the stable imports; only `PricingTable` is stable.)
- Session token: `pla` and `fea` are default v2 claims, formatted `scope:slug` with scope `u`
  (user) / `o` (org) / `ou` (both), comma-separated (`@clerk/shared` `splitByScope`);
  `@clerk/backend` maps them to `plans`/`features` for `has`.
- After checkout `has` stays false until the session token refreshes: navigate or
  `await clerk.session?.reload()`; `PricingTable newSubscriptionRedirectUrl` helps.

## Convex cannot see plans

`convex/auth.config.ts` uses the custom JWT template `convex`; Clerk's docs state session-tied
claims (`sid`, `v`, `pla`, `fea`) cannot be included in custom JWTs, and there is no billing
shortcode. So `ctx.auth.getUserIdentity()` never carries plan or feature. Options if Convex ever
needs it: billing webhooks (`subscription.created`, `subscriptionItem.canceled`, …) into a Convex
table via an HTTP action, or a Convex action calling `GET /v1/users/{id}/billing/subscription`.
Never pass a client-computed Pro flag into Convex.

## Testing

- `@clerk/testing/playwright/unstable` ships page objects that drive the real UI:
  `createPricingTablePageObject` (`startCheckout({ planSlug, period })`, `waitToBeActive({ planSlug })`),
  `createCheckoutPageObject` (`waitForStripeElements()`, `fillTestCard()`, `clickPayOrSubscribe()`),
  plus `subscriptionDetails` and `planDetails` objects. There is no API to seed a subscription;
  e2e must walk the Stripe Elements iframe (`iframe[src*="elements-inner-payment"]`).
- Cancel: `UserProfile` Billing section, or `DELETE /v1/billing/subscription_items/{id}`.
