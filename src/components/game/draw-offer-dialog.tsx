"use client";
// src/components/game/draw-offer-dialog.tsx  [P3 → restyled U2 → UI_UPGRADE_2 §4.8 item 2]
// FR-31: a banner rather than a modal, so the offered player can still look at
// the position before answering — and the same banner is a persistent HUD layer
// in the focus layout, where there is no action bar to sit above (§5.2).
//
// This round: accepting is guarded exactly the way resigning is. Accepting ends
// the game and moves both ratings; it is the same size of decision, so it gets
// the same alert dialog. Declining stays the quiet default — nothing is lost by
// saying no. And the banner names the person ("adrienne offers a draw."), which
// is what a player actually reads; the colour is only the fallback.
import { useState } from "react";
import { HandshakeIcon } from "lucide-react";
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
import { formatColour } from "@/lib/format";
import { cn } from "@/lib/ui";
import type { Colour } from "@/lib/types";

export interface DrawOfferDialogProps {
  /** The colour that offered, or null when no offer stands. */
  offerFrom: Colour | null;
  /** The viewer's seat: "both" in local games, null for spectators. */
  seat: Colour | "both" | null;
  pending: boolean;
  /** Who offered, by name. Falls back to the colour when there is no name. */
  offerName?: string | null;
  onRespond(accept: boolean): Promise<void>;
  className?: string;
}

export function DrawOfferDialog({
  offerFrom,
  seat,
  pending,
  offerName,
  onRespond,
  className,
}: DrawOfferDialogProps) {
  // `AlertDialogAction` is a plain Button in this shadcn port — it does not close
  // the dialog — so the open state is held here and the action closes it itself.
  const [confirming, setConfirming] = useState(false);

  if (offerFrom === null || seat === null) return null;

  const mine = seat !== "both" && seat === offerFrom;
  const who = offerName?.trim() ? offerName.trim() : formatColour(offerFrom);

  return (
    <div
      // An offer waiting on this player is an interruption and has to be spoken:
      // `alert` is assertive and atomic, so the sentence and the two verbs are
      // announced together. Your own offer is a status — nothing to answer.
      role={mine ? "status" : "alert"}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/10",
        "px-3 py-2 text-[13px] text-foreground",
        className,
      )}
    >
      <HandshakeIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <span>{mine ? "Draw offered — waiting for a reply." : `${who} offers a draw.`}</span>
      {mine ? null : (
        // Accept first, and outlined, because it is the considered action the
        // sentence asks for; Decline is the ghost dismissal beside it. Neither gets
        // brass: DESIGN.md keeps the accent for the action you would want back, and
        // neither of these can be taken back.
        <div className="ml-auto flex gap-2">
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogTrigger
              // `disabled`, not `aria-disabled`: this used to announce as disabled
              // while still opening the dialog, so a second accept could be fired
              // over an unresolved first one. Decline on the same row was already
              // genuinely disabled.
              render={<Button variant="outline" disabled={pending} />}
            >
              Accept
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Accept the draw?</AlertDialogTitle>
                <AlertDialogDescription>
                  The game ends as a draw and both ratings are updated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep playing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (pending) return;
                    setConfirming(false);
                    void onRespond(true);
                  }}
                >
                  Accept the draw
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              void onRespond(false);
            }}
          >
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
