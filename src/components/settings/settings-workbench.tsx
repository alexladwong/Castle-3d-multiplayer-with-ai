"use client";
// src/components/settings/settings-workbench.tsx  [U4]
// The /settings page arrangement of UI_REDESIGN §6: sections on the left, a
// sticky live preview on the right. The in-game "Room" drawer renders
// `SettingsForm` on its own instead — it already has a board on screen.
import { SettingsForm } from "@/components/settings/settings-form";
import { SettingsPreview } from "@/components/settings/settings-preview";
import { useSettingsWriter } from "@/hooks/use-settings-sync";

export function SettingsWorkbench() {
  // The ONE debounced `players.updateSettings` writer for this page (FR-21l).
  const save = useSettingsWriter();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        {/* `showPlan`: PRO_TUTOR §7's Plan row belongs to the settings PAGE. The
            in-game Room drawer renders the same form without it. */}
        <SettingsForm save={save} showPlan />
      </div>

      {/* Second in the DOM so a narrow screen reads the controls first; the
          preview then sits above the fold on desktop via `order`. */}
      <SettingsPreview className="order-first lg:sticky lg:top-20 lg:order-none" />
    </div>
  );
}
