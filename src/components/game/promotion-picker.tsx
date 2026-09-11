"use client";
// src/components/game/promotion-picker.tsx  [P3 → restyled U2]
// FR-11 / UI_REDESIGN §5.4: "a row of four piece glyphs in a small dialog".
// A DOM overlay shared by both boards: chess.js has no implicit auto-queen, so
// nothing is sent to Convex until a piece is chosen.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PieceGlyph, PIECE_NAMES } from "@/components/board2d/pieces-svg";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui-kit";
import type { PromotionPiece, PromotionPrompt } from "@/lib/types";

const CHOICES: PromotionPiece[] = ["q", "r", "b", "n"];

export interface PromotionPickerProps {
  prompt: PromotionPrompt | null;
  onChoose(piece: PromotionPiece | null): void;
}

export function PromotionPicker({ prompt, onChoose }: PromotionPickerProps) {
  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open) onChoose(null);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>
            {/* headline-sm — the app-frame overlay step of DESIGN.md's ramp. */}
            <Display level={4} as="span" className="block">
              Promote your pawn
            </Display>
          </DialogTitle>
          <DialogDescription>
            {prompt ? (
              <span className="tabular font-mono">
                {prompt.from} → {prompt.to}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {CHOICES.map((piece) => (
            <Button
              key={piece}
              variant="outline"
              className="h-auto flex-col gap-1 py-2"
              autoFocus={piece === "q"}
              onClick={() => onChoose(piece)}
            >
              <PieceGlyph type={piece} colour={prompt?.colour ?? "w"} className="size-10" />
              <span className="text-[12px] capitalize">{PIECE_NAMES[piece]}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
