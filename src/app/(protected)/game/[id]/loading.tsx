// src/app/(protected)/game/[id]/loading.tsx  [P3]
import { Skeleton } from "@/components/ui/skeleton";

export default function GameLoading() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="aspect-square w-full max-w-[min(100%,80vh)] rounded-xl" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="hidden h-[32rem] w-full lg:block" />
      <p className="sr-only" role="status">
        Loading the game
      </p>
    </div>
  );
}
