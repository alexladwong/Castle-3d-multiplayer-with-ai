// @vitest-environment node
// src/components/ui-kit/__tests__/action-bar.test.tsx  [U0]
//
// Same house style as mini-board.test.tsx: there is no jsdom in this repo, so the
// bar is asserted against the static markup it renders. That is enough for the two
// things DESIGN.md actually pins down here — where a shadow is allowed, and how
// tall a control is.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlagIcon } from "lucide-react";

import { ActionBar, ActionButton, ActionGroup } from "../action-bar";

/** The class list of the first element in the markup. */
function rootClasses(markup: string): string {
  return /class="([^"]*)"/.exec(markup)?.[1] ?? "";
}

describe("ActionBar", () => {
  it("is a labelled toolbar", () => {
    const markup = renderToStaticMarkup(<ActionBar label="Game actions" />);
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Game actions"');
  });

  it("casts no shadow by default — it is part of the page, not floating over it", () => {
    const markup = renderToStaticMarkup(<ActionBar label="Game actions" />);
    expect(rootClasses(markup)).not.toContain("shadow-soft");
    // It still separates itself the way DESIGN.md says structure should: tone plus
    // a hairline.
    expect(rootClasses(markup)).toContain("border-border");
    expect(rootClasses(markup)).toContain("bg-card");
  });

  it('takes the soft shadow only in the floating "focus" variant', () => {
    const markup = renderToStaticMarkup(<ActionBar label="Game actions" variant="focus" />);
    expect(rootClasses(markup)).toContain("shadow-soft");
  });

  it("drops the hairline once it floats — UI_UPGRADE_2 §4.5", () => {
    // A 1px edge under a 60px blur is the generated-UI signature the detector
    // calls `gpt-thin-border-wide-shadow`. Structure gets the edge; floating
    // layers get the shadow, and never both.
    const markup = renderToStaticMarkup(<ActionBar label="Game actions" variant="focus" />);
    expect(rootClasses(markup)).not.toContain("border-border");
  });
});

describe("ActionGroup", () => {
  it("holds its width so buttons overflow the bar rather than each other", () => {
    const markup = renderToStaticMarkup(<ActionGroup />);
    // Without this the flex line squeezes the group while its `shrink-0` buttons
    // keep their size, and the last button of one group lands on top of the first
    // button of the next.
    expect(rootClasses(markup)).toContain("shrink-0");
  });
});

describe("ActionButton", () => {
  it("is 32px tall, the DESIGN.md button token", () => {
    const markup = renderToStaticMarkup(<ActionButton icon={FlagIcon} label="Resign" />);
    expect(markup).toContain("h-8");
    // shadcn's `sm` size, which the bar used to take, is 28px.
    expect(markup).not.toContain("h-7");
  });

  it("holds a 36px floor wherever the pointer is a thumb (§4.8 item 3)", () => {
    const markup = renderToStaticMarkup(<ActionButton icon={FlagIcon} label="Resign" />);
    expect(markup).toContain("pointer-coarse:min-h-9");
  });

  it("keeps the label in the accessible name once it is visually hidden", () => {
    const markup = renderToStaticMarkup(
      <ActionButton icon={FlagIcon} label="Resign" labelFrom="xl" />,
    );
    expect(markup).toContain("sr-only xl:not-sr-only");
    expect(markup).toContain("Resign");
  });

  it("separates a badge from the label so it never announces as one word", () => {
    const markup = renderToStaticMarkup(
      <ActionButton icon={FlagIcon} label="Ask for a hint" badge="2 left" />,
    );
    // The leading space is load-bearing: "Ask for a hint2 left" otherwise.
    expect(markup).toMatch(/Ask for a hint<\/span><span[^>]*> 2 left<\/span>/);
  });

  it("blocks rather than disables, so the reason stays reachable", () => {
    const markup = renderToStaticMarkup(
      <ActionButton icon={FlagIcon} label="Take back" disabledReason="Nothing to take back." />,
    );
    expect(markup).toContain('aria-disabled="true"');
    // A real `disabled` attribute would swallow hover and focus with the reason.
    expect(markup).not.toMatch(/\sdisabled[=\s>]/);
  });
});
