"use client";
// src/components/settings/settings-form.tsx  [U4]
// The settings sections of UI_REDESIGN §6: Room, Board, Camera & motion,
// Graphics, Engine, Account — plus Credits, which is a licence obligation (§I-7)
// and therefore has to stay reachable in the UI.
//
// `SettingsForm({ save })` keeps its exact pre-redesign contract because the game
// screen renders it inside the "Room" drawer (U2) and persists the 2D/3D toggle
// through the same writer (FR-15); two writers would fire two mutations per
// change. `SettingsWorkbench` (settings-workbench.tsx) is the /settings page's
// two-column arrangement of this same form.
import { useUser } from "@clerk/nextjs";
import { UserButton, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Attributions } from "@/components/settings/attributions";
import { BoardViewPicker, GraphicsPicker } from "@/components/settings/quality-picker";
import { RoomPicker } from "@/components/settings/room-picker";
import { useClerkAppearance } from "@/lib/clerk-appearance";
import { useTutorAccess } from "@/components/tutor/access";
import { useSettingsWriter } from "@/hooks/use-settings-sync";
import { cn, focusRing } from "@/lib/ui";
import { useUiStore } from "@/lib/stores/ui-store";
import { ENGINE_BUILD_LABEL } from "@/lib/constants";
import type { PlayerSettings } from "@/lib/types";

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
    >
      <div className="grid gap-1">
        {/* A real <h2> so the page outline is navigable; `eyebrow` is the same
            13px uppercase label the ui-kit primitive paints (§1.2). */}
        <h2 id={`${id}-title`} className="eyebrow">
          {title}
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-4" aria-busy>
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

/** Detected, never chosen — `engineBuild` is set by the worker that booted it. */
function EngineSection() {
  const engineBuild = useUiStore((s) => s.engineBuild);
  return (
    <Section
      id="settings-engine"
      title="Engine"
      description="Stockfish runs in a Web Worker in this tab. It generates the candidate moves; the persona picks between them."
    >
      <p className="text-sm text-foreground">
        {engineBuild === null ? (
          <>
            Not loaded yet.{" "}
            <span className="text-muted-foreground">
              It boots the first time you start a game against the AI.
            </span>
          </>
        ) : (
          <>
            Running{" "}
            <span className="tabular font-mono text-primary">
              {ENGINE_BUILD_LABEL[engineBuild]}
            </span>
            .{" "}
            <span className="text-muted-foreground">
              {engineBuild === "sf18"
                ? "The NNUE build, chosen because this browser has WASM SIMD."
                : "The classical build — this browser has no WASM SIMD."}
            </span>
          </>
        )}
      </p>
    </Section>
  );
}

/**
 * The "Plan" row of PRO_TUTOR.md §7. Three states, because `has` is undefined until
 * Clerk's session claims land and rendering "Free" in that gap would offer a member
 * they already paid something they already have.
 *
 * Managing and cancelling both live in Clerk's own user profile (its Billing section),
 * opened as a modal with the app's palette — there is no second billing UI to keep in
 * step, and no place here where a card number could be typed.
 */
