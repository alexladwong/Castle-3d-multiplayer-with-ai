"use client";
// src/components/game/game-mobile-bar.tsx  [U2]
// UI_REDESIGN §5.3: "sticky action bar (5 primary buttons + 'More' sheet)".
// The five that matter with a thumb — board view, flip, fullscreen, the one
// game verb this mode offers, and the panel — stay out; everything else moves
// into a Drawer so the board keeps the screen.
import {
  BoxIcon,
  CameraIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ExpandIcon,
  GraduationCapIcon,
  Grid2x2Icon,
  HandshakeIcon,
  InfoIcon,
  KeyboardIcon,
  LightbulbIcon,
  ListIcon,
  MessagesSquareIcon,
  MinimizeIcon,
  RefreshCwIcon,
  SettingsIcon,
  UndoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ActionBar } from "@/components/ui-kit";
import { errorCopyFor } from "@/lib/errors";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/ui";
import type { BoardView, CameraPresetId, Colour, GameActions, GameMode } from "@/lib/types";
import { ResignAction } from "./game-action-bar";

/** Which tab the panel button opens onto, so the label names what happens. */
export type MobilePanelTab = "chat" | "moves" | "info";

const PANEL_BUTTON: Record<MobilePanelTab, { icon: typeof BoxIcon; label: string }> = {
  chat: { icon: MessagesSquareIcon, label: "Chat" },
  moves: { icon: ListIcon, label: "Moves" },
  info: { icon: InfoIcon, label: "Info" },
};

export interface GameMobileBarProps {
  mode: GameMode;
  seat: Colour | "both" | null;
  boardView: BoardView;
  webglAvailable: boolean | null;
  orientation: Colour;
  focus: boolean;
  pending: boolean;
  canUndo: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  hint: { available: boolean; remaining: number; disabledReason: string | null; request(): void };
  actions: GameActions;
  /** The tab the sheet will land on — names the panel button (§4 "say what happens"). */
  panelTab: MobilePanelTab;
  onToggleView(): void;
  onToggleFocus(): void;
  onOpenPanel(): void;
  /**
   * docs/PRO_TUTOR.md §3: opens the tutor sheet. Present only when the game has a
   * tutor at all — and when it is, the tutor takes Fullscreen's place on the bar
   * (measured at 390px: six captions leave 57px each and "Fullscreen" needs 62,
   * so it truncates to nothing readable; five keep every cap whole). Fullscreen
   * moves into "More", beside the other board controls.
   *
   * It is handed its own button so the shell can put focus back on it when the
   * sheet closes — Base UI's non-modal drawer drops focus on <body>.
   */
  onOpenTutor?(event: React.MouseEvent<HTMLButtonElement>): void;
  onOpenRoom(): void;
  onOpenShortcuts(): void;
  className?: string;
}

const CAMERA_ITEMS: { preset: CameraPresetId; label: string }[] = [
  { preset: "white", label: "White seat" },
  { preset: "black", label: "Black seat" },
  { preset: "top", label: "Top down" },
  { preset: "cinematic", label: "Orbit" },
];

/**
 * One thumb-sized button: icon over a 10px caption, so nothing is a mystery glyph.
 *
 * `min-h-11` is the 44px touch floor, and the caption is the accessible name unless
 * `srLabel` gives a fuller one — "Exit" reads as a whole verb under the icon while a
 * screen reader still hears "Exit fullscreen".
 */
