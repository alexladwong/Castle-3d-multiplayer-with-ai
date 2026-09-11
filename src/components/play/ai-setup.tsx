"use client";
// src/components/play/ai-setup.tsx  [U5]
// "The opponent" seat of UI_UPGRADE_2 §3.2: the five personas as 44px lettered
// discs, the selected one speaking a line in their own voice, the colour choice
// as a three-way segmented control, and one primary button that names them.
//
// The pinned semantics survive verbatim from the previous round: a
// `role="group" aria-label="Opponent"` whose buttons are named EXACTLY by the
// persona ("Pip", not "Pip Beginner 800"), each carrying `aria-pressed`; the
// colour group labelled by `#ai-colour-label`; and the submit reading
// `Play {persona.name}`. e2e/auth.spec.ts pins all four.
import { useRef, useState } from "react";
import { BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/ui-kit";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/lib/difficulty";
import { formatRating } from "@/lib/format";
import { MAX_HINTS_PER_GAME } from "@/lib/constants";
import type { Colour, Difficulty } from "@/lib/types";
import { cn, focusRing } from "@/lib/ui";
import { SeatPanel, SeatReason } from "./seat-panel";
import { SAMPLE_LINE } from "./personas";
import { rovingArrowKeys } from "./roving";

export type ColourChoice = Colour | "random";

const COLOUR_OPTIONS: ReadonlyArray<{ value: ColourChoice; label: string; hint: string }> = [
  { value: "w", label: "White", hint: "You move first." },
  { value: "b", label: "Black", hint: "The opponent opens." },
  { value: "random", label: "Random", hint: "Decided on the first move." },
];

/* ------------------------------------------------------------------ roster */

function PersonaDisc({
  id,
  selected,
  onSelect,
  disabled,
}: {
  id: Difficulty;
  selected: boolean;
  onSelect(id: Difficulty): void;
  disabled: boolean;
}) {
  const config = DIFFICULTIES[id];
  const metaId = `ai-persona-${id}-meta`;

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      {/*
       * The accessible name is exactly the persona's name, so the disc and the
       * label live inside the button and the rating line stays outside it,
       * reached through `aria-describedby`. Putting the meta line in the button
       * would rename it to "Pip Beginner · 800" and break the pinned selector.
       */}
      <button
        type="button"
        aria-pressed={selected}
        aria-describedby={metaId}
        disabled={disabled}
        onClick={() => onSelect(id)}
        className={cn(
          "flex w-full min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 py-1.5",
          "transition-colors duration-150",
          focusRing,
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "hover:bg-secondary/60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full p-2 text-base font-medium",
            "transition-colors duration-150",
            // DESIGN.md, Chips: "selected chips switch to a seam fill with ivory text
            // and a brass ring" — not a brass fill. The One Metal Rule wants exactly
            // one brass fill per view, and in this seat that is the primary button.
            selected
              ? "bg-secondary text-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {config.persona.name[0]}
        </span>
        <span
          className={cn(
            "lobby-micro w-full truncate",
            selected ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {config.persona.name}
        </span>
      </button>

      {/* §3.2.2: ONE micro/mono line with the middot, exactly as the landing roster
          and the game's persona plate set it. It used to be split into two centred
          lines for every persona to protect the one — "Grandmaster · 2300" — that
          cannot fit a 108px column; letting that single case wrap at the middot
          costs nothing and gives the other four the line the spec asks for. */}
      <span
        id={metaId}
        className="lobby-micro w-full text-center text-muted-foreground"
      >
        {config.label} <span aria-hidden>·</span>{" "}
        <span className="lobby-data">{formatRating(config.aiRating)}</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------- colour segmented */

function ColourSegment({
  option,
  selected,
  onSelect,
  disabled,
}: {
  option: (typeof COLOUR_OPTIONS)[number];
  selected: boolean;
  onSelect(value: ColourChoice): void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={option.hint}
      onClick={() => onSelect(option.value)}
      className={cn(
        "h-9 flex-1 cursor-pointer rounded-[0.5rem] px-3 py-2 text-sm font-medium",
        "transition-colors duration-150",
        focusRing,
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Same selected treatment as the roster disc above: seam, ivory, brass ring.
        selected
          ? "bg-secondary text-foreground ring-2 ring-primary ring-inset"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {option.label}
    </button>
  );
}

/* -------------------------------------------------------------------- seat */

export interface AiSetupProps {
  /** Seat id for the `?mode=` deep link. */
  seat?: string;
  /** Fires with the resolved colour — "random" is decided here, in the handler. */
  onStart(difficulty: Difficulty, playerColor: Colour): void;
  starting?: boolean;
  disabled?: boolean;
  /** Why the seat is unavailable, shown beside the disabled button. */
  disabledReason?: string;
  /** Shown above the roster when the player was just taken out of the queue. */
  notice?: string;
  /** True when this seat owns the lobby's one brass button (§3.2). */
  primary?: boolean;
  flash?: boolean;
  /** Mirrors the choices out so the table preview can follow them. */
  onColourChange?(colour: ColourChoice): void;
  onDifficultyChange?(difficulty: Difficulty): void;
}

export function AiSetup({
  seat,
  onStart,
  starting = false,
  disabled = false,
  disabledReason,
  notice,
  primary = false,
  flash = false,
  onColourChange,
  onDifficultyChange,
  ...rest
}: AiSetupProps & Omit<React.ComponentProps<"section">, keyof AiSetupProps>) {
  const [difficulty, setDifficulty] = useState<Difficulty>("casual");
  const [colour, setColour] = useState<ColourChoice>("w");
  const rosterRef = useRef<HTMLDivElement | null>(null);
  const colourRef = useRef<HTMLDivElement | null>(null);
  const config = DIFFICULTIES[difficulty];

  function pickDifficulty(id: Difficulty) {
    setDifficulty(id);
    onDifficultyChange?.(id);
  }

  function pickColour(value: ColourChoice) {
    setColour(value);
    onColourChange?.(value);
  }

  function start() {
    if (starting || disabled) return;
    // Math.random() in an event handler, never during render (react-hooks/purity).
    const playerColor: Colour = colour === "random" ? (Math.random() < 0.5 ? "w" : "b") : colour;
    onStart(difficulty, playerColor);
  }

  return (
    <SeatPanel
      seat={seat}
      icon={BotIcon}
      title="Play the AI"
      flash={flash}
      line="Five opponents. Each one picks a move, then tells you what it makes of yours."
      action={
        <>
          <Button
            size="lg"
            variant={primary ? "default" : "outline"}
            onClick={start}
            disabled={starting || disabled}
            title={disabled ? disabledReason : undefined}
            className="min-w-40 cursor-pointer py-2"
          >
            {starting ? "Starting…" : `Play ${config.persona.name}`}
          </Button>
          {disabled && disabledReason ? <SeatReason>{disabledReason}</SeatReason> : null}
        </>
      }
      {...rest}
    >
      {notice ? (
        <p className="lobby-body mb-4 rounded-[0.75rem] bg-bg-sunken px-3 py-2 text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <div
        ref={rosterRef}
        role="group"
        aria-label="Opponent"
        className="lobby-roster"
        onKeyDown={(event) => rovingArrowKeys(event, rosterRef.current)}
      >
        {DIFFICULTY_ORDER.map((id) => (
          <PersonaDisc
            key={id}
            id={id}
            selected={id === difficulty}
            onSelect={pickDifficulty}
            disabled={disabled}
          />
        ))}
      </div>

      {/* The selected opponent speaks. One bubble, their own line. */}
      <ul className="mt-5 grid gap-2">
        <ChatMessage variant="ai" personaName={config.persona.name}>
          {SAMPLE_LINE[difficulty]}
        </ChatMessage>
      </ul>
      <p className="lobby-micro mt-2 pl-9 text-muted-foreground">
        {config.label}
        <span className="lobby-data"> · {formatRating(config.aiRating)}</span>
        {config.hintsAllowed ? ` · ${MAX_HINTS_PER_GAME} hints` : null}
      </p>

      <div className="mt-5 grid max-w-xs gap-2">
        <span id="ai-colour-label" className="lobby-micro text-muted-foreground">
          Your colour
        </span>
        <div
          ref={colourRef}
          role="group"
          aria-labelledby="ai-colour-label"
          className="flex gap-1 rounded-[0.625rem] bg-bg-sunken p-1"
          onKeyDown={(event) => rovingArrowKeys(event, colourRef.current)}
        >
          {COLOUR_OPTIONS.map((option) => (
            <ColourSegment
              key={option.value}
              option={option}
              selected={option.value === colour}
              onSelect={pickColour}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </SeatPanel>
  );
}
