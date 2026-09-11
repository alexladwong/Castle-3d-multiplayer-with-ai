// src/app/not-found.tsx  [U4]
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Display, Eyebrow } from "@/components/ui-kit";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p aria-hidden className="text-4xl text-primary">
        ♟
      </p>
      <Eyebrow>404</Eyebrow>
      <Display level={3} as="h1">
        That square is <em>empty</em>.
      </Display>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        The page you were looking for does not exist, or the game has been cleared away. The
        lobby always has something going on.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link prefetch={false} href="/play" className={buttonVariants()}>
          Find a game
        </Link>
        <Link prefetch={false} href="/" className={buttonVariants({ variant: "outline" })}>
          Home
        </Link>
      </div>
    </div>
  );
}
