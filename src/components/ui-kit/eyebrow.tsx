// src/components/ui-kit/eyebrow.tsx  [U0]
import { cn } from "@/lib/ui";

export interface EyebrowProps extends React.ComponentProps<"p"> {
  /** Rendered element. Use "span" inside a heading block, "p" on its own line. */
  as?: "p" | "span" | "div";
}

/** The 13px uppercase label that sits above every headline (UI_REDESIGN §1.2). */
export function Eyebrow({ as: Tag = "p", className, ...props }: EyebrowProps) {
  return <Tag className={cn("eyebrow", className)} {...props} />;
}
