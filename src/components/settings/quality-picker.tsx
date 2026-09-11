"use client";
// src/components/settings/quality-picker.tsx  [U4]
// The Board and Graphics controls of UI_REDESIGN §6, split so each can sit in
// its own section. FR-15, FR-29, FR-31: every change is applied to the store
// first (so a game — or the settings preview — already on screen reacts on the
// same frame) and only then debounced to Convex.
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/lib/stores/ui-store";
import { QUALITY_TIERS } from "@/lib/camera";
import type { BoardView, PlayerSettings, QualityTier } from "@/lib/types";
import { cn, focusRing } from "@/lib/ui";

const BOARD_VIEWS: ReadonlyArray<{ value: BoardView; label: string; hint: string }> = [
  { value: "3d", label: "3D", hint: "Full scene with lighting and reflections" },
  { value: "2d", label: "2D", hint: "Flat board — lighter, and always available" },
];

const TIERS: ReadonlyArray<{ value: QualityTier; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Chosen from your GPU, then lowered if frames drop" },
  { value: "low", label: "Low", hint: "No post-processing, no reflections" },
  { value: "medium", label: "Medium", hint: "Reflections and shadows, no post-processing" },
  { value: "high", label: "High", hint: "Everything, including ambient occlusion and bloom" },
];

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; hint: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  const active = options.find((option) => option.value === value);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] leading-none transition-colors",
              focusRing,
              option.value === value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {active ? <p className="text-[12px] text-muted-foreground">{active.hint}</p> : null}
    </div>
  );
}

/** "Board": which view a game opens in (FR-15). */
export function BoardViewPicker({ save }: { save: (patch: Partial<PlayerSettings>) => void }) {
  const boardView = useUiStore((s) => s.boardView);
  const webglAvailable = useUiStore((s) => s.webglAvailable);
  const setBoardView = useUiStore((s) => s.setBoardView);

  return (
    <div className="grid gap-2">
      <ChipRow
        label="Default board view"
        options={BOARD_VIEWS}
        value={boardView}
        onChange={(next) => {
          setBoardView(next);
          save({ boardView: next });
        }}
      />
      {webglAvailable === false ? (
        <p className="text-[12px] text-destructive">
          This browser has no usable WebGL2, so games open in 2D whatever is chosen here.
        </p>
      ) : null}
    </div>
  );
}

/** "Graphics": the quality tier and post-processing (FR-29, FR-31). */
export function GraphicsPicker({ save }: { save: (patch: Partial<PlayerSettings>) => void }) {
  const qualityTier = useUiStore((s) => s.qualityTier);
  const postFxEnabled = useUiStore((s) => s.postFxEnabled);
  const resolvedTier = useUiStore((s) => s.resolvedTier);
  const setQualityTier = useUiStore((s) => s.setQualityTier);
  const setPostFxEnabled = useUiStore((s) => s.setPostFxEnabled);

  // `post.composer: false` means the tier unmounts <EffectComposer> entirely, so
  // the switch has nothing to turn on there.
  const postFxSupported = QUALITY_TIERS[resolvedTier].post.composer;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <ChipRow
          label="Graphics quality"
          options={TIERS}
          value={qualityTier}
          onChange={(next) => {
            setQualityTier(next);
            save({ qualityTier: next });
          }}
        />
        {qualityTier === "auto" ? (
          <p className="text-[12px] text-muted-foreground">
            Currently running at <span className="font-medium text-foreground">{resolvedTier}</span>.
          </p>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="post-fx">Post-processing</Label>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Ambient occlusion, bloom and outlines.{" "}
            {postFxSupported
              ? "Costs frames on weaker hardware."
              : "Not used at the current quality tier."}
          </p>
        </div>
        <Switch
          id="post-fx"
          checked={postFxEnabled}
          onCheckedChange={(checked) => {
            setPostFxEnabled(checked);
            save({ postFxEnabled: checked });
          }}
        />
      </div>
    </div>
  );
}
