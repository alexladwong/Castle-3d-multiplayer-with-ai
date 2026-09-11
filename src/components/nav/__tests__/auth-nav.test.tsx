// @vitest-environment node
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  loaded: true, signedIn: true, authenticated: true,
  pro: false, username: "player one" as string | null,
}));
const query = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: session.authenticated }),
  useQuery: query,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@clerk/nextjs", () => {
  const UserButton = Object.assign(({ children }: { children: ReactNode }) => <div>{children}</div>, {
    MenuItems: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Link: ({ label, href }: { label: string; href: string }) => <a href={href}>{label}</a>,
  });
  return {
    UserButton,
    useAuth: () => ({ isLoaded: session.loaded, isSignedIn: session.signedIn }),
    // Exercise the UI branches while pinning the real Clerk plan contract.
    Show: ({ when, children, fallback }: { when: { plan: string }; children: ReactNode; fallback: ReactNode }) => {
      expect(when).toEqual({ plan: "pro" });
      return session.pro ? children : fallback;
    },
  };
});
const { AuthActions, AuthNavLinks } = await import("../auth-nav");

beforeEach(() => {
  Object.assign(session, { loaded: true, signedIn: true, authenticated: true, pro: false, username: "player one" });
  query.mockReset().mockImplementation(() => session.username ? { username: session.username } : null);
});

describe("account navigation", () => {
  it("links to the saved player's profile in navigation and the avatar menu", () => {
    for (const component of [<AuthActions key="actions" />, <AuthNavLinks key="links" />]) {
      expect(renderToStaticMarkup(component)).toContain('href="/profile/player%20one"');
    }
  });
  it("waits for Convex authentication before looking up the profile", () => {
    session.authenticated = false;
    expect(renderToStaticMarkup(<AuthNavLinks />)).not.toContain("/profile/");
    expect(query.mock.calls[0][1]).toBe("skip");
  });
  it("does not invent a profile link while the player is being created", () => {
    session.username = null;
    expect(renderToStaticMarkup(<AuthActions />)).not.toContain("/profile/");
  });
  it("offers an upgrade to a free member and changes to the starred Pro link when membership changes", () => {
    const free = renderToStaticMarkup(<AuthActions />);
    expect(free).toContain("Upgrade to Pro");
    expect(free).toContain('href="/pro"');
    session.pro = true;
    const paid = renderToStaticMarkup(<AuthActions />);
    expect(paid).not.toContain("Upgrade to Pro");
    expect(paid).toContain('aria-label="Pro membership"');
    expect(paid).toContain("lucide-star");
    expect(paid).toContain('href="/pro"');
  });
  it("does not flash an upgrade before Clerk loads", () => {
    session.loaded = false;
    expect(renderToStaticMarkup(<AuthActions />)).not.toContain("Upgrade to Pro");
  });
  it("keeps guests on public navigation with sign-in actions", () => {
    session.signedIn = false;
    session.authenticated = false;
    const actions = renderToStaticMarkup(<AuthActions />);
    expect(actions).toContain("Sign in");
    expect(actions).not.toContain("/pro\"");
    expect(renderToStaticMarkup(<AuthNavLinks />)).not.toContain("/profile/");
  });
});
