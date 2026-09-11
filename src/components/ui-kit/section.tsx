// src/components/ui-kit/section.tsx  [U0]
import { cn } from "@/lib/ui";
import { Reveal } from "./reveal";

const WIDTH_CLASS = {
  /** Marketing pages (§3): 1280 with 24px gutters. */
  wide: "max-w-[80rem]",
  /** Signed-in app frame (§4): 1200. */
  app: "max-w-[75rem]",
  /** Opt out and manage the width yourself. */
  full: "max-w-none",
} as const;

const PADDING_CLASS = {
  none: "",
  sm: "py-8 sm:py-10",
  md: "py-12 sm:py-16",
  lg: "py-16 sm:py-24",
} as const;

export interface SectionProps extends React.ComponentProps<"section"> {
  width?: keyof typeof WIDTH_CLASS;
  padding?: keyof typeof PADDING_CLASS;
  /** Fade + rise the contents in once they scroll into view (§1.3). */
  reveal?: boolean;
  /** Classes for the inner max-width container rather than the full-bleed outer. */
  innerClassName?: string;
}

/** A page band: full-bleed background, centred max-width contents (§3, §4). */
export function Section({
  width = "wide",
  padding = "md",
  reveal = false,
  className,
  innerClassName,
  children,
  ...props
}: SectionProps) {
  const inner = (
    <div className={cn("mx-auto w-full px-4 sm:px-6", WIDTH_CLASS[width], innerClassName)}>
      {children}
    </div>
  );
  return (
    <section className={cn("w-full", PADDING_CLASS[padding], className)} {...props}>
      {reveal ? <Reveal>{inner}</Reveal> : inner}
    </section>
  );
}
