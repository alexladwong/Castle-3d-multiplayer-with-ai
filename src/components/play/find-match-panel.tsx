"use client";
// src/components/play/find-match-panel.tsx  [U5]
// "Online match" — the first seat of UI_UPGRADE_2 §3.2, and the waiting state
// that replaces it IN PLACE while the player is in the queue: elapsed time in
// mono, the widening-window rail drawn live, "Cancel" and "Play the AI while you
// wait".
//
// Every piece of queue behaviour below (the pagehide cleanup, the optimistic
// `queuedRef` claim, the skipped query before Convex has validated the session)
// is unchanged from the previous round — only the presentation is new.
import { useEffect, useRef, useState } from "react";
import { SwordsIcon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { RatingWindow } from "@/components/ui-kit";
import { QUEUE_BASE_RANGE, QUEUE_WIDEN_INTERVAL_MS, queueRangeAt } from "@/lib/constants";
import { formatElapsed, formatRating } from "@/lib/format";
import { describeConvexError } from "@/components/providers/convex-errors";
import { SeatPanel, SeatReason } from "./seat-panel";

/** The elapsed readout only needs sub-second accuracy. */
const TICK_MS = 500;

/**
 * The widest window the rail draws as "fully open". `queueRangeAt` keeps widening
 * past this, so the rail saturates rather than lying about a maximum that does
 * not exist — the numbers beside it stay authoritative.
 */
const BAR_MAX_RANGE = 1000;

const WIDEN_SECONDS = Math.round(QUEUE_WIDEN_INTERVAL_MS / 1000);

/* --------------------------------------------------------------- the rail */

function RatingWindowRail({ range, myRating }: { range: number; myRating: number | null }) {
  const low = myRating === null ? null : Math.max(0, myRating - range);
  const high = myRating === null ? null : myRating + range;

  return (
    <div className="grid gap-1.5">
      <div className="lobby-micro flex items-baseline justify-between gap-3 text-muted-foreground">
        <span>Rating window</span>
        <span className="lobby-data text-foreground">
          {low === null || high === null
            ? `±${range}`
            : `${formatRating(low)}–${formatRating(high)}`}
        </span>
      </div>

      {/* §3.2.1: "the same visual as the landing artefact, now live". It is the same
          component — the 800–2400 rail with its mono ticks — with the bracket
          centred on the player's own rating and widening with the real range, so a
          visitor who read the landing recognises it. */}
      <div
        role="progressbar"
        aria-label="Rating window"
        aria-valuemin={QUEUE_BASE_RANGE}
        aria-valuemax={BAR_MAX_RANGE}
        aria-valuenow={Math.min(BAR_MAX_RANGE, range)}
        aria-valuetext={`plus or minus ${range} rating points`}
      >
        <RatingWindow
          rating={myRating}
          range={range}
          caption={`±${range} now · wider every ${WIDEN_SECONDS}s`}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the waiting */

export interface QueuePanelViewProps {
  className?: string;
  /** Seat id for the `?mode=` deep link. */
  seat?: string;
  elapsedMs: number;
  /** ± rating points currently accepted, or null before the first tick. */
  range: number | null;
  myRating: number | null;
  pending?: boolean;
  flash?: boolean;
  onCancel(): void;
  onPlayAi(): void;
}

/** Pure: the harness at /dev/pages renders this with a frozen timer. */
export function QueuePanelView({
  className,
  seat,
  elapsedMs,
  range,
  myRating,
  pending = false,
  flash = false,
  onCancel,
  onPlayAi,
}: QueuePanelViewProps) {
  const shown = range ?? QUEUE_BASE_RANGE;

  return (
    <SeatPanel
      icon={SwordsIcon}
      title="Looking for an opponent"
      flash={flash}
      className={className}
      seat={seat}
      line={
        myRating === null
          ? `Looking for a player near your rating. The window widens every ${WIDEN_SECONDS} seconds.`
          : `Looking for a player near ${formatRating(myRating)}. The window widens every ${WIDEN_SECONDS} seconds.`
      }
      action={
        <>
          <Button
            size="lg"
            variant="outline"
            onClick={onCancel}
            disabled={pending}
            className="min-w-40 cursor-pointer py-2"
          >
            {pending ? "Cancelling…" : "Cancel"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={onPlayAi}
            disabled={pending}
            className="cursor-pointer py-2"
          >
            Play the AI while you wait
          </Button>
        </>
      }
    >
      <div className="grid max-w-md gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="lobby-micro flex items-center gap-2 text-muted-foreground">
            {/* Static, not pulsing: the elapsed clock beside it is the live
                signal, and a decorative pulse would only simulate one. */}
            <span aria-hidden className="size-1.5 rounded-full bg-live" />
            Searching
          </span>
          {/* One atomic status, not a bare number (Pro Max: contextual live status). */}
          <span
            role="status"
            aria-atomic="true"
            className="lobby-data text-foreground"
          >
            <span className="sr-only">Waiting </span>
            {formatElapsed(elapsedMs)}
          </span>
        </div>

        <RatingWindowRail range={shown} myRating={myRating} />

        <p className="lobby-micro text-muted-foreground">
          You are taken to the board the moment someone is matched. Keep this tab open.
        </p>
      </div>
    </SeatPanel>
  );
}

/* -------------------------------------------------------------- the seat */

export interface MatchSeatViewProps {
  className?: string;
  /** Seat id for the `?mode=` deep link. */
  seat?: string;
  myRating: number | null;
  /** undefined = the queue subscription has not landed yet. */
  loading?: boolean;
  pending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** True when this seat owns the lobby's one brass button (§3.2). */
  primary?: boolean;
  flash?: boolean;
  onFind(): void;
}

/** Pure idle seat — the harness renders it beside the waiting state. */
export function MatchSeatView({
  className,
  seat,
  myRating,
  loading = false,
  pending = false,
  disabled = false,
  disabledReason,
  primary = true,
  flash = false,
  onFind,
}: MatchSeatViewProps) {
  return (
    <SeatPanel
      icon={SwordsIcon}
      title="Find a match"
      flash={flash}
      className={className}
      seat={seat}
      line={
        loading ? (
          // An inline skeleton, not a block one: `line` renders inside a <p>.
          <span
            aria-hidden
            className="inline-block h-4 w-72 max-w-full rounded bg-secondary align-middle motion-safe:animate-pulse"
          />
        ) : myRating === null ? (
          `Rated. Someone near your rating first; the window widens every ${WIDEN_SECONDS} seconds.`
        ) : (
          `Rated. Someone near ${formatRating(myRating)} first; the window widens every ${WIDEN_SECONDS} seconds.`
        )
      }
      action={
        <>
          <Button
            size="lg"
            variant={primary ? "default" : "outline"}
            onClick={onFind}
            disabled={pending || disabled}
            title={disabled ? disabledReason : undefined}
            className="min-w-40 cursor-pointer py-2"
          >
            {pending ? "Joining…" : "Find a match"}
          </Button>
          {disabled && disabledReason ? <SeatReason>{disabledReason}</SeatReason> : null}
        </>
      }
    />
  );
}

/**
 * The whole online seat: the idle panel, and the queue panel *in place of it*
 * while searching (§3.2). Owning both here is what lets the swap happen at all —
 * the queue state lives in `queue.myStatus`, not in the page.
 */
export function FindMatchPanel({
  enabled,
  myRating,
  onPlayAi,
  /** True while another game is already in progress (FR-26). */
  disabled = false,
  disabledReason,
  primary = true,
  flash = false,
  className,
  seat,
}: {
  /** False until Convex has validated the session — the query is skipped then. */
  enabled: boolean;
  myRating: number | null;
  onPlayAi: () => void;
  disabled?: boolean;
  disabledReason?: string;
  primary?: boolean;
  flash?: boolean;
  className?: string;
  seat?: string;
}) {
  const status = useQuery(api.queue.myStatus, enabled ? {} : "skip");
  const join = useMutation(api.queue.join);
  const leave = useMutation(api.queue.leave);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const inQueue = status?.inQueue ?? false;
  const joinedAt = status?.joinedAt ?? null;

  // No wall clock during render (react-hooks/purity) and no synchronous setState
  // inside the effect body (react-hooks/set-state-in-effect) — the interval owns both.
  useEffect(() => {
    if (joinedAt === null) return;
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [joinedAt]);

  // Mirror the live values into refs so the unmount cleanup can read them
  // without re-registering (and therefore firing) on every change.
  const queuedRef = useRef(false);
  const leaveRef = useRef(leave);
  useEffect(() => {
    queuedRef.current = inQueue;
  }, [inQueue]);
  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  // FR-25: leaving the page gives up the slot. `pagehide` fires on bfcache
  // navigations where `beforeunload` does not; neither is guaranteed to land, so
  // `queue.pair` also drops rows older than 15 minutes.
  useEffect(() => {
    const abandon = () => {
      if (!queuedRef.current) return;
      // The row is deleted by `queue.pair` on a match, so this is usually a no-op;
      // swallow the rejection either way so an unmount cannot log an unhandled one.
      leaveRef.current({}).catch(() => {});
    };
    window.addEventListener("pagehide", abandon);
    return () => {
      window.removeEventListener("pagehide", abandon);
      abandon();
    };
  }, []);

  const elapsedMs = joinedAt === null || nowMs === 0 ? 0 : Math.max(0, nowMs - joinedAt);
  const range = joinedAt === null || nowMs === 0 ? null : queueRangeAt(joinedAt, nowMs);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      if (inQueue) {
        await leave({});
        queuedRef.current = false;
      } else {
        // Claim the slot BEFORE the round trip. `queuedRef` otherwise mirrors
        // `queue.myStatus`, which lands a round trip later, so navigating away in
        // that window skipped the FR-25 cleanup entirely: the row survived, got
        // paired within 5 s, and the abandon sweep forfeited the game for someone
        // who never saw a board. `queue.leave` is idempotent, so an unmount that
        // beats the join costs nothing.
        queuedRef.current = true;
        await join({});
      }
    } catch (error) {
      // Nothing changed server-side — fall back to the last value the
      // subscription gave us so the cleanup does not act on a phantom row.
      queuedRef.current = inQueue;
      toast.error(describeConvexError(error, "Matchmaking is unavailable right now."));
    } finally {
      setPending(false);
    }
  }

  if (inQueue) {
    return (
      <QueuePanelView
        className={className}
        seat={seat}
        elapsedMs={elapsedMs}
        range={range}
        myRating={myRating}
        pending={pending}
        flash={flash}
        onCancel={toggle}
        onPlayAi={onPlayAi}
      />
    );
  }

  return (
    <MatchSeatView
      className={className}
      seat={seat}
      myRating={myRating}
      loading={enabled && status === undefined}
      pending={pending}
      disabled={disabled}
      disabledReason={disabledReason}
      primary={primary}
      flash={flash}
      onFind={toggle}
    />
  );
}
