"use client";
// src/components/tutor/annotation-chip.tsx
// One drawing the tutor made, as a toggle (docs/PRO_TUTOR.md §3.3). Pressing it
// puts that drawing back on the board; pressing the only pressed chip takes the
// board back to clean. The tone is named in words as well as coloured, so the
// chip carries its meaning without colour.
import { CircleSlashIcon } from "lucide-react";
import { ANNOTATION_TONE_LABEL, ANNOTATION_TONE_TOKEN } from "@/lib/tutor/annotations";
import { drawingChipLabel, type TutorDrawing } from "@/lib/tutor/overlay";
import { cn, focusRing } from "@/lib/ui";

export interface AnnotationChipProps {
  drawing: TutorDrawing;
  /** True when this drawing is what the board is currently showing. */
  active: boolean;
  onToggle(drawing: TutorDrawing): void;
}

export function AnnotationChip({ drawing, active, onToggle }: AnnotationChipProps) {
  const tone = ANNOTATION_TONE_LABEL[drawing.tone];

  // A drawing the tool refused is not a toggle: there is nothing to put on the
  // board. It stays visible, in the tutor's own words, rather than vanishing and
  // leaving a sentence pointing at a mark that never appeared.
  if (drawing.state === "problem") {
    return (
      <span
        data-annotation-chip="problem"
        className="tutor-chip-in inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg-sunken px-2.5 py-1 text-[12px] text-muted-foreground"
      >
        <CircleSlashIcon aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{drawing.problem ?? "Nothing was drawn."}</span>
      </span>
    );
  }

  const pending = drawing.state === "pending";
  // "Squares e4, f7" -> "Squares" + "e4, f7". A pending chip is the noun alone.
  const space = drawing.label.indexOf(" ");
  const noun = space === -1 ? drawing.label : drawing.label.slice(0, space);
  const notation = space === -1 ? "" : drawing.label.slice(space + 1);

  return (
    <button
      type="button"
      data-annotation-chip={pending ? "pending" : "drawn"}
      // Spelled out rather than left to the name computation: the label, the
      // separator and the tone are three flex children, which a browser
      // concatenates without a space ("Squares e4, f7·threat").
      aria-label={drawingChipLabel(drawing)}
      aria-pressed={pending ? undefined : active}
      aria-disabled={pending || undefined}
      title={pending ? "The tutor is still working this line out." : undefined}
      onClick={() => {
        if (!pending) onToggle(drawing);
      }}
      className={cn(
        "tutor-chip-in inline-flex max-w-full min-h-7 cursor-pointer items-center gap-1.5",
        "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
        "pointer-coarse:min-h-11 pointer-coarse:px-3",
        focusRing,
        // DESIGN.md, Chips: the selected state is "a seam fill with ivory text and a
        // brass ring". The ring is the half that actually reads — without it "this is
        // the drawing on the board right now" rested on a few percent of fill
        // lightness — and it is the same ring the leaderboard pool tabs and the room
        // cards use for selection.
        active
          ? "bg-line text-foreground ring-1 ring-primary"
          : "bg-bg-sunken text-muted-foreground hover:text-foreground",
        pending && "cursor-default opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn("tutor-tone-dot size-2 shrink-0 rounded-full", pending && "opacity-40")}
        style={
          {
            "--tutor-tone": ANNOTATION_TONE_TOKEN[drawing.tone],
            backgroundColor: ANNOTATION_TONE_TOKEN[drawing.tone],
          } as React.CSSProperties
        }
      />
      {/* No opacity step between the parts: at 12px a 70% wash of
          --muted-foreground drops under 4.5:1 on the light theme's sunken well.
          The chip is one voice; the dot and the word carry the tone.

          DESIGN.md's Scoresheet Rule: "anything a player would write on a
          scoresheet — moves, ratings, clocks, coordinates — is set in Geist Mono
          with tabular figures, never in the UI face". A chip's label is exactly two
          things — a noun the tutor is speaking ("Squares", "Arrow", "Line") and then
          notation ("e4, f7", "c4→f7", "Nxe4 Bxf7+") — so it is set in two hands, the
          way the ply label two lines above it in the same bubble already is. */}
      <span className="truncate">
        {noun}
        {notation.length > 0 ? (
          <>
            {" "}
            <span className="tabular font-mono">{notation}</span>
          </>
        ) : null}
      </span>
      <span aria-hidden className="shrink-0">
        ·
      </span>
      <span className="shrink-0">{tone}</span>
    </button>
  );
}
