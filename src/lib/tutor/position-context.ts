import { replay } from "@/lib/chess";
import type { BoardAnnotations } from "./annotations";
import type { TutorUIMessage } from "./tools";

/** Bind a drawing to its original pieces, never to whichever piece later lands there. */
export function drawingHasExpired(
  annotations: BoardAnnotations,
  origin: string[],
  moves: string[],
): boolean {
  if (origin.some((san, index) => moves[index] !== san)) return true;
  if (origin.length === moves.length) return false;
  const chess = replay(origin);
  // Arrow origins and the first move of a line identify the illustrated movers.
  // Highlight-only answers instead refer to the pieces on those squares.
  const origins = annotations.arrows.map(({ from }) => from);
  if (annotations.line[0]) origins.push(annotations.line[0].from);
  const squares = origins.length > 0 ? origins : annotations.squares.map(({ square }) => square);
  const pieces = squares.flatMap((square) => {
    const piece = chess.get(square);
    return piece ? [{ square, type: piece.type, color: piece.color }] : [];
  });
  for (const san of moves.slice(origin.length)) {
    const move = chess.move(san);
    if (pieces.some(({ square, type, color }) => {
      const current = chess.get(square);
      // The explicit origin check also catches replacing a captured piece with
      // an identical one. Position comparison handles castling and en passant.
      return move.from === square || move.to === square ||
        current?.type !== type || current?.color !== color;
    })) return true;
  }
  return false;
}

/** Questions grounded in the displayed position and the latest tutor answer. */
export function tutorSuggestions(moves: string[], ply: number, messages: TutorUIMessage[]): string[] {
  const chess = replay(moves.slice(0, ply));
  if (chess.isCheckmate()) return ["Why was that checkmate?", "Where could the losing side have defended?", "What can I learn from this game?", "Show me the decisive tactic"];
  if (chess.isDraw()) return ["Why is this position a draw?", "Could either side have played for a win?", "What can I learn from this game?", "Show me the key turning point"];

  const side = chess.turn() === "w" ? "White" : "Black";
  const lastMove = moves[ply - 1];
  const latestAnswer = messages.findLast((message) => message.role === "assistant");
  const answerIsCurrent = latestAnswer && (latestAnswer.metadata?.ply ?? ply) === ply;
  const line = answerIsCurrent ? latestAnswer.parts.findLast((part) => part.type === "tool-showLine" && part.state === "output-available") : undefined;
  const first = line?.type === "tool-showLine" && line.state === "output-available" && line.output.ok
    ? line.output.steps[0]?.san : undefined;
  const candidates = [
    ...(chess.inCheck() ? [`How should ${side} get out of check?`] : []),
    ...(first ? [`Why does ${first} work?`, "What if my opponent avoids that line?"] : []),
    ...(lastMove ? [`What changed after ${lastMove}?`] : ["How should I start this game?"]),
    `What's the plan for ${side} here?`,
    `What threats should ${side} watch for?`,
    `What's ${side}'s best move and why?`,
    "Which piece should I improve?",
    "How can I make my king safer?",
    "Can you explain the idea more simply?",
  ];
  const asked = new Set(messages.filter((message) => message.role === "user")
    .map((message) => message.parts.filter((part) => part.type === "text").map((part) => part.text).join("")));
  return [...new Set(candidates)].filter((question) => !asked.has(question)).slice(0, 4);
}
