// src/components/landing/hero-body-flag.tsx  [U1, reworked in the integration pass]
// §3: "Header is transparent over the hero and gains --bg-elevated/80 + blur after
// 40px scroll." The header (src/components/nav/site-header.tsx) owns the scroll half
// of that as `header[data-scrolled]`; it reads the other half from this marker.
//
// This used to be a client component that wrote `body[data-hero="true"]` from an
// effect, which meant the server HTML painted with an elevated header for a frame or
// two before it went transparent — a visible flash on every cold load of `/`. A
// server-rendered marker plus `body:has(…)` on the header side removes the flash
// entirely: the marker is in the first HTML response, so the header is already
// transparent at first paint, and it disappears on its own when a client-side
// navigation unmounts the landing page. No effect, no cleanup, no hydration gap.
export function HeroBodyFlag() {
  return <span hidden data-hero-flag="true" />;
}
