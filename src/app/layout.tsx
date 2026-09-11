import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { PlayerSync } from "@/components/providers/player-sync";
import { SiteHeader } from "@/components/nav/site-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * Display face (UI_REDESIGN §1.2) — headlines only. `wght` is the default axis and
 * must not be listed; `opsz`/`SOFT`/`WONK` are the extra ones the `.font-display`
 * utility in globals.css pins with `font-variation-settings`.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Castle", template: "%s · Castle" },
  description: "Online 3D chess with real-time matchmaking, an AI opponent and custom rooms.",
};

/**
 * The Clerk card headings name the CLERK APPLICATION, which is not this product's name.
 * Overriding them here is the only way to say "Castle" on the auth screens without a
 * dashboard change — and the copy voice of UI_REDESIGN §2 applies to them like anything
 * else: sentence case, plain verbs, no exclamation marks.
 */
const CLERK_COPY = {
  signIn: {
    start: {
      title: "Sign in to Castle",
      subtitle: "Welcome back. Pick up where you left off.",
    },
  },
  signUp: {
    start: {
      title: "Join Castle",
      subtitle: "Free, and it runs in your browser.",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Provider order is mandatory: Clerk must wrap Convex so
            ConvexProviderWithClerk can read the Clerk context. */}
        <ClerkProvider afterSignOutUrl="/" localization={CLERK_COPY}>
          <ConvexClientProvider>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
              <TooltipProvider>
                <PlayerSync />
                <SiteHeader />
                <main className="flex-1">{children}</main>
                <Toaster position="top-center" richColors />
              </TooltipProvider>
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
