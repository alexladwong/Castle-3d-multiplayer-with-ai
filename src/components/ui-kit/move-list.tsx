"use client";
// src/components/ui-kit/move-list.tsx  [U0 → U2 §4.4]
// The Moves tab as a SCORESHEET: a mono number column in parchment, White and
// Black's SAN as buttons in mono, and the current ply on a seam plate with brass
// text — DESIGN.md's selected-chip treatment rather than the 2px brass rule the
// craft floor calls a costume.
//
// The row carrying the current ply scrolls itself into view, so arrowing through
// a long game never leaves the reader looking at move 4.
import { useEffect, useRef } from "react";
import { cn, focusRingInset } from "@/lib/ui";
import type { MoveHistoryRow } from "@/lib/types";

export interface MoveListProps extends Omit<React.ComponentProps<"div">, "onSelect"> {
  rows: MoveHistoryRow[];
  /** 1-based ply being reviewed; null while live. */
  currentPly?: number | null;
  onSelect?(ply: number): void;
  /**
   * Per-cell slot revealed on hover/focus, e.g. the "Rewind to move 8" button that
   * opens its confirmation (§5.1). It is rendered as a SIBLING of the cell button,
   * overlaid on its right edge — a button inside a button is invalid HTML and
   * breaks hydration. The slot may render a dialog trigger, so keep it a sibling
   * rather than nesting it in the cell.
   */
  renderAction?(ply: number): React.ReactNode;
  emptyMessage?: string;
}

function MoveCell({
  move,
  current,
  onSelect,
  renderAction,
}: {
  move: { ply: number; san: string } | undefined;
  current: boolean;
  onSelect?(ply: number): void;
  renderAction?(ply: number): React.ReactNode;
}) {
  if (!move) return <span aria-hidden className="px-2 py-1.5" />;

  const cellClass = cn(
    // `w-fit`: the brass plate marks the MOVE, not the row — it used to stretch the
    // full width of its grid cell for a three-character move.
    "flex w-fit min-w-[3.25rem] items-center rounded-md px-2 py-1.5 text-left text-[13px]",
    focusRingInset,
    current
      ? // §4.4: "current ply on a seam plate with brass text". Brass on seam is
        // 6.34:1 in dark and only 3.71:1 in light, so the light theme sets the
        // plate's text in ink and keeps the plate itself as the marker — the same
        // split `chat-message.tsx` makes for the player's own bubble.
        "bg-line font-medium text-foreground dark:text-primary"
      : "text-muted-foreground",
    onSelect && !current && "hover:bg-muted hover:text-foreground",
  );

  const san = <span className="tabular truncate font-mono">{move.san}</span>;

  return (
    <div className="group/cell relative flex min-w-0 items-stretch">
      {onSelect ? (
        <button
          type="button"
          aria-current={current ? "true" : undefined}
          aria-label={`Move ${move.ply}, ${move.san}`}
          className={cellClass}
          onClick={() => onSelect(move.ply)}
        >
          {san}
        </button>
      ) : (
        <span className={cellClass}>{san}</span>
      )}
      {renderAction ? (
        <span
          className={cn(
            "absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity",
            "group-hover/cell:opacity-100 group-focus-within/cell:opacity-100",
          )}
        >
          {renderAction(move.ply)}
        </span>
      ) : null}
    </div>
  );
}

/** Paired move list in mono, the reviewed ply on a seam plate (§4.4). */
export function MoveList({
  rows,
  currentPly = null,
  onSelect,
  renderAction,
  emptyMessage = "No moves yet.",
  className,
  ...props
}: MoveListProps) {
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  // Every arrow press changes `currentPly`; the row it lands on has to be on
  // screen or the scoresheet is only telling half the story. `block: "nearest"`
  // keeps the list still when the row is already visible.
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentPly]);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-1 bg-bg-sunken p-6 text-center",
          className,
        )}
        {...props}
      >
        <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
        <p className="text-[12px] text-muted-foreground">
          Play a move and the scoresheet fills in from here.
        </p>
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="Moves"
      className={cn("bg-bg-sunken p-1.5", className)}
      {...props}
    >
      {rows.map((row) => {
        const current =
          currentPly != null &&
          (row.white?.ply === currentPly || row.black?.ply === currentPly);
        return (
          <div
            key={row.number}
            ref={current ? currentRowRef : undefined}
            role="listitem"
            // A scoresheet, not a table: the number and the two SAN cells sit as
            // one tight group at the left and the leftover width is trailing space,
            // so a move PAIR reads as one move instead of two columns 180px apart.
            className="grid grid-cols-[2.5rem_max-content_max-content] items-stretch gap-x-1"
          >
            <span className="tabular flex items-center px-2 py-1.5 font-mono text-[13px] text-muted-foreground">
              {row.number}.
            </span>
            <MoveCell
              move={row.white}
              current={currentPly != null && row.white?.ply === currentPly}
              onSelect={onSelect}
              renderAction={renderAction}
            />
            <MoveCell
              move={row.black}
              current={currentPly != null && row.black?.ply === currentPly}
              onSelect={onSelect}
              renderAction={renderAction}
            />
          </div>
        );
      })}
    </div>
  );
}
