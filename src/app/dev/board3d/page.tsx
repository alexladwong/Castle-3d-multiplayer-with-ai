// src/app/dev/board3d/page.tsx
// Development-only preview of the P4 3D board. It renders Board3D against an in-memory
// chess position so the scene can be verified in a browser with no Clerk session and no
// Convex deployment. The route does not exist in production.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Board3DDevPreview } from "@/components/board3d/dev-preview";

export const metadata: Metadata = {
  title: "Board3D preview",
  robots: { index: false, follow: false },
};

export default function Board3DDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Board3DDevPreview />;
}
