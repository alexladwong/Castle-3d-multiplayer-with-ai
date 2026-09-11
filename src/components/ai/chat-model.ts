// src/components/ai/chat-model.ts  [U2]
// UI_REDESIGN §5.1: "the chat merges both in ply order".
//
// The Chat tab has two sources — the persisted `commentary` rows and the move
// list itself — and they have to interleave: the AI's line about move 12 sits
// directly under "You played Nf3". Doing that merge in a pure function keeps the
// ordering rule out of the render tree and testable on its own.
import type { Colour, GameMode } from "@/lib/types";

/** A persisted `commentary` row, flattened so the view never sees a Convex doc. */
export interface ChatCommentaryRow {
  id: string;
  /** `moves.length` AFTER the move this comments on (see convex/schema.ts). */
  ply: number;
  text: string;
  /** "hint" rows are the persisted half of FR-40 and render tagged (§5.1). */
  source: "eve" | "fallback" | "hint";
  persona?: string;
}

export type ChatItem =
  | {
      kind: "ai";
      id: string;
      ply: number;
      text: string;
      personaName: string;
      moveLabel: string;
      tag?: string;
    }
  | { kind: "you"; id: string; ply: number; text: string }
  | { kind: "system"; id: string; ply: number; text: string };

export interface BuildChatInput {
  mode: GameMode;
  /** SAN list, oldest first (`game.moves`). */
  moves: string[];
  commentary: ChatCommentaryRow[];
  /** Which colour the AI plays; undefined outside AI games. */
  aiColor?: Colour;
  /** Display name for the AI's bubbles, e.g. "Pip". */
  personaName: string;
  /** How the human's own moves are introduced: "You" for a player, a name for a spectator. */
  moverLabel: string;
}

/**
 * The persisted `persona` column carries the agent's KEY ("pip"), while the
 * thinking bubble and the composer use the display name ("Pip"). Title-case the
 * key so one conversation never shows both spellings.
 */
function displayPersona(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw.length === 0) return fallback;
  if (raw.toLowerCase() === fallback.toLowerCase()) return fallback;
  return raw[0]!.toUpperCase() + raw.slice(1);
}

/** "12." after White's move, "12…" after Black's — standard notation. */
export function plyLabel(ply: number): string {
  const moveNumber = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}…`;
}

/**
 * The persisted half of the conversation, in ply order.
 *
 * Only AI games produce bubbles: online and local games show system chips and the
 * §5.1 note instead, so their move list is not echoed here.
 */
export function buildChatItems({
  mode,
  moves,
  commentary,
  aiColor,
  personaName,
  moverLabel,
}: BuildChatInput): ChatItem[] {
  if (mode !== "ai" || aiColor === undefined) return [];

  const byPly = new Map<number, ChatCommentaryRow[]>();
  for (const row of commentary) {
    const bucket = byPly.get(row.ply);
    if (bucket) bucket.push(row);
    else byPly.set(row.ply, [row]);
  }

  const items: ChatItem[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    const ply = index + 1;
    const san = moves[index]!;
    const colour: Colour = index % 2 === 0 ? "w" : "b";

    if (colour !== aiColor) {
      items.push({
        kind: "you",
        id: `move-${ply}`,
        ply,
        text: `${moverLabel} played ${san}`,
      });
    }

    for (const row of byPly.get(ply) ?? []) {
      items.push({
        kind: "ai",
        id: row.id,
        ply,
        text: row.text,
        personaName: displayPersona(row.persona, personaName),
        moveLabel: `${plyLabel(ply)} ${san}`,
        tag: row.source === "hint" ? "Hint" : undefined,
      });
    }
  }

  // Commentary can outlive its move: a take-back shortens `moves` but leaves the
  // rows in place. Anything past the end still belongs to the conversation.
  for (const row of commentary) {
    if (row.ply <= moves.length) continue;
    items.push({
      kind: "ai",
      id: row.id,
      ply: row.ply,
      text: row.text,
      personaName: displayPersona(row.persona, personaName),
      moveLabel: plyLabel(row.ply),
      tag: row.source === "hint" ? "Hint" : undefined,
    });
  }

  return items;
}
