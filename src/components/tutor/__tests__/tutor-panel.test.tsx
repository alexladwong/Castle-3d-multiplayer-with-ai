// @vitest-environment node
// src/components/tutor/__tests__/tutor-panel.test.tsx
//
// Static markup only (no jsdom in this repo — see ui-kit/__tests__). What is pinned
// here is docs/PRO_TUTOR.md §3's COPY, which is contract text, and which of the
// panel's states each input produces.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `useTutorAccess` calls Clerk's `useAuth` unconditionally, and there is no
// ClerkProvider in a static render. The context override is what the panel actually
// reads; this mock only keeps the fallback from throwing.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, has: undefined }),
}));

const { TutorAccessProvider } = await import("../access");
const { TutorPanelView } = await import("../tutor-panel");
const { useTutorStore } = await import("@/lib/stores/tutor-store");
const { MAX_TUTOR_TURNS_PER_GAME } = await import("@/lib/constants");
type Messages = Parameters<typeof TutorPanelView>[0]["messages"];

function render(
  hasTutor: boolean | undefined,
  props: Partial<Parameters<typeof TutorPanelView>[0]> = {},
) {
  return renderToStaticMarkup(
    <TutorAccessProvider value={{ hasTutor }}>
      <TutorPanelView
        messages={[]}
        status="ready"
        error={null}
        moves={["e4", "e5"]}
        ply={2}
        reviewing={false}
        gameId="game-1"
        onSend={() => undefined}
        onRetry={() => undefined}
        {...props}
      />
    </TutorAccessProvider>,
  );
}

beforeEach(() => {
  useTutorStore.setState({ annotations: null, sourceId: null, panelOpen: true });
});

describe("the header plate", () => {
  it("shows the monogram, the name and the Pro chip for a member", () => {
    const markup = render(true);
    expect(markup).toContain(">Tutor<");
    expect(markup).toContain(">Pro<");
    expect(markup).toContain('aria-label="Hide tutor"');
  });

  it("drops the Pro chip when the tutor is locked", () => {
    expect(render(false)).not.toContain(">Pro<");
  });

  // The other half of this rule — the button APPEARING once a drawing lands — is
  // pinned in e2e/tutor.spec.ts. A static render reads zustand's server snapshot,
  // which is the store's INITIAL state, so `setState` cannot be seen from here.
  it("does not offer to clear a board with nothing on it", () => {
    expect(render(true)).not.toContain("Clear board notes");
  });
});

describe("the locked state", () => {
  it("says what the tutor does, shows three example questions and one way in", () => {
    const markup = render(false);
    expect(markup).toContain(
      "Ask about any position, in any game. The tutor explains the idea and draws it on the board.",
    );
    expect(markup).toContain("Why was that a mistake?");
    expect(markup).toContain("What&#x27;s the plan here?");
    expect(markup).toContain("Show me the threats");
    expect(markup).toContain('href="/pro"');
    expect(markup).toContain("Go Pro");
    expect(markup).toContain("Monthly. Cancel any time.");
    // No fake conversation, and nothing to type into.
    expect(markup).not.toContain('role="log"');
    expect(markup).not.toContain("Ask the tutor");
  });

  it("shows the same wall, with the reason, if the route ever answers 402", () => {
    const markup = render(true, { error: "pro-required" });
    expect(markup).toContain("Pro is needed for the tutor.");
    expect(markup).toContain("Go Pro");
  });
});

describe("the unlocked state", () => {
  it("opens on one tutor bubble rather than an empty box", () => {
    const markup = render(true);
    expect(markup).toContain("Ask me about any position. I will explain and mark the board.");
    expect(markup).toContain('role="log"');
  });

  it("names the position the answer will be about", () => {
    expect(render(true)).toContain("Live position · move 1");
    expect(render(true, { reviewing: true, ply: 16 })).toContain("Reviewing move 8");
  });

  it("carries the four suggestions and the composer's visible label", () => {
    const markup = render(true);
    for (const suggestion of [
      "What changed after e5?",
      "What&#x27;s the plan for White here?",
      "What threats should White watch for?",
      "What&#x27;s White&#x27;s best move and why?",
    ]) {
      expect(markup).toContain(suggestion);
    }
    expect(markup).toContain("Ask the tutor");
  });

  it("shows the thinking row while the tutor is still on it", () => {
    const markup = render(true, { status: "submitted" });
    expect(markup).toContain("Tutor is looking at the position…");
  });

  it("says the engine was busy, and still expects an answer", () => {
    const messages: Messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-requestAnalysis",
            toolCallId: "a1",
            state: "output-available",
            input: { depth: 16, multiPv: 3 },
            output: { fen: "8/8/8/8/8/8/8/8 w - - 0 1", lines: [], note: "engine-busy" },
          },
          { type: "text", text: "Even without the engine, f7 is the square." },
        ],
      },
    ];
    const markup = render(true, { messages });
    expect(markup).toContain(
      "The engine is busy with the opponent&#x27;s move; the tutor will answer without analysis.",
    );
    expect(markup).toContain("Even without the engine, f7 is the square.");
  });

  it("offers a retry when the tutor did not answer at all", () => {
    const markup = render(true, { error: "network" });
    expect(markup).toContain("The tutor did not answer. Try again.");
    expect(markup).toContain("Try again");
  });

  it("names the cap, and closes the composer, when the game is out of questions", () => {
    const markup = render(true, { error: "quota" });
    expect(markup).toContain(
      `The tutor has answered ${MAX_TUTOR_TURNS_PER_GAME} questions in this game. Start a new game to keep going.`,
    );
    expect(markup).toContain("disabled");
  });

  it("says a missing tutor is missing, and offers nothing to retry", () => {
    // 503 `tutor-unavailable` (guard.ts): no gateway credential, so a retry cannot
    // help. The line is shown, the retry button is not, and the composer closes.
    const markup = render(true, { error: "unavailable" });
    expect(markup).toContain("The tutor is not available right now.");
    expect(markup).not.toContain("Try again");
    expect(markup).toContain("disabled");
  });

  it("stamps a tutor bubble with the ply the ANSWER was about, not the one in view", () => {
    // The route sets `metadata.ply` (messageMetadata in api/tutor/route.ts); with the
    // board rewound to ply 2, an answer stamped ply 1 still names White's first move.
    const messages: Messages = [
      {
        id: "m1",
        role: "assistant",
        metadata: { ply: 1 },
        parts: [{ type: "text", text: "The centre is yours." }],
      },
    ];
    expect(render(true, { messages, ply: 2 })).toContain("after 1.e4");
  });

  it("labels a tutor bubble with the ply it is about, in the scoresheet's hand", () => {
    const messages: Messages = [
      { id: "m1", role: "assistant", parts: [{ type: "text", text: "The centre is yours." }] },
    ];
    // ply 2 of ["e4", "e5"] is Black's first move.
    expect(render(true, { messages })).toContain("after 1…e5");
  });
});
