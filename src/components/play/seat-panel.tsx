// src/components/play/seat-panel.tsx  [U5]
// The chrome the three seats of UI_UPGRADE_2 §3.2 share: an icon, a title, one
// line of host copy, the controls, and an action row at the foot.
//
// Uses the same surface, border and padding as the Settings sections.
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/ui";

export interface SeatPanelProps extends React.ComponentProps<"section"> {
  /** Seat id for the `?mode=` deep link; rendered as `data-seat`. */
  seat?: string;
  title: string;
  /** id of the `h2` the section is labelled by. Generated when omitted, so a
   *  harness that renders two of the same seat cannot duplicate an id. */
  headingId?: string;
  icon: LucideIcon;
  /** One line beneath the title. */
  line?: React.ReactNode;
  /** True for one second after a `?mode=` deep link points at this seat. */
  flash?: boolean;
  /** Buttons, laid out in a row at the foot of the panel. */
  action?: React.ReactNode;
}

export function SeatPanel({
  seat,
  title,
  headingId: headingIdProp,
  icon: Icon,
  line,
  flash = false,
  action,
  className,
  children,
  ...props
}: SeatPanelProps) {
  const generated = useId();
  const headingId = headingIdProp ?? generated;
  return (
    <section
      aria-labelledby={headingId}
      data-seat={seat}
      data-flash={flash ? "true" : undefined}
      // `scroll-mt` clears the 56px sticky header when a deep link scrolls a
      // seat into view, so the title is never parked underneath it.
      className={cn("lobby-seat scroll-mt-24 rounded-xl border border-border bg-card p-5", className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          strokeWidth={1.5}
          className="mt-[3px] size-[18px] shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {line ? (
            <p className="mt-1 max-w-[54ch] text-[13px] leading-relaxed text-muted-foreground">{line}</p>
          ) : null}
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
      {action ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </section>
  );
}

/**
 * The reason a control is unavailable, shown beside the disabled action rather
 * than only in a tooltip — a `disabled` button is not focusable, so a tooltip
 * alone reaches nobody on a keyboard (§3.2 "a tooltip that says why").
 */
export function SeatReason({ children }: { children: React.ReactNode }) {
  return <p className="lobby-micro text-muted-foreground">{children}</p>;
}
