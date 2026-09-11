"use client";
// src/components/play/mode-picker.tsx  [U5]
// Settings-style game setup, with compact room controls beside the play options.
//
// The FR-24 auto-redirect is unchanged: `games.myActiveGame` is a live
// subscription, so when `queue.pair` creates the game BOTH clients see the id
// appear and navigate. No polling.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { buttonVariants } from "@/components/ui/button";
import { AiSetup } from "@/components/play/ai-setup";
import { FindMatchPanel } from "@/components/play/find-match-panel";
import { LocalSetup } from "@/components/play/local-setup";
import { Scoresheet } from "@/components/play/scoresheet";
import { SpectateList } from "@/components/play/spectate-list";
import { RoomRow } from "@/components/play/room-row";
import { DEFAULT_ROOM } from "@/lib/rooms";
import type { Colour, Difficulty, GameId, RoomPresetId } from "@/lib/types";
import { describeConvexError } from "@/components/providers/convex-errors";
import { cn } from "@/lib/ui";
import "./play.css";

const QUEUE_NOTICE =
  "Starting an AI game takes you out of the queue — a player can only have one game going at a time.";

const IN_GAME_REASON = "You have a game in progress. Finish or resign it first.";
const CHECKING_REASON = "Checking your games…";

/** The modes the landing page deep-links to with `/play?mode=…` (§3.2). */
type Mode = "match" | "ai" | "local";

const MODE_ALIASES: Record<string, Mode> = {
  match: "match",
  online: "match",
  find: "match",
  ai: "ai",
  computer: "ai",
  local: "local",
  pass: "local",
};

/** How long the deep-linked seat keeps its brass ring (§3.2). */
const FLASH_MS = 1000;

function modeFromParam(raw: string | null): Mode | null {
  if (raw === null) return null;
  return MODE_ALIASES[raw.toLowerCase()] ?? null;
}

