// src/lib/tutor/overlay.ts
// From what the tutor SAID to what the board SHOWS (docs/PRO_TUTOR.md §6).
//
// Pure: no React, no store, no AI SDK client. It reads the typed tool parts of a
// `TutorUIMessage` and returns `TutorDrawing`s — one per chip in the panel, each
// carrying the `BoardAnnotations` that chip puts on the board. The panel decides
// which of them is active; `useTutorStore` holds the answer; both boards read it.
//
// All seven tool-part states are handled (ai@7 `ToolUIPart`): input-streaming,
// input-available, approval-requested, approval-responded, output-available,
// output-error, output-denied.
import type { SquareId } from "@/lib/types";
import {
  ANNOTATION_TONE_LABEL,
  EMPTY_ANNOTATIONS,
  type AnnotationArrow,
  type AnnotationLineStep,
  type AnnotationSquare,
  type AnnotationTone,
  type BoardAnnotations,
} from "./annotations";
import { SQUARE_PATTERN, type TutorUIMessage } from "./tools";

/** How a drawing is doing: still arriving, on the board, or refused by the tool. */
export type TutorDrawingState = "pending" | "drawn" | "problem";

export interface TutorDrawing {
  /** `${messageId}#${partIndex}` (plus the tone when one call mixed tones). */
  id: string;
  messageId: string;
  tool: "highlightSquares" | "drawArrows" | "showLine";
  /** Chip text without the tone, e.g. "Squares d5, f7". */
  label: string;
  tone: AnnotationTone;
  state: TutorDrawingState;
  /** What this chip puts on the board. Empty unless `state === "drawn"`. */
  annotations: BoardAnnotations;
  /** Why nothing was drawn, in the tool's own words. */
  problem: string | null;
}

/** Whether the tutor is waiting on the player's engine, and how that ended. */
export type TutorAnalysisState = "idle" | "running" | "ready" | "engine-busy" | "unavailable";

/** The chip's full text, tone included — colour is never the only signal. */
export function drawingChipLabel(drawing: TutorDrawing): string {
  return `${drawing.label} · ${ANNOTATION_TONE_LABEL[drawing.tone]}`;
}

function squares(list: readonly string[]): SquareId[] {
  return list.filter((value) => SQUARE_PATTERN.test(value)) as SquareId[];
}

/** "d5, f7" — long lists stop at five and count the rest, so a chip stays a chip. */
function nameSquares(list: readonly SquareId[]): string {
  if (list.length <= 6) return list.join(", ");
  return `${list.slice(0, 5).join(", ")} +${list.length - 5}`;
}

function emptyAnnotations(): BoardAnnotations {
  return { squares: [], arrows: [], line: [] };
}

/* ------------------------------------------------------------ per message */

/**
 * Every drawing in one tutor message, in the order it was made.
 *
 * `highlightSquares` and `drawArrows` are drawn from the tool INPUT — the server's
 * `execute` only counts them — so they appear the moment the call is complete.
 * `showLine` is drawn from the tool OUTPUT, because only chess.js knows which
 * squares a SAN move touches, and an illegal line comes back with a reason.
 */
