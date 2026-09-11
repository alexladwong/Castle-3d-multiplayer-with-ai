"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, focusRing } from "@/lib/ui";

export interface NavLink {
  href: string;
  label: string;
}

/** Shown once the player is signed in. `/leaderboard` is public but belongs here too. */
export const NAV_LINKS: NavLink[] = [
  { href: "/play", label: "Play" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/settings", label: "Settings" },
];

/** Shown to guests — only routes the proxy does not gate (§G). */
export const PUBLIC_NAV_LINKS: NavLink[] = [{ href: "/leaderboard", label: "Leaderboard" }];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Active-route aware links. A horizontally scrollable row on mobile (NFR-6) so
 * the header never wraps to two lines at 360 px.
 */
export function NavLinks({ links, className }: { links: NavLink[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn("flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar", className)}
    >
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link prefetch={false}
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              // The 36px touch floor the shared Button already carries; these
              // are plain links, so they ask for it themselves.
              "pointer-coarse:min-h-9",
              focusRing,
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