export function ModePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const activeGameId = useQuery(api.games.myActiveGame, isAuthenticated ? {} : "skip");
  const leaveQueue = useMutation(api.queue.leave);
  const createAiGame = useMutation(api.games.createAiGame);
  const createLocalGame = useMutation(api.games.createLocalGame);
  const updateSettings = useMutation(api.players.updateSettings);

  const [aiNotice, setAiNotice] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState<Mode | null>(null);
  /** The seat the player last touched. Null until they touch one (§3.2). */
  const [seatFromUser, setSeatFromUser] = useState<Mode | null>(null);
  /** The deep link whose one-second ring has already been spent. */
  const [flashSpent, setFlashSpent] = useState<Mode | null>(null);
  /** Optimistic room, so the swatch updates before the write lands. */
  const [roomOverride, setRoomOverride] = useState<RoomPresetId | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);

  const seatsRef = useRef<HTMLDivElement | null>(null);

  // FR-26: the server refuses a second game (`already-in-game`), so the controls
  // that would start one are disabled rather than left to fail on submit.
  const hasActiveGame = Boolean(activeGameId);
  const roomPreset: RoomPresetId = roomOverride ?? me?.roomPreset ?? DEFAULT_ROOM;

  // "unset" until the first subscription value lands. A game that already exists
  // when the page opens is offered as "Resume", never force-navigated — only a
  // NEW id (i.e. a pairing that happened while we were watching) redirects.
  const baseline = useRef<"unset" | GameId | null>("unset");

  // An AI or local game created from this page ALSO makes a new id appear in
  // `myActiveGame`, and we are already navigating to it. Set before the create
  // mutation is awaited — Convex resolves that promise having already pushed the
  // new query value, so a flag set afterwards can lose the race. Cleared again if
  // the mutation rejects, so a later real pairing still redirects.
  const selfStarting = useRef(false);
  const noteSelfStart = useCallback((value: boolean) => {
    selfStarting.current = value;
  }, []);

  useEffect(() => {
    if (activeGameId === undefined) return;
    if (baseline.current === "unset") {
      baseline.current = activeGameId;
      return;
    }
    if (activeGameId !== null && activeGameId !== baseline.current) {
      baseline.current = activeGameId;
      if (selfStarting.current) return;
      toast.success("Match found — good luck.");
      router.push(`/game/${activeGameId}`);
    }
  }, [activeGameId, router]);

  // §3.2: a `?mode=` deep link scrolls the matching seat into view and gives it
  // the brass ring for one second. The seats stay usable throughout, so this is a
  // pointer, never a filter — and both derived values are computed during render,
  // so the deep link never costs a second pass.
  const deepLinked = modeFromParam(searchParams.get("mode"));
  const focusedSeat: Mode = seatFromUser ?? deepLinked ?? "match";
  const flashed: Mode | null =
    deepLinked !== null && flashSpent !== deepLinked ? deepLinked : null;

  useEffect(() => {
    if (deepLinked === null) return;
    seatsRef.current
      ?.querySelector<HTMLElement>(`[data-seat="${deepLinked}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const id = window.setTimeout(() => setFlashSpent(deepLinked), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [deepLinked]);

  async function startAi(difficulty: Difficulty, playerColor: Colour) {
    if (starting !== null) return;
    setStarting("ai");
    noteSelfStart(true);
    try {
      const gameId = await createAiGame({ difficulty, playerColor });
      router.push(`/game/${gameId}`);
    } catch (error) {
      setStarting(null);
      noteSelfStart(false);
      toast.error(describeConvexError(error, "Could not start the game. Try again."));
    }
  }

  async function startLocal(playerTwoName: string) {
    if (starting !== null) return;
    setStarting("local");
    noteSelfStart(true);
    try {
      const gameId = await createLocalGame(
        playerTwoName.length > 0 ? { playerTwoName } : {},
      );
      router.push(`/game/${gameId}`);
    } catch (error) {
      setStarting(null);
      noteSelfStart(false);
      toast.error(describeConvexError(error, "Could not start the game. Try again."));
    }
  }

  async function playAiFromQueue() {
    try {
      await leaveQueue({});
    } catch (error) {
      toast.error(describeConvexError(error, "Could not leave the queue."));
      return;
    }
    setAiNotice(QUEUE_NOTICE);
    setSeatFromUser("ai");
  }

  /** §3.3: the room row persists the choice, so it is already set in the game. */
  async function chooseRoom(room: Exclude<RoomPresetId, "custom">) {
    setRoomOverride(room);
    if (!isAuthenticated) return;
    setRoomBusy(true);
    try {
      await updateSettings({ roomPreset: room });
    } catch (error) {
      setRoomOverride(null);
      toast.error(describeConvexError(error, "Could not save the room. Try again."));
    } finally {
      setRoomBusy(false);
    }
  }

  // `myActiveGame` is a live subscription; until its first value lands the lobby
  // does not know whether this player may start a game, so the seats wait. Without
  // this, a click in the first second after sign-in raced the subscription: the
  // mutation failed with `already-in-game`, and the FR-24 redirect then carried the
  // player into their old game as if the click had worked.
  // Also true before the Convex handshake finishes: `/play` is behind Clerk, so a
  // signed-out visitor never gets here, and `isAuthenticated === false` on this
  // route means "not yet", during which every query is skipped and nothing is known.
  const checking = !isAuthenticated || activeGameId === undefined;
  const disabledReason = hasActiveGame ? IN_GAME_REASON : checking ? CHECKING_REASON : undefined;
  const seatsDisabled = checking || hasActiveGame || starting !== null;

  return (
    <div className="lobby grid gap-8">
      {activeGameId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.75rem] bg-primary/10 px-4 py-3">
          <p className="lobby-body text-foreground">
            You have a game in progress. Finish or resign it before starting another.
          </p>
          <Link
            prefetch={false}
            href={`/game/${activeGameId}`}
            className={cn(buttonVariants({ size: "lg" }), "cursor-pointer py-2")}
          >
            Resume game
          </Link>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          ref={seatsRef}
          className="lobby-seats grid min-w-0 gap-4"
          onFocusCapture={(event) => {
            const seat = (event.target as HTMLElement).closest<HTMLElement>("[data-seat]");
            const mode = seat?.dataset.seat as Mode | undefined;
            if (mode) setSeatFromUser(mode);
          }}
          onPointerDownCapture={(event) => {
            const seat = (event.target as HTMLElement).closest<HTMLElement>("[data-seat]");
            const mode = seat?.dataset.seat as Mode | undefined;
            if (mode) setSeatFromUser(mode);
          }}
        >
          <FindMatchPanel
            seat="match"
            enabled={isAuthenticated}
            myRating={me?.ratingHuman ?? null}
            disabled={seatsDisabled}
            disabledReason={disabledReason}
            primary={focusedSeat !== "ai"}
            flash={flashed === "match"}
            onPlayAi={playAiFromQueue}
          />

          <AiSetup
            seat="ai"
            onStart={startAi}
            starting={starting === "ai"}
            disabled={seatsDisabled}
            disabledReason={disabledReason}
            notice={aiNotice}
            primary={focusedSeat === "ai"}
            flash={flashed === "ai"}
          />

          <LocalSetup
            seat="local"
            onStart={startLocal}
            starting={starting === "local"}
            disabled={seatsDisabled}
            disabledReason={disabledReason}
            flash={flashed === "local"}
          />
        </div>

        <aside
          aria-labelledby="play-setup-heading"
          className="grid min-w-0 gap-5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-20"
        >
          <div className="grid gap-1">
            <h2 id="play-setup-heading" className="eyebrow">Your setup</h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Choose the room for your next game.
            </p>
          </div>
          {me?.username ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium">
              <span className="min-w-0 break-words">{me.username}</span>
              {me.rating != null ? (
                <span className="lobby-data text-muted-foreground">{me.rating} rating</span>
              ) : null}
            </p>
          ) : null}
          <RoomRow active={roomPreset} onSelect={chooseRoom} disabled={roomBusy} />
          <Link
            prefetch={false}
            href="/settings"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Board &amp; room settings
          </Link>
        </aside>
      </div>

      <section aria-labelledby="at-the-boards" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="at-the-boards" className="lobby-title text-foreground">
            At the boards
          </h2>
          <p className="lobby-micro text-muted-foreground">
            Every online game in progress. Watching is read-only.
          </p>
        </div>
        <SpectateList enabled={isAuthenticated} />
      </section>

      <section aria-labelledby="your-recent-games" className="grid gap-4">
        <h2 id="your-recent-games" className="lobby-title text-foreground">
          Your recent games
        </h2>
        <Scoresheet enabled={isAuthenticated} />
      </section>
    </div>
  );
}
