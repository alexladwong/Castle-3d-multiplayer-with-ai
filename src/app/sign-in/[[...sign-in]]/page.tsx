import type { Metadata } from "next";
import { AuthCard } from "@/app/sign-in/auth-card";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The optional catch-all is MANDATORY, not stylistic: in non-production
 * `<SignIn/>` fetches `/sign-in/<probe>` and throws if it 404s
 * (clerk-setup.md §8.1). It also has to serve `/sign-in/factor-one`,
 * `/sign-in/sso-callback` and friends.
 */
export default function SignInPage() {
  return <AuthCard kind="sign-in" />;
}
