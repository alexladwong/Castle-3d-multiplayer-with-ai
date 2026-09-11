// agent/channels/eve.ts — §F.4
//
// Route auth for the mounted /eve/v1/* endpoints. The browser NEVER talks to eve
// directly (option A in eve-agent.md §3.4): `src/app/api/ai/*` is the only client,
// which keeps Clerk auth and Convex authority in one place and means a player can
// never prompt the agent.
//
// `placeholderAuth()` / `none()` are deliberately absent — the scaffold's default
// policy 401s our server in production, and `none()` would let anyone drive the
// agent. `httpBasic` credentials are `{ username, password }`, NFC-normalised and
// compared with constant-time hash equality (dist/src/public/channels/auth.d.ts).
import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, vercelOidc } from "eve/channels/auth";
import { randomUUID } from "node:crypto";

// This module is also evaluated by `eve info` / `eve build`, where the runtime env
// may not be loaded yet. Throwing there would break discovery and the Vercel build,
// so a missing secret FAILS CLOSED instead: an unguessable random password that no
// caller can present, plus a loud warning.
const serverSecret = process.env.EVE_SERVER_SECRET;
if (serverSecret === undefined || serverSecret.length === 0) {
  console.warn(
    "[chess-agent] EVE_SERVER_SECRET is not set — HTTP Basic auth will reject every " +
      "caller. Set it in .env.local and in the Vercel project env.",
  );
}

export default eveChannel({
  auth: [
    // 1. Our own Next.js route handler (src/app/api/ai/*), server to server.
    httpBasic(
      {
        username: "chess-server",
        password: serverSecret !== undefined && serverSecret.length > 0 ? serverSecret : randomUUID(),
      },
      { realm: "chess-agent" },
    ),
    // 2. Vercel-internal callers and `eve dev <url>`.
    vercelOidc(),
    // 3. Only active under `eve dev` / `vercel dev`; inert in production.
    localDev(),
  ],
  // A second request queues behind an in-flight move instead of cancelling it (the
  // default "steer" policy would abandon a turn the player is waiting on).
  turnPolicy: "queue",
});
