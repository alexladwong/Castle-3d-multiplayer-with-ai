"use client";
// src/components/ui-kit/shortcuts-dialog.tsx  [U0]
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/ui";
import { Kbd } from "./kbd";

export interface Shortcut {
  /** One entry per key cap: ["Shift", "?"] or ["←"]. */
  keys: string[];
  label: string;
  /** Heading the row is filed under, e.g. "Board". Ungrouped rows come first. */
  group?: string;
}

export interface ShortcutsDialogProps {
  shortcuts: Shortcut[];
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /** Optional trigger element; omit when the dialog is controlled by a shortcut. */
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  /** A closing line under the list — how to make a move, where reset lives. */
  note?: React.ReactNode;
  className?: string;
}

/** Keyboard help (§5.1). Groups are derived from the array, never hard-coded. */
export function ShortcutsDialog({
  shortcuts,
  open,
  onOpenChange,
  trigger,
  title = "Keyboard shortcuts",
  description = "Shortcuts are ignored while you are typing in a text box.",
  note,
  className,
}: ShortcutsDialogProps) {
  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts) {
    const key = shortcut.group ?? "";
    const existing = groups.get(key);
    if (existing) existing.push(shortcut);
    else groups.set(key, [shortcut]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      {/* §4.5: a floating layer takes the soft shadow and drops the hairline. */}
      <DialogContent className={cn("sm:max-w-md", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([group, rows]) => (
            <div key={group || "general"} className="flex flex-col gap-1.5">
              {group ? <p className="eyebrow">{group}</p> : null}
              <dl className="flex flex-col gap-1.5">
                {rows.map((row) => (
                  <div key={`${group}-${row.label}`} className="flex items-center justify-between gap-4">
                    <dt className="text-[13px] text-muted-foreground">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        {note ? (
          <p className="border-t border-border/60 pt-3 text-[12px] leading-relaxed text-muted-foreground">
            {note}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
