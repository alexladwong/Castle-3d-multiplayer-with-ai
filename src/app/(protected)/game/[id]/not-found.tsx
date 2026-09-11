// src/app/(protected)/game/[id]/not-found.tsx  [P3]
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function GameNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-3 p-6">
      <h1 className="text-xl font-semibold">Game not found</h1>
      <p className="text-sm text-muted-foreground">
        That game does not exist, or it has been removed.
      </p>
      <Link prefetch={false} href="/play" className={buttonVariants()}>
        Back to play
      </Link>
    </div>
  );
}
