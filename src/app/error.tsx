"use client";
// src/app/error.tsx  [U4]
// Root error boundary. Must be a client component and must render its own
// markup — it replaces layout.tsx's children, not the layout itself.
// Copy voice (§2): say what happened and what to do. Never "Oops".
import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Display, Eyebrow } from "@/components/ui-kit";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p aria-hidden className="text-4xl text-primary">
        ♜
      </p>
      <Eyebrow>Something broke</Eyebrow>
      <Display level={3} as="h1">
        This page stopped <em>mid-move</em>.
      </Display>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Nothing on the server was lost — your games, ratings and settings are exactly where you
        left them. Try again, and if it keeps happening, go back to the lobby.
      </p>
      {error.digest ? (
        <code className="tabular rounded-lg bg-bg-sunken px-2 py-1 font-mono text-xs text-muted-foreground">
          {error.digest}
        </code>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link prefetch={false} href="/play" className={buttonVariants({ variant: "outline" })}>
          Back to the lobby
        </Link>
      </div>
    </div>
  );
}
