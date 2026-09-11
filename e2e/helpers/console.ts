// e2e/helpers/console.ts
// Collects console errors and uncaught page exceptions, minus the noise a Next dev
// server unavoidably produces. Every pattern here is *dev-server or third-party*
// chatter: nothing in this list may hide a defect in our own code.
import type { Page } from "@playwright/test";

const IGNORED = [
  // Next's dev overlay / HMR transport. `next dev` reconnects the HMR socket on every
  // recompile and logs the drop as an error.
  /\[Fast Refresh\]/i,
  /hot[- ]?(reload|update)/i,
  /webpack-hmr|turbopack-hmr|_next\/static\/chunks\/.*\.hot-update/i,
  /websocket connection to 'ws:\/\/localhost/i,
  /the server responded with a status of 404 .*\/_next\//i,
  // React's own dev banners.
  /download the react devtools/i,
  // Clerk prints this on every page load of a development instance, by design.
  /clerk.*development keys/i,
  // Chromium's own noise in headless: no favicon, blocked autoplay, etc.
  /favicon\.ico/i,
];

export interface ConsoleWatcher {
  /** Everything seen so far that is not on the ignore list. */
  errors(): string[];
}

/** Start watching `page`; call before the first `goto`. */
export function watchConsole(page: Page): ConsoleWatcher {
  const seen: string[] = [];

  const record = (text: string) => {
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    seen.push(text);
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    record(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    record(`pageerror: ${error.message}`);
  });

  return { errors: () => [...seen] };
}
