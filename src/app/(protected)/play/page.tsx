import { Suspense } from "react";
import type { Metadata } from "next";
import { ModePicker } from "@/components/play/mode-picker";
import { Display, Section } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return (
    <Section width="app" padding="md" className="pt-8 sm:pt-10">
      {/* No eyebrow: UI_UPGRADE_2 §3.1 and the craft floor's standing ban. The
          title carries itself and the host line does the welcoming. */}
      <header className="mb-10 grid gap-2">
        <Display level={3} as="h1">
          Play
        </Display>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">Take a seat.</p>
      </header>

      {/* `ModePicker` reads `?mode=` with useSearchParams, which needs a boundary. */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <ModePicker />
      </Suspense>
    </Section>
  );
}
