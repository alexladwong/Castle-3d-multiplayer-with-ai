"use client";
// src/components/landing/hero.tsx  [UI upgrade 2 §2.1]
// The hero: headline left, the lit board anchored to the top-right and
// dissolving toward the copy, the Opera Game replaying inside it. The room
// switcher now lives here rather than in a band of its own (§2.1), because the
// board it changes is on screen while you use it.
//
// Everything that costs anything is gated: the replay stops when the hero
// scrolls away, when the tab is hidden or when the visitor pauses it, the canvas
// pauses itself (`pauseWhenOffscreen`), and the quality tier drops on a phone.
import { useState } from "react";
import { Display } from "@/components/ui-kit";
import { DEFAULT_ROOM } from "@/lib/rooms";
import { useReducedMotion } from "@/lib/ui";
import type { ResolvedQualityTier, RoomPresetId } from "@/lib/types";
import "./landing.css";
import { HeroBoard } from "./hero-board";
import { HeroCtas } from "./hero-ctas";
import { LandingStats } from "./landing-stats";
import { NotationStrip } from "./notation-strip";
import { ReplayToggle } from "./replay-toggle";
import { RoomSwitcher } from "./room-switcher";
import { useInView, useMediaQuery } from "./use-in-view";
import { setReplayPaused, useReplayPaused } from "./use-replay-pause";
import { SHOWCASE_CAPTION, useShowcaseGame } from "./use-showcase-game";

type RoomId = Exclude<RoomPresetId, "custom">;

export function Hero() {
  const [room, setRoom] = useState<RoomId>(DEFAULT_ROOM as RoomId);
  const [preview, setPreview] = useState<RoomId | null>(null);
  // Kept for the visit in sessionStorage — see use-replay-pause.ts.
  const paused = useReplayPaused();
  const reducedMotion = useReducedMotion();

  // A little margin so the replay keeps running while the visitor reads the
  // switcher just below it.
  const { ref: boardRef, inView } = useInView<HTMLDivElement>("200px");
  const game = useShowcaseGame({ paused: !inView || paused });

  // Medium everywhere, low on phones (§3). `false` until the client answers, so
  // the first mount is the cheap tier either way.
  const wide = useMediaQuery("(min-width: 768px)");
  const tier: ResolvedQualityTier = wide ? "medium" : "low";

  return (
    // `isolate` keeps the vignette behind the board and off the header.
    <section
      aria-labelledby="hero-heading"
      className="landing-hero relative isolate overflow-hidden lg:-mt-14 lg:pt-14"
    >
      <div className="mx-auto w-full max-w-[100rem] px-5 sm:px-8 lg:px-12">
        <div className="grid items-center gap-8 pt-8 pb-10 sm:pt-10 lg:grid-cols-12 lg:gap-8 lg:pt-10 lg:pb-12">
          <div className="max-w-[38rem] lg:col-span-5">
            <Display level={1} id="hero-heading" className="hero-editorial-title">
              Chess you can <em>walk</em> around.
            </Display>

            {/* The title step (1.25rem) of the ramp, at body weight: the one line
                that has to carry from the headline to the buttons. */}
            <p className="mt-6 max-w-[42ch] text-[1.125rem] leading-relaxed text-pretty text-muted-foreground">
              Sit at a board in a room you chose. Play people near your rating, or an opponent
              that tells you what it thinks.
            </p>

            <HeroCtas className="mt-7" />
            <LandingStats className="mt-5" />
          </div>

          <div className="min-w-0 lg:col-span-7">
            {/* Reserves the board's height on desktop; the canvas itself is the
                absolutely positioned layer below, so it can touch the top and the
                right edge of the viewport instead of stopping at the grid. */}
            <div aria-hidden className="hidden lg:block lg:h-[min(64vh,640px)]" />
            <div
              ref={boardRef}
              // Mobile: in flow, full width. Desktop: pinned to the section's top
              // and right edges (the section sits under the transparent header),
              // starting left of the column so the mask can dissolve it toward the
              // headline. Non-interactive, so it never intercepts pointer events.
              // `-mx-4` on the stacked layout: the section's own padding used to
              // inset the canvas by 18px, which drew a visible rectangle of room
              // light on the espresso ground. It bleeds to the viewport edges now
              // and the mobile mask feathers all four sides (globals.css).
              className="relative -mx-4 h-[max(56vw,20rem)] w-auto sm:-mx-6 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:right-0 lg:left-[44%] lg:mx-0 lg:h-auto lg:w-auto xl:left-[46%]"
            >
              <HeroBoard game={game} room={preview ?? room} tier={tier} />
            </div>

            <div className="relative z-10">
              <NotationStrip moves={game.moves} ply={game.ply} className="mt-3 -ml-4" />

              <div className="mt-1 flex items-center gap-1.5">
                <ReplayToggle
                  paused={paused}
                  onToggle={() => setReplayPaused(!paused)}
                  reducedMotion={reducedMotion}
                  className="-ml-2"
                />
                <p className="text-[13px] text-muted-foreground">{SHOWCASE_CAPTION}</p>
              </div>

              <RoomSwitcher
                value={room}
                onChange={setRoom}
                onPreview={setPreview}
                className="mt-5"
              />

              <p className="mt-3 max-w-[52ch] text-[13px] text-muted-foreground">
                Every room lights the same board. Pick the one you would sit in.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
