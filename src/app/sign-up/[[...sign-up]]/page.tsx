import type { Metadata } from "next";
import { AuthCard } from "@/app/sign-in/auth-card";

export const metadata: Metadata = { title: "Sign up" };

/**
 * The catch-all is required twice over (clerk-setup.md §8.1/§8.5): the dev-mode
 * probe fetch, and the progressive username step — a Google/GitHub sign-up
 * returns with `missingFields: ["username"]` and clerk-js navigates to
 * `/sign-up/continue`, which must resolve to this same page (FR-2).
 */
export default function SignUpPage() {
  return <AuthCard kind="sign-up" />;
}
