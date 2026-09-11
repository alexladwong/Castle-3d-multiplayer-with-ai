"use client";
// src/components/game/game-action-bar.tsx  [U2]
// UI_REDESIGN §5.1's always-visible action bar. Three groups, every button
// labelled, every disabled button carrying the reason in its tooltip:
//
//   View   2D/3D (T) · Flip (R) · Camera ▾ (3D) · Fullscreen (F)
//   Game   Ask for a hint · Take back · Offer draw · Resign
//   More   PGN ▾ · Room · Shortcuts
//
// The hint action has ONE name — "Ask for a hint", with the count as "2 left" —
// and the chat composer in `game-chat.tsx` says exactly the same thing.
//
// Icon + label from 1280px up, icon-only with a tooltip below that (`labelFrom`).
// Nothing here talks to Convex: every verb is a `GameActions` call or a callback.
import { useState } from "react";
import {
  BoxIcon,
  CameraIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  FileTextIcon,
  FlagIcon,
  Grid2x2Icon,
  HandshakeIcon,
  KeyboardIcon,
  LightbulbIcon,
  MinimizeIcon,
  RefreshCwIcon,
  SettingsIcon,
  UndoIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActionBar, ActionButton, ActionGroup, ActionSeparator } from "@/components/ui-kit";
import { errorCopyFor } from "@/lib/errors";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/ui";
import type { BoardView, CameraPresetId, Colour, GameActions, GameMode } from "@/lib/types";

/** Below this the text labels collapse and the tooltip carries the name (§5.1). */
const LABEL_FROM = "xl" as const;

export interface GameActionBarProps {
  mode: GameMode;
  /** null for spectators: the Game group disappears entirely. */
  seat: Colour | "both" | null;
  boardView: BoardView;
  webglAvailable: boolean | null;
  orientation: Colour;
  /** True while the shell is in the §5.2 focus layout. */
  focus: boolean;
  pending: boolean;
  canUndo: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  drawOffered: boolean;
  hint: {
    available: boolean;
    remaining: number;
    disabledReason: string | null;
    request(): void;
  };
  actions: GameActions;
  onToggleView(): void;
  onToggleFocus(): void;
  onOpenRoom(): void;
  onOpenShortcuts(): void;
  /** "focus" drops the More group — it is the floating HUD bar of §5.2. */
  variant?: "full" | "focus";
  className?: string;
}

const CAMERA_ITEMS: { preset: CameraPresetId; label: string }[] = [
  { preset: "white", label: "White seat" },
  { preset: "black", label: "Black seat" },
  { preset: "top", label: "Top down" },
  { preset: "cinematic", label: "Orbit" },
];

/** Below 1280 this is a bare camera icon, so — like every other trigger in the bar
 *  (§5.1: "every trigger carries a tooltip") — it says what it does. Base UI composes
 *  the two triggers by nesting `render` props (handbook/composition.md). */
