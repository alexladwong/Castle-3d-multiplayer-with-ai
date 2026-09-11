// src/app/dev/ui-kit/page.tsx  [U0]
// Development-only gallery of every ui-kit primitive (docs/UI_REDESIGN.md §7),
// so the design system can be reviewed in one screen without a Clerk session.
// The route does not exist in production.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { UiKitGallery } from "./gallery";

export const metadata: Metadata = {
  title: "UI kit",
  robots: { index: false, follow: false },
};

export default function UiKitDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiKitGallery />;
}
