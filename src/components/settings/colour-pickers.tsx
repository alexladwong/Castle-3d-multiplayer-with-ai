"use client";

import { Label } from "@/components/ui/label";
import type { RoomColors } from "@/lib/types";

type Channel = keyof RoomColors;

const CHANNELS: ReadonlyArray<{ key: Channel; label: string; hint: string }> = [
  { key: "background", label: "Background", hint: "The flat colour behind the board" },
  { key: "lightSquare", label: "Light squares", hint: "" },
  { key: "darkSquare", label: "Dark squares", hint: "" },
];

/**
 * FR-21j: "live preview as you drag".
 *
 * React's `onChange` on `<input type="color">` is the DOM **input** event, which
 * fires on every drag tick — the DOM `change` event only fires when the picker is
 * dismissed and would give a preview that updates once, at the end. So `onChange`
 * drives the store (instant, no network) and `onBlur` nudges the debounced Convex
 * write; the writer coalesces either way, so a drag never becomes one mutation
 * per tick (FR-21l).
 */
export function ColourPickers({
  value,
  onPreview,
  onCommit,
  disabled,
}: {
  value: RoomColors;
  onPreview: (next: RoomColors) => void;
  onCommit: (next: RoomColors) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {CHANNELS.map((channel) => {
        const id = `room-colour-${channel.key}`;
        const hex = value[channel.key];
        return (
          <div key={channel.key} className="flex items-center gap-3">
            <input
              id={id}
              type="color"
              value={hex}
              disabled={disabled}
              onChange={(event) => onPreview({ ...value, [channel.key]: event.target.value })}
              onBlur={(event) => onCommit({ ...value, [channel.key]: event.currentTarget.value })}
              className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0"
            />
            <div className="min-w-0 flex-1">
              <Label htmlFor={id}>{channel.label}</Label>
              {channel.hint ? (
                <p className="text-xs text-muted-foreground">{channel.hint}</p>
              ) : null}
            </div>
            <code className="shrink-0 font-mono text-xs text-muted-foreground uppercase tabular-nums">
              {hex}
            </code>
          </div>
        );
      })}
    </div>
  );
}
