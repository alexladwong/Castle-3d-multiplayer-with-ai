"use client";
// src/components/tutor/tutor-composer.tsx
// Asking the tutor a question: context-aware suggestions submit immediately,
// with a context line that says which position
// the answer will be about, and a field with a visible label — Enter sends,
// Shift+Enter starts a new line.
import { useId, useRef } from "react";
import { SendHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/ui";

export interface TutorComposerProps {
  value: string;
  onChange(value: string): void;
  onSend(text?: string): void;
  suggestions: readonly string[];
  /** "Live position · move 14" or "Reviewing move 8". */
  context: string;
  /** Non-null disables the field and says why, in words, next to it. */
  disabledReason: string | null;
  className?: string;
}

export function TutorComposer({
  value,
  onChange,
  onSend,
  suggestions,
  context,
  disabledReason,
  className,
}: TutorComposerProps) {
  const fieldId = useId();
  const reasonId = useId();
  const field = useRef<HTMLTextAreaElement | null>(null);
  const disabled = disabledReason !== null;
  const empty = value.trim().length === 0;

  return (
    <div className={cn("flex shrink-0 flex-col gap-2 border-t border-border p-3", className)}>
      {/* §3.4: which position the answer will be about, so a member reviewing move
          8 is never surprised by an answer about move 14. */}
      <p className="tabular font-mono text-[12px] text-muted-foreground">{context}</p>

      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return;
              onSend(suggestion);
              field.current?.focus();
            }}
            // A GHOST pill: hairline, no fill, no tone dot. The annotation chips in
            // the bubbles above are filled and carry a dot because they report state
            // — "this drawing is on the board" — and toggle it. These compose a
            // question. They were the same object at 28px on the same cellar fill,
            // and "Show me the threats" appeared as both, verbatim, on one screen.
            className={cn(
              "min-h-7 cursor-pointer rounded-full border border-border px-2.5 py-1 text-[12px]",
              "text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
              "pointer-coarse:min-h-11 pointer-coarse:px-3",
              focusRing,
              disabled && "cursor-default opacity-50 hover:text-muted-foreground",
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <label htmlFor={fieldId} className="text-[12px] font-medium text-foreground">
        Ask the tutor
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
          ref={field}
          rows={1}
          value={value}
          // `readOnly`, not `disabled`. A disabled textarea is dropped from the tab
          // order the instant it becomes disabled — which happens the moment an
          // answer starts streaming, with the member's focus still in it, so focus
          // fell to <body>, outside the overlay's own focus trap, mid-answer.
          // `readOnly` + `aria-disabled` says the same thing to AT and keeps the
          // caret where the member put it.
          readOnly={disabled}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          placeholder="Why is this square weak?"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter is a new line. An IME composition owns the
            // key while it is open, or a Japanese candidate list would send.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!empty && !disabled) onSend();
          }}
          className={cn(
            "min-h-9 w-full min-w-0 resize-none rounded-lg border border-input bg-transparent",
            "px-2.5 py-2 text-[13px] text-foreground transition-colors outline-none",
            "field-sizing-content max-h-32 placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
            "pointer-coarse:min-h-11 dark:bg-input/30",
          )}
        />
        <Button
          size="icon"
          aria-label="Send"
          disabled={disabled || empty}
          className="shrink-0 pointer-coarse:size-11"
          onClick={() => onSend()}
        >
          <SendHorizontalIcon aria-hidden />
        </Button>
      </div>
      {disabled ? (
        <p id={reasonId} className="text-[12px] text-muted-foreground">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
