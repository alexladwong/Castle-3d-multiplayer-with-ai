"use client";
// src/components/board3d/camera-overlay.tsx  [U3]
// The in-canvas camera controls (§5.1 "Camera ▾" in board form). Every button is
// icon + label + tooltip, the active seat is brass (`variant="primary"`), and the
// accessible names stay exactly "White" / "Black" / "Top" / "Orbit" /
// "Reset the camera" — e2e/public.spec.ts and the keyboard help text quote them.
import { Circle, CircleDot, Grid2x2, Orbit, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionBar, ActionButton } from "@/components/ui-kit";
import type { CameraPresetId } from "@/lib/types";

interface CameraButton {
  id: CameraPresetId;
  label: string;
  icon: LucideIcon;
  tooltip: string;
}

const CAMERA_BUTTONS: CameraButton[] = [
  { id: "white", label: "White", icon: Circle, tooltip: "Sit on White's side" },
  { id: "black", label: "Black", icon: CircleDot, tooltip: "Sit on Black's side" },
  { id: "top", label: "Top", icon: Grid2x2, tooltip: "Look straight down" },
  { id: "cinematic", label: "Orbit", icon: Orbit, tooltip: "Drift slowly around the board" },
];

export interface CameraOverlayProps {
  preset: CameraPresetId;
  onSelect(preset: CameraPresetId): void;
  onReset(): void;
}

export function CameraOverlay({ preset, onSelect, onReset }: CameraOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-2">
      <ActionBar
        label="Camera"
        // It genuinely floats over the canvas, so it keeps the soft shadow that
        // the bar under the board has now given up.
        variant="focus"
        className="pointer-events-auto w-auto flex-wrap justify-end gap-1 border-border/70 bg-card/80 p-1 backdrop-blur-sm"
      >
        {CAMERA_BUTTONS.map((button) => (
          <ActionButton
            key={button.id}
            icon={button.icon}
            label={button.label}
            tooltip={button.tooltip}
            // Comfortable touch targets on a 360 px viewport (NFR-6).
            className="min-h-9 min-w-11"
            variant={preset === button.id ? "primary" : "default"}
            aria-pressed={preset === button.id}
            onClick={() => onSelect(button.id)}
          />
        ))}
        <ActionButton
          icon={RotateCcw}
          label="Reset"
          aria-label="Reset the camera"
          tooltip="Reset the camera"
          shortcut="R"
          className="min-h-9 min-w-11"
          onClick={onReset}
        />
      </ActionBar>
    </div>
  );
}