function CameraMenu({ orientation }: { orientation: Colour }) {
  const setCameraPreset = useUiStore((s) => s.setCameraPreset);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  size="default"
                  variant="ghost"
                  className="shrink-0"
                  aria-label="Camera angle"
                />
              }
            >
              <CameraIcon aria-hidden />
              <span className="sr-only xl:not-sr-only">Camera</span>
              <ChevronDownIcon aria-hidden className="opacity-60" />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent side="bottom">Where you sit — white, black, top down or orbit</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuLabel>Camera</DropdownMenuLabel>
        {CAMERA_ITEMS.map((item) => (
          <DropdownMenuItem key={item.preset} onClick={() => setCameraPreset(item.preset)}>
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCameraPreset(orientation === "w" ? "white" : "black")}>
          Reset view
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "PGN" is chess jargon, and below 1280 it is not even a word on screen — so the
 *  trigger carries a tooltip that expands it. Base UI composes the two triggers by
 *  nesting `render` props (handbook/composition.md, "Composing multiple components"). */
function PgnMenu({ actions }: { actions: GameActions }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button size="default" variant="ghost" className="shrink-0" aria-label="Export game" />
              }
            >
              <FileTextIcon aria-hidden />
              <span className="sr-only xl:not-sr-only">Export game</span>
              <ChevronDownIcon aria-hidden className="opacity-60" />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent side="bottom">Copy or download the moves for another chess app</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem
          onClick={() => {
            void actions.copyPgn();
          }}
        >
          <CopyIcon aria-hidden />
          Copy game moves
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.downloadPgn}>
          <DownloadIcon aria-hidden />
          Download game (.pgn)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Resign + its confirmation (§5.1 "danger, confirms"). Exported so §5.3's More
 *  sheet can offer the same guarded action at full width. */
export function ResignAction({
  mode,
  disabledReason,
  wide = false,
  onResign,
}: {
  mode: GameMode;
  disabledReason: string | null;
  /** Full-width row for the mobile More drawer instead of a bar button. */
  wide?: boolean;
  onResign(): void;
}) {
  const blocked = disabledReason !== null;
  // `AlertDialogAction` is a plain Button in this shadcn port — it does not close
  // the dialog — so the open state is held here and the action closes it itself.
  // Without this the game ends behind a modal that is still asking the question.
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {/* A native `title` was the odd one out in a bar where everything else
          explains itself through the Tooltip component: it looked different, waited
          longer, and never appeared for a keyboard user. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <AlertDialogTrigger
              render={
                <Button
                  size={wide ? "lg" : "default"}
                  // §4.3: ember GHOST in the bar — the danger is in the word and
                  // the confirmation, not in a filled button competing with the
                  // board. The mobile "More" sheet keeps the full-width row and
                  // takes the 44px destructive floor (§4.8 item 3).
                  variant="ghost"
                  aria-label="Resign the game"
                  aria-disabled={blocked || undefined}
                  className={cn(
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
                    wide ? "min-h-11 justify-start" : "shrink-0",
                    blocked && "pointer-events-none opacity-50",
                  )}
                />
              }
            >
              <FlagIcon aria-hidden />
              <span className={wide ? undefined : "sr-only xl:not-sr-only"}>Resign</span>
            </AlertDialogTrigger>
          }
        />
        <TooltipContent side="bottom">{disabledReason ?? "Resign the game"}</TooltipContent>
      </Tooltip>
      {/* §4.5: floating layers rely on the shadow alone. */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resign this game?</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "online"
              ? "Your opponent wins immediately and both ratings are updated."
              : "The game ends immediately."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep playing</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onResign();
            }}
          >
            Resign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GameActionBar({
  mode,
  seat,
  boardView,
  webglAvailable,
  orientation,
  focus,
  pending,
  canUndo,
  canResign,
  canOfferDraw,
  drawOffered,
  hint,
  actions,
  onToggleView,
  onToggleFocus,
  onOpenRoom,
  onOpenShortcuts,
  variant = "full",
  className,
}: GameActionBarProps) {
  const compact = variant === "focus";
  const labelFrom = LABEL_FROM;
  const is3d = boardView === "3d";
  const noWebgl = webglAvailable === false;

  const undoReason =
    mode === "online"
      ? errorCopyFor("undo-not-allowed", "game")
      : !canUndo
        ? "There is nothing to take back yet."
        : null;

  const drawReason = drawOffered
    ? "A draw offer is already on the table."
    : !canOfferDraw
      ? errorCopyFor("game-not-active", "game")
      : null;

  const fullscreenAction = (
    <ActionButton
      icon={focus ? MinimizeIcon : ExpandIcon}
      label={focus ? "Exit" : "Fullscreen"}
      labelFrom={labelFrom}
      shortcut="F"
      tooltip={focus ? "Leave the focus layout" : "Fill the screen with the board"}
      onClick={onToggleFocus}
    />
  );

  return (
    <ActionBar
      label="Game actions"
      // Only the focus HUD's bar floats over the board; the default one is part of
      // the page and takes tone and a hairline instead of a shadow (DESIGN.md).
      variant={compact ? "focus" : "default"}
      // §4.5 + the contrast floor: a floating bar over a lit board is
      // OPAQUE walnut. A translucent plate put ivory text at 1.4:1 against
      // whatever the room happened to be doing behind it.
      className={cn(compact && "w-auto bg-card", className)}
    >
      {/* ------------------------------------------------------------- View */}
      <ActionGroup>
        <ActionButton
          icon={is3d ? Grid2x2Icon : BoxIcon}
          label={is3d ? "2D" : "3D"}
          labelFrom={labelFrom}
          shortcut="T"
          tooltip={is3d ? "Switch to the 2D board" : "Switch to the 3D board"}
          disabledReason={
            !is3d && noWebgl
              ? "3D needs WebGL2, which this browser or GPU does not provide."
              : undefined
          }
          onClick={onToggleView}
        />
        <ActionButton
          icon={RefreshCwIcon}
          label="Flip"
          labelFrom={labelFrom}
          shortcut="R"
          tooltip="Flip the board to the other seat"
          onClick={() => actions.setOrientation(orientation === "w" ? "b" : "w")}
        />
        {is3d && !noWebgl ? <CameraMenu orientation={orientation} /> : null}
      </ActionGroup>

      {seat !== null ? (
        <>
          {/* ----------------------------------------------------------- Play */}
          <ActionSeparator />
          <ActionGroup>
            {hint.available ? (
              <ActionButton
                icon={LightbulbIcon}
                label="Ask for a hint"
                labelFrom={labelFrom}
                // The count rides in the tooltip too: below 1280 the bar is
                // icon-only and the badge goes with the label.
                tooltip={`Your opponent suggests a move · ${hint.remaining} left`}
                badge={`${hint.remaining} left`}
                disabledReason={hint.disabledReason ?? undefined}
                onClick={hint.request}
              />
            ) : null}

            <ActionButton
              icon={UndoIcon}
              label={mode === "local" ? "Undo move" : "Take back"}
              labelFrom={labelFrom}
              tooltip="Rewind the last move"
              disabledReason={undoReason ?? undefined}
              onClick={() => {
                void actions.undo();
              }}
            />

            {/* Both of these used to be dropped from the focus HUD, which left a
                fullscreen player unable to answer — or make — a draw offer, and
                unable to concede. They stay (§5.2's HUD bar wraps if it must). */}
            {mode === "online" ? (
              <ActionButton
                icon={HandshakeIcon}
                label="Offer draw"
                labelFrom={labelFrom}
                tooltip="Offer your opponent a draw"
                disabledReason={drawReason ?? undefined}
                onClick={() => {
                  void actions.offerDraw();
                }}
              />
            ) : null}
          </ActionGroup>

          {/* ----------------------------------------------------------- Game */}
          <ActionSeparator />
          <ActionGroup>
            <ResignAction
              mode={mode}
              disabledReason={
                canResign && !pending ? null : errorCopyFor("game-not-active", "game")
              }
              onResign={() => {
                void actions.resign();
              }}
            />
            {compact ? null : <PgnMenu actions={actions} />}
          </ActionGroup>
        </>
      ) : null}

      {/* ------------------------------------------------------------ Frame */}
      {compact ? (
        // §5.2 puts Exit LAST in the focus HUD — it is the way out, so it reads
        // after the things you came here to do.
        <>
          <ActionSeparator />
          <ActionGroup>{fullscreenAction}</ActionGroup>
        </>
      ) : (
        <>
          <ActionSeparator />
          <ActionGroup className="ml-auto">
            {seat === null ? <PgnMenu actions={actions} /> : null}
            <ActionButton
              icon={SettingsIcon}
              label="Room"
              labelFrom={labelFrom}
              tooltip="Board and room settings"
              onClick={onOpenRoom}
            />
            <ActionButton
              icon={KeyboardIcon}
              label="Shortcuts"
              labelFrom={labelFrom}
              shortcut="?"
              tooltip="Keyboard shortcuts"
              onClick={onOpenShortcuts}
            />
            {fullscreenAction}
          </ActionGroup>
        </>
      )}
    </ActionBar>
  );
}
