"use client";
// src/components/game/persona-header.tsx  [U2]
// UI_UPGRADE_2 §4.4, the plate at the top of the Chat tab: lettered brass disc,
// name, "{label} · {rating}" in mono, and a status line that is the game's live
// truth — "thinking…" while the engine runs, "to move" with a baize dot when it
// is the opponent's turn, "your move" when it is yours, "watching" for
// spectators.
//
// Structural, not floating: hairline and tone, no shadow.
import { cn } from "@/lib/ui";

export type PersonaStatus = "thinking" | "their-move" | "your-move" | "watching" | "over";

export interface PersonaHeaderProps extends React.ComponentProps<"div"> {
  /** "Pip", "adrienne", "Player 2". */
  name: string;
  /** "Beginner · 800", "Online · 1311", "Same device". */
  meta?: string;
  status: PersonaStatus;
  /** Overrides the letter on the disc. */
  initial?: string;
}

const STATUS_TEXT: Record<PersonaStatus, string> = {
  thinking: "thinking",
  "their-move": "to move",
  "your-move": "your move",
  watching: "watching",
  over: "game over",
};

/** Three pulsing dots, the same vocabulary the thinking bubble uses. */
function ThinkingDots() {
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="game-typing-dot size-1 rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

export function PersonaHeader({
  name,
  meta,
  status,
  initial,
  className,
  ...props
}: PersonaHeaderProps) {
  const letter = initial ?? name[0]?.toUpperCase() ?? "?";

  return (
    <div
      data-slot="persona-header"
      className={cn(
        "flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-3 py-2",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-medium text-primary-foreground"
      >
        {letter}
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {meta ? (
          <p className="tabular truncate font-mono text-[12px] text-muted-foreground">{meta}</p>
        ) : null}
      </div>

      <p
        // Not a live region: the chat's own announcer speaks what the opponent
        // says, and a second voice repeating "thinking" every turn is noise.
        className={cn(
          "ml-auto flex shrink-0 items-center gap-1.5 text-[12px] leading-none font-medium",
          status === "their-move" && "text-live",
          status === "thinking" && "text-muted-foreground",
          status !== "their-move" && status !== "thinking" && "text-muted-foreground",
        )}
      >
        {status === "their-move" ? (
          <span aria-hidden className="game-lamp size-1.5 rounded-full bg-live" data-lit="true" />
        ) : null}
        <span>{STATUS_TEXT[status]}</span>
        {status === "thinking" ? <ThinkingDots /> : null}
      </p>
    </div>
  );
}
