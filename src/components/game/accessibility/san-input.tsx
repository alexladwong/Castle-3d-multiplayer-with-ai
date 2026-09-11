"use client";
// src/components/game/accessibility/san-input.tsx  [P3 → U2 §4.8 item 6]
// NFR-7: keyboard move entry. Accepts SAN ("Nf3", "exd5", "O-O") and LAN
// ("e2e4") — the controller parses it with chess.js's permissive parser.
//
// Off turn the field is `aria-disabled` with a reason rather than `disabled`: a
// disabled input drops out of the tab order and takes the explanation with it,
// so a keyboard player who tabs here off-turn is told nothing at all.
import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui";

export interface SanInputProps {
  disabled: boolean;
  /** Why it cannot be used right now, e.g. "It is not your move yet." */
  disabledReason?: string;
  onSubmitSan(san: string): Promise<void>;
}

export function SanInput({ disabled, disabledReason, onSubmitSan }: SanInputProps) {
  const id = useId();
  const [value, setValue] = useState("");

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (disabled) return;
      const text = value.trim();
      if (text.length === 0) return;
      setValue("");
      await onSubmitSan(text);
    },
    [disabled, value, onSubmitSan],
  );

  const reason = disabled ? (disabledReason ?? "It is not your move yet.") : null;

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          Move (SAN or e2e4)
        </Label>
        <Input
          id={id}
          name="san"
          value={value}
          aria-disabled={disabled || undefined}
          readOnly={disabled}
          className={cn(disabled && "cursor-not-allowed bg-muted text-muted-foreground")}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Nf3"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className={reason ? "text-[12px] text-muted-foreground" : "sr-only"}>
          {reason ?? "Type a move in standard algebraic notation and press Enter to play it."}
        </p>
      </div>
      <Button
        type="submit"
        aria-disabled={disabled || value.trim().length === 0 || undefined}
        // Unavailable in colour rather than behind a 50% veil: the label has to
        // stay readable while the help line explains why it cannot be pressed.
        className={cn(
          "shrink-0",
          "aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-muted-foreground",
        )}
      >
        Play
      </Button>
    </form>
  );
}
