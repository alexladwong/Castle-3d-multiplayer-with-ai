// src/components/landing/landing-footer.tsx  [U1]
// §3's last band: credits and links. The piece-model credit is a licence
// obligation (CC BY 3.0, see public/models/ATTRIBUTION.md), so it is printed from
// `PIECE_MODEL_CREDIT` rather than retyped, exactly as /settings does.
import Link from "next/link";
import { PIECE_MODEL_CREDIT } from "@/lib/constants";
import { cn, focusRing } from "@/lib/ui";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/sign-in", label: "Sign in" },
];

const CREDITS: { label: string; body: React.ReactNode }[] = [
  {
    label: "Pieces",
    body: (
      <>
        {PIECE_MODEL_CREDIT.text}.{" "}
        <a
          href={PIECE_MODEL_CREDIT.licenseUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block -my-2 py-2 underline underline-offset-4 hover:text-foreground"
        >
          Licence
        </a>
      </>
    ),
  },
  {
    label: "Rooms",
    body: (
      <>
        HDRI lighting from{" "}
        <a
          href="https://polyhaven.com"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block -my-2 py-2 underline underline-offset-4 hover:text-foreground"
        >
          Poly Haven
        </a>
        , released under CC0.
      </>
    ),
  },
  {
    label: "Engine",
    body: <>Stockfish, licensed under the GPL v3. It runs in your browser, not on a server.</>,
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            {/* §2.5: the wordmark at headline size, with the knight that is the
                brand's mark (PRODUCT.md, "Brand Commitments"). */}
            <p className="font-display flex items-baseline gap-3 text-[2.5rem] leading-none text-foreground">
              <span aria-hidden className="text-primary">
                ♞
              </span>
              Castle
            </p>
            <p className="mt-4 max-w-[42ch] text-[13px] text-muted-foreground">
              An online chess club with rooms you can sit in. Free, and it runs in your browser.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                prefetch={false}
                href={item.href}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-md px-2 -mx-2 text-[13px]",
                  "text-muted-foreground transition-colors duration-(--dur-micro) hover:text-foreground",
                  focusRing,
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <dl className="mt-10 grid gap-x-8 gap-y-4 border-t border-border pt-6 sm:grid-cols-3">
          {CREDITS.map((credit) => (
            <div key={credit.label}>
              {/* A definition term, not a kicker: it labels the credit beside it
                  and sits above nothing. 13px is the label step (§1.2). */}
              <dt className="eyebrow">{credit.label}</dt>
              <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {credit.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