function PlanSection() {
  const { hasTutor } = useTutorAccess();
  const clerk = useClerk();
  const appearance = useClerkAppearance();

  return (
    <Section
      id="settings-plan"
      title="Plan"
      description="Castle is free. Pro adds the tutor — the coach that explains a position and marks the board."
    >
      {hasTutor === undefined ? (
        <div className="flex items-center justify-between gap-4" aria-busy>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[12px] font-medium",
                  hasTutor
                    ? "border border-primary/40 text-primary"
                    : "bg-bg-sunken text-muted-foreground",
                )}
              >
                {hasTutor ? "Pro" : "Free"}
              </span>
              <span aria-hidden className="text-muted-foreground">·</span>
              {hasTutor ? "your membership is active" : "the tutor is locked"}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {hasTutor
                ? "Billing and cancellation both live in your account."
                : "Everything else — rated games, the AI opponents, the rooms — stays free."}
            </p>
          </div>

          {hasTutor ? (
            <Button
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={() => clerk.openUserProfile({ appearance })}
            >
              Manage in your account
            </Button>
          ) : (
            <Link
              prefetch={false}
              href="/pro"
              className={cn(buttonVariants({ size: "lg" }), "min-h-11 px-4", focusRing)}
            >
              Go Pro
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}

function AccountSection() {
  const { isLoaded, user } = useUser();
  return (
    <Section
      id="settings-account"
      title="Account"
      description="Your username and avatar come from your sign-in provider and are managed there."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {isLoaded ? (
            <p className="truncate text-sm font-medium text-foreground">
              {user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
            </p>
          ) : (
            <Skeleton className="h-5 w-32" />
          )}
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Open the menu to manage your account or sign out.
          </p>
        </div>
        <UserButton />
      </div>
    </Section>
  );
}

export interface SettingsFormProps {
  /** The /settings page shows the "Plan" row; the in-game Room drawer does not —
   *  nobody wants a subscription pitch beside a live board. */
  showPlan?: boolean;
  /** The ONE debounced `players.updateSettings` writer for this tree. The form does
   *  not own it: the game shell persists the 2D/3D toggle through the same writer
   *  (FR-15), and two writers would fire two mutations per change. */
  save(patch: Partial<PlayerSettings>): void;
}

/**
 * Every control writes to the ui-store synchronously (so a 3D scene already on
 * screen updates on the same frame) and then queues a debounced
 * `players.updateSettings`. There is no Save button by design (FR-21l).
 *
 * The whole form gates on `hydrated`: until `<PlayerSync/>` has rehydrated
 * localStorage and merged `players.me`, the store still holds SSR defaults, and
 * rendering those as "selected" would flash the wrong choices.
 */
export function SettingsForm({ save, showPlan = false }: SettingsFormProps) {
  const hydrated = useUiStore((s) => s.hydrated);
  const boardFlipEnabled = useUiStore((s) => s.boardFlipEnabled);
  const setBoardFlipEnabled = useUiStore((s) => s.setBoardFlipEnabled);

  if (!hydrated) return <SettingsSkeleton />;

  return (
    <div className="grid gap-4">
      <Section
        id="settings-room"
        title="Room"
        description="Your board, your surroundings. Rooms are per-player — your opponent keeps theirs, and so do spectators."
      >
        <RoomPicker save={save} />
      </Section>

      <Section
        id="settings-board"
        title="Board"
        description="Which view a game opens in. You can still switch inside any game."
      >
        <BoardViewPicker save={save} />
      </Section>

      <Section
        id="settings-camera"
        title="Camera & motion"
        description="How the camera behaves between turns."
      >
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="board-flip">Flip the board between turns</Label>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Pass-and-play games only. The camera swings to the side of whoever is to move so
                the device can be handed over. Turn it off for a fixed view.
              </p>
            </div>
            <Switch
              id="board-flip"
              checked={boardFlipEnabled}
              onCheckedChange={(checked) => {
                setBoardFlipEnabled(checked);
                save({ boardFlipEnabled: checked });
              }}
            />
          </div>
          <p className="text-[12px] text-muted-foreground">
            Camera seats (White, Black, Top, Orbit) are chosen inside a game and are not
            remembered between sessions. Reduced motion is taken from your system settings.
          </p>
        </div>
      </Section>

      <Section
        id="settings-graphics"
        title="Graphics"
        description="Turn things down if frames drop, or up if your machine can take it."
      >
        <GraphicsPicker save={save} />
      </Section>

      <EngineSection />
      {showPlan ? <PlanSection /> : null}
      <AccountSection />

      <Section
        id="settings-credits"
        title="Credits"
        description="The people whose work this game is built on."
      >
        <Attributions />
      </Section>
    </div>
  );
}

/** The /settings page has no other settings writer to share, so it owns one here. */
export function StandaloneSettingsForm() {
  const save = useSettingsWriter();
  return <SettingsForm save={save} showPlan />;
}
