// convex/auth.config.ts
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Set on the Convex deployment (NOT in .env.local):
      //   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://flowing-wildcat-1401.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex", // must equal the JWT `aud` claim; the `convex` template sets it
    },
  ],
} satisfies AuthConfig;