function BarButton({
  icon: Icon,
  label,
  srLabel,
  onClick,
  count,
  disabled = false,
  tone = "default",
  className,
}: {
  icon: typeof BoxIcon;
  label: string;
  srLabel?: string;
  /** A mono count that sits under the label, e.g. "2 left". */
  count?: string;
  onClick(event: React.MouseEvent<HTMLButtonElement>): void;
  disabled?: boolean;
  tone?: "default" | "primary";
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      aria-disabled={disabled || undefined}
      aria-label={srLabel}
      className={cn(
        // `px-0!`: the shared ActionBar styles every descendant button with
        // `px-2`, which out-ranks a plain `px-0` here and left "Fullscreen" 10px
        // short of its own width at 390 (48px box, 58px word).
        "h-auto min-h-11 min-w-0 flex-1 flex-col gap-0.5 px-0! py-1.5 text-[12px] font-medium",
        tone === "primary" && "text-primary",
        disabled && "opacity-50",
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
      <span
        aria-hidden={srLabel ? true : undefined}
        className="max-w-full truncate"
      >
        {label}
      </span>
      {count ? (
        <span aria-hidden className="tabular font-mono text-[12px] text-muted-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}

function MoreItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: typeof BoxIcon;
  label: string;
  onClick(): void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant={danger ? "destructive" : "outline"}
      // §4.8 item 3: a destructive row in this sheet is a 44px target.
      className={cn("justify-start", danger && "min-h-11")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

export function GameMobileBar({
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
  hint,
  actions,
  panelTab,
  onToggleView,
  onToggleFocus,
  onOpenPanel,
  onOpenTutor,
  onOpenRoom,
  onOpenShortcuts,
  className,
}: GameMobileBarProps) {
  const setCameraPreset = useUiStore((s) => s.setCameraPreset);
  const is3d = boardView === "3d";
  const noWebgl = webglAvailable === false;
  const flip = () => actions.setOrientation(orientation === "w" ? "b" : "w");
  const panel = PANEL_BUTTON[panelTab];

  return (
    <ActionBar
      label="Game actions"
      // Pro Max: 44px targets with 8px gaps. Edge-to-edge buttons met the size
      // floor and still sent a thumb aimed at Fullscreen to Flip.
      className={cn("gap-2 overflow-visible px-1", className)}
    >
      <BarButton
        icon={is3d ? Grid2x2Icon : BoxIcon}
        label={is3d ? "2D" : "3D"}
        disabled={!is3d && noWebgl}
        onClick={() => {
          if (is3d || !noWebgl) onToggleView();
        }}
      />
      {onOpenTutor ? (
        <BarButton icon={GraduationCapIcon} label="Tutor" onClick={onOpenTutor} />
      ) : (
        <BarButton
          icon={focus ? MinimizeIcon : ExpandIcon}
          label={focus ? "Exit" : "Fullscreen"}
          srLabel={focus ? "Exit fullscreen" : "Fullscreen"}
          onClick={onToggleFocus}
        />
      )}
      {hint.available ? (
        // §4.8 item 6: the hint action keeps ONE accessible name, "Ask for a hint",
        // on every surface. On a 390px bar five buttons share 324px, so the visible
        // cap is the same word shortened ("Hint") with the count on the face, not in
        // a tooltip a thumb cannot summon: a hint is spent, so "2 left" is the part
        // that decides the tap. "Ask for a hint" as a visible cap truncated to
        // "Ask for a …" at 390, which named nothing.
        <BarButton
          icon={LightbulbIcon}
          label="Hint"
          count={`${hint.remaining} left`}
          srLabel={`Ask for a hint · ${hint.remaining} left`}
          disabled={hint.disabledReason !== null}
          onClick={() => {
            if (hint.disabledReason === null) hint.request();
          }}
        />
      ) : (
        <BarButton
          icon={UndoIcon}
          label={mode === "local" ? "Undo" : "Take back"}
          disabled={!canUndo || mode === "online" || seat === null}
          onClick={() => {
            void actions.undo();
          }}
        />
      )}
      <BarButton icon={panel.icon} label={panel.label} onClick={onOpenPanel} />

      <Drawer>
        <DrawerTrigger
          render={
            <Button
              variant="ghost"
              aria-label="More game actions"
              className="h-auto min-h-11 min-w-0 flex-1 flex-col gap-0.5 px-0 py-1.5 text-[12px] font-medium"
            />
          }
        >
          <EllipsisIcon aria-hidden className="size-5" />
          <span>More</span>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80dvh] transition-[transform,opacity,filter]">
          <DrawerHeader>
            <DrawerTitle>More actions</DrawerTitle>
            <DrawerDescription>
              Everything that does not fit on the bar.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 overflow-y-auto px-4 pb-8">
            {/* Flip left the bar so five buttons fit 390px without truncating
                their caps; it is cosmetic in a live game and a thumb aimed at
                Fullscreen kept landing on it (critique, 2026-09-10). */}
            <p className="eyebrow pt-1">Board</p>
            <MoreItem icon={RefreshCwIcon} label="Flip the board" onClick={flip} />
            {onOpenTutor ? (
              <MoreItem
                icon={focus ? MinimizeIcon : ExpandIcon}
                label={focus ? "Exit fullscreen" : "Fullscreen"}
                onClick={onToggleFocus}
              />
            ) : null}
            {is3d && !noWebgl ? (
              <>
                <p className="eyebrow pt-2">Camera</p>
                <div className="grid grid-cols-2 gap-2">
                  {CAMERA_ITEMS.map((item) => (
                    <Button
                      key={item.preset}
                      variant="outline"
                      className="justify-start"
                      onClick={() => setCameraPreset(item.preset)}
                    >
                      <CameraIcon aria-hidden />
                      {item.label}
                    </Button>
                  ))}
                </div>
              </>
            ) : null}

            {seat !== null ? (
              <>
                <p className="eyebrow pt-2">Game</p>
                {hint.available ? (
                  <MoreItem
                    icon={UndoIcon}
                    label={mode === "local" ? "Undo move" : "Take back"}
                    disabled={!canUndo || mode === "online"}
                    onClick={() => {
                      void actions.undo();
                    }}
                  />
                ) : null}
                {mode === "online" ? (
                  <MoreItem
                    icon={HandshakeIcon}
                    label="Offer draw"
                    disabled={!canOfferDraw || pending}
                    onClick={() => {
                      void actions.offerDraw();
                    }}
                  />
                ) : null}
                <ResignAction
                  mode={mode}
                  wide
                  disabledReason={
                    canResign && !pending ? null : errorCopyFor("game-not-active", "game")
                  }
                  onResign={() => {
                    void actions.resign();
                  }}
                />
              </>
            ) : null}

            <p className="eyebrow pt-2">More</p>
            <MoreItem
              icon={CopyIcon}
              label="Copy game moves"
              onClick={() => {
                void actions.copyPgn();
              }}
            />
            <MoreItem icon={DownloadIcon} label="Download game (.pgn)" onClick={actions.downloadPgn} />
            {/* §4.8 item 6: "Room" is the one name for the room action, in the
                desktop bar and here. */}
            <MoreItem icon={SettingsIcon} label="Room" onClick={onOpenRoom} />
            <MoreItem icon={KeyboardIcon} label="Keyboard shortcuts" onClick={onOpenShortcuts} />
          </div>
        </DrawerContent>
      </Drawer>
    </ActionBar>
  );
}