export function drawingsFromMessage(message: TutorUIMessage): TutorDrawing[] {
  if (message.role !== "assistant") return [];
  const out: TutorDrawing[] = [];

  message.parts.forEach((part, index) => {
    const base = { messageId: message.id, problem: null as string | null };

    if (part.type === "tool-highlightSquares") {
      // Nothing is drawn while the arguments are still streaming (a half-parsed
      // square list would flash squares the tutor never asked for), and an
      // approval-gated or denied call never ran at all.
      if (part.state !== "input-available" && part.state !== "output-available") {
        if (part.state === "output-error") {
          out.push({
            ...base,
            id: `${message.id}#${index}`,
            tool: "highlightSquares",
            label: "Squares",
            tone: "idea",
            state: "problem",
            annotations: emptyAnnotations(),
            problem: part.errorText,
          });
        }
        return;
      }
      const list = squares(part.input.squares);
      if (list.length === 0) return;
      const tone = part.input.tone;
      out.push({
        ...base,
        id: `${message.id}#${index}`,
        tool: "highlightSquares",
        label: `${list.length === 1 ? "Square" : "Squares"} ${nameSquares(list)}`,
        tone,
        state: "drawn",
        annotations: {
          squares: list.map<AnnotationSquare>((square) => ({ square, tone })),
          arrows: [],
          line: [],
        },
      });
      return;
    }

    if (part.type === "tool-drawArrows") {
      if (part.state !== "input-available" && part.state !== "output-available") {
        if (part.state === "output-error") {
          out.push({
            ...base,
            id: `${message.id}#${index}`,
            tool: "drawArrows",
            label: "Arrows",
            tone: "idea",
            state: "problem",
            annotations: emptyAnnotations(),
            problem: part.errorText,
          });
        }
        return;
      }
      // One chip per TONE, not per call: a chip names its tone, so a call that
      // mixed "idea" and "threat" has to become two chips or one of them lies.
      const byTone = new Map<AnnotationTone, AnnotationArrow[]>();
      for (const arrow of part.input.arrows) {
        if (!SQUARE_PATTERN.test(arrow.from) || !SQUARE_PATTERN.test(arrow.to)) continue;
        const list = byTone.get(arrow.tone) ?? [];
        list.push({ from: arrow.from as SquareId, to: arrow.to as SquareId, tone: arrow.tone });
        byTone.set(arrow.tone, list);
      }
      for (const [tone, arrows] of byTone) {
        out.push({
          ...base,
          id: byTone.size === 1 ? `${message.id}#${index}` : `${message.id}#${index}:${tone}`,
          tool: "drawArrows",
          label: `${arrows.length === 1 ? "Arrow" : "Arrows"} ${arrows
            .map((arrow) => `${arrow.from}→${arrow.to}`)
            .join(", ")}`,
          tone,
          state: "drawn",
          annotations: { squares: [], arrows, line: [] },
        });
      }
      return;
    }

    if (part.type === "tool-showLine") {
      const id = `${message.id}#${index}`;
      if (part.state === "input-available") {
        // The moves are known, the squares are not: the chip holds its place
        // rather than appearing after the sentence that refers to it.
        out.push({
          ...base,
          id,
          tool: "showLine",
          label: `Line ${part.input.san.join(" ")}`,
          tone: "idea",
          state: "pending",
          annotations: emptyAnnotations(),
        });
        return;
      }
      if (part.state === "output-error") {
        out.push({
          ...base,
          id,
          tool: "showLine",
          label: "Line",
          tone: "idea",
          state: "problem",
          annotations: emptyAnnotations(),
          problem: part.errorText,
        });
        return;
      }
      if (part.state !== "output-available") return;
      if (!part.output.ok) {
        out.push({
          ...base,
          id,
          tool: "showLine",
          label: `Line ${part.input.san.join(" ")}`,
          tone: "idea",
          state: "problem",
          annotations: emptyAnnotations(),
          problem: part.output.reason,
        });
        return;
      }
      const line = part.output.steps.map<AnnotationLineStep>((step) => ({
        from: step.from as SquareId,
        to: step.to as SquareId,
        san: step.san,
      }));
      if (line.length === 0) return;
      out.push({
        ...base,
        id,
        tool: "showLine",
        label: `Line ${line.map((step) => step.san).join(" ")}`,
        tone: "idea",
        state: "drawn",
        annotations: { squares: [], arrows: [], line },
      });
    }
  });

  return out;
}

/** Where the tutor's request to the player's engine has got to. */
export function analysisStateOf(message: TutorUIMessage): TutorAnalysisState {
  let state: TutorAnalysisState = "idle";
  for (const part of message.parts) {
    if (part.type !== "tool-requestAnalysis") continue;
    switch (part.state) {
      case "input-streaming":
      case "input-available":
      case "approval-requested":
      case "approval-responded":
        state = "running";
        break;
      case "output-available":
        state =
          part.output.note === "engine-busy"
            ? "engine-busy"
            : part.output.note === "engine-unavailable"
              ? "unavailable"
              : "ready";
        break;
      case "output-error":
      case "output-denied":
        state = "unavailable";
        break;
    }
  }
  return state;
}

/* --------------------------------------------------------- across messages */

/** Union of several drawings, de-duplicated by square and by arrow. */
export function mergeAnnotations(drawings: Iterable<TutorDrawing>): BoardAnnotations {
  const merged = emptyAnnotations();
  const seenSquare = new Set<string>();
  const seenArrow = new Set<string>();
  for (const drawing of drawings) {
    for (const square of drawing.annotations.squares) {
      const key = `${square.square}:${square.tone}`;
      if (seenSquare.has(key)) continue;
      seenSquare.add(key);
      merged.squares.push(square);
    }
    for (const arrow of drawing.annotations.arrows) {
      const key = `${arrow.from}${arrow.to}:${arrow.tone}`;
      if (seenArrow.has(key)) continue;
      seenArrow.add(key);
      merged.arrows.push(arrow);
    }
    // A board shows ONE candidate line: the last one wins, as the newest answer does.
    if (drawing.annotations.line.length > 0) merged.line = drawing.annotations.line;
  }
  return merged;
}

/** The newest tutor message that drew anything, with its chips. */
export function latestDrawings(
  messages: readonly TutorUIMessage[],
): { messageId: string; drawings: TutorDrawing[] } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message === undefined || message.role !== "assistant") continue;
    const drawings = drawingsFromMessage(message);
    if (drawings.some((drawing) => drawing.state === "drawn")) {
      return { messageId: message.id, drawings };
    }
  }
  return null;
}

/**
 * What `sourceId` means on the board.
 *
 * A message id selects everything that answer drew (the default, the moment the
 * tutor finishes speaking); a drawing id selects that one chip. Anything else —
 * a stale id from a cleared conversation — resolves to nothing.
 */
export function annotationsForSource(
  messages: readonly TutorUIMessage[],
  sourceId: string | null,
): BoardAnnotations | null {
  if (sourceId === null) return null;
  const messageId = sourceId.split("#")[0] ?? sourceId;
  const message = messages.find((candidate) => candidate.id === messageId);
  if (message === undefined) return null;
  const drawings = drawingsFromMessage(message).filter((drawing) => drawing.state === "drawn");
  const chosen = sourceId === messageId ? drawings : drawings.filter((d) => d.id === sourceId);
  if (chosen.length === 0) return null;
  return mergeAnnotations(chosen);
}

export { EMPTY_ANNOTATIONS };
