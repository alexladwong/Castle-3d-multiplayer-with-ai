"use client";
// src/components/play/local-setup.tsx  [U5]
// "Same device" — the third seat of UI_UPGRADE_2 §3.2. One visible label, one
// field, one button, and nothing else: "No other fields."
//
// Pinned: the label text "Player 2 name", MAX_LOCAL_NAME_LENGTH, and a button
// named "Start the game" that is visible on load without any click.
import { useId, useState } from "react";
import { UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_LOCAL_NAME_LENGTH } from "@/lib/constants";
import { SeatPanel, SeatReason } from "./seat-panel";

export interface LocalSetupProps {
  /** Seat id for the `?mode=` deep link. */
  seat?: string;
  /** Empty string means "use the default Player 2 name". */
  onStart(playerTwoName: string): void;
  starting?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  flash?: boolean;
}

export function LocalSetup({
  seat,
  onStart,
  starting = false,
  disabled = false,
  disabledReason,
  flash = false,
  ...rest
}: LocalSetupProps & Omit<React.ComponentProps<"section">, keyof LocalSetupProps>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [playerTwoName, setPlayerTwoName] = useState("");

  return (
    <SeatPanel
      seat={seat}
      icon={UsersIcon}
      title="Pass and play"
      flash={flash}
      line="Two people, one device. The board turns to face whoever is to move."
      {...rest}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (starting || disabled) return;
          onStart(playerTwoName.trim());
        }}
      >
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor={id} className="lobby-micro font-medium text-muted-foreground">
            Player 2 name
          </Label>
          <Input
            id={id}
            value={playerTwoName}
            maxLength={MAX_LOCAL_NAME_LENGTH}
            placeholder="Player 2"
            autoComplete="off"
            aria-describedby={hintId}
            disabled={disabled}
            onChange={(event) => setPlayerTwoName(event.target.value)}
            className="h-9"
          />
          <p id={hintId} className="lobby-micro text-muted-foreground">
            Optional. You play White, and the game is never rated.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="lg"
            variant="outline"
            disabled={starting || disabled}
            title={disabled ? disabledReason : undefined}
            className="min-w-40 cursor-pointer py-2"
          >
            {starting ? "Starting…" : "Start the game"}
          </Button>
          {disabled && disabledReason ? <SeatReason>{disabledReason}</SeatReason> : null}
        </div>
      </form>
    </SeatPanel>
  );
}
