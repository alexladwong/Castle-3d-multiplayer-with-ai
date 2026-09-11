"use client";
// src/components/ui-kit/action-bar.tsx  [U0]
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/ui";
import { Kbd } from "./kbd";

export interface ActionBarProps extends React.ComponentProps<"div"> {
  /** Accessible name for the toolbar, e.g. "Game actions". */
  label: string;
  /**
   * "default" sits in the page's structure under the board; "focus" is the bar
   * that floats over the board in the fullscreen layout (§5.2).
   */
  variant?: "default" | "focus";
}

/** The always-visible row of labelled game actions (§5.1). */
export function ActionBar({ label, variant = "default", className, ...props }: ActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn(
        // WRAPS, never scrolls. Ten labelled actions are ~974px wide and the board
        // column is 861px at 1280 and 1023px at 1440, so the old `overflow-x-auto`
        // meant the last actions were simply off the end of a bar nobody thinks to
        // scroll. §5.1's rule is that every game action is visible and labelled, so
        // the bar takes a second line instead — the board box above it is `flex-1`
        // inside the column, so the square recomputes off the height that is left.
        "flex w-full flex-wrap items-center gap-x-0.5 gap-y-1 rounded-xl",
        // UI_UPGRADE_2 §4.5: structural layers carry a hairline and no shadow;
        // floating layers rely on the soft shadow ALONE and drop the hairline —
        // a 1px edge under a 60px blur is the generated-UI signature the
        // detector calls `gpt-thin-border-wide-shadow`.
        variant === "focus" ? "shadow-soft" : "border border-border",
        // Buttons run tighter inside a bar than they do standing alone (8px flanks,
        // 4px icon-to-label, against the base 10px/6px): that is ~110px across ten
        // actions, and it is the difference between one line and two at 1440.
        // Reached by element, not by `[data-slot=button]`: every action here is a
        // Button rendered THROUGH `TooltipTrigger`, and Base UI's `render` merge
        // lets the outer part win the attribute, so each one is
        // `data-slot="tooltip-trigger"` in the DOM.
        "[&_button]:gap-1 [&_button]:px-2",
        // §4.3's touch floor, inherited by every button in the bar rather than
        // patched at the call sites.
        "[&_button]:pointer-coarse:min-h-9",
        "bg-card p-1.5",
        className,
      )}
      {...props}
    />
  );
}

/** A related run of actions inside an ActionBar (View / Game / More). */
export function ActionGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    // `shrink-0` matters: the buttons inside a group cannot shrink (the Button base
    // sets `shrink-0`), so a group that CAN shrink gets squeezed by the flex line
    // and its children spill over the group beside it — at 1440px "Resign" sat
    // underneath "PGN" and could not be clicked at its own centre. Holding the
    // group's width instead is what lets the bar wrap a whole group onto the next
    // line rather than tearing one in half.
    <div className={cn("flex shrink-0 items-center gap-1", className)} {...props} />
  );
}

/** Hairline between two ActionGroups. */
export function ActionSeparator({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span aria-hidden className={cn("mx-0.5 h-5 w-px shrink-0 bg-border", className)} {...props} />
  );
}

const BUTTON_VARIANT = {
  default: "ghost",
  primary: "default",
  danger: "destructive",
} as const;

/** From which breakpoint the text label is *visible*; it stays in the a11y tree always. */
const LABEL_CLASS = {
  always: "",
  lg: "sr-only lg:not-sr-only",
  xl: "sr-only xl:not-sr-only",
} as const;

export interface ActionButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "variant" | "children"> {
  icon: LucideIcon;
  label: string;
  /** Key that triggers the same action, shown in the tooltip. */
  shortcut?: string;
  /** Longer description for the tooltip; defaults to the label. */
  tooltip?: string;
  /**
   * Set to explain why the action cannot be used. The button becomes
   * `aria-disabled` (not `disabled`, which would swallow hover and hide the
   * explanation) and the tooltip states the reason.
   */
  disabledReason?: string;
  variant?: keyof typeof BUTTON_VARIANT;
  labelFrom?: keyof typeof LABEL_CLASS;
  /** Trailing counter, e.g. "2 left". */
  badge?: React.ReactNode;
}

/** One action: icon + label + shortcut tooltip, never a bare icon (§5.1). */
export function ActionButton({
  icon: Icon,
  label,
  shortcut,
  tooltip,
  disabledReason,
  variant = "default",
  labelFrom = "lg",
  badge,
  className,
  onClick,
  ...props
}: ActionButtonProps) {
  const blocked = Boolean(disabledReason);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            // DESIGN.md Buttons: 32px tall by default (`size="default"`), 36px for
            // the large size (`size="lg"`) — shadcn's `sm` is 28px and was off the
            // token. A caller may still override: `props` is spread after this.
            size="default"
            variant={BUTTON_VARIANT[variant]}
            aria-disabled={blocked || undefined}
            className={cn(
              // §4.8 item 3: a 36px floor wherever the pointer is a thumb. Applied
              // here (and on the shared Button) so the focus HUD and the mobile
              // sheet inherit it instead of patching it per call site.
              "shrink-0 pointer-coarse:min-h-9",
              blocked && "opacity-50",
              className,
            )}
            onClick={(event) => {
              if (blocked) {
                event.preventDefault();
                return;
              }
              onClick?.(event);
            }}
            {...props}
          />
        }
      >
        <Icon aria-hidden />
        <span className={LABEL_CLASS[labelFrom]}>{label}</span>
        {/* The leading space is load-bearing: an accessible name is the concatenated
            text of the inline children with no separator inserted, so without it the
            Hint button announced as "Hint2 left". */}
        {/* The badge follows the LABEL: below the label breakpoint the bar is
            icon-only, and "2 left" beside a bulb with no noun is unanswerable. The
            tooltip carries it there instead (see `tooltip` at the call site). */}
        {badge ? (
          <span
            className={cn(
              "tabular text-[12px] font-medium text-muted-foreground",
              LABEL_CLASS[labelFrom],
            )}
          >
            {" "}
            {badge}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {disabledReason ?? tooltip ?? label}
        {shortcut && !blocked ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}
