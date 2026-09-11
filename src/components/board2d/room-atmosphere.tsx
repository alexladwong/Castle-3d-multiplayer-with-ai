"use client";

import { resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import styles from "./room-atmosphere.module.css";

/** The room continues around the flat board, including when WebGL is unavailable. */
export function RoomAtmosphere() {
  const preset = useUiStore((s) => s.roomPreset);
  const colors = useUiStore((s) => s.roomColors);
  const imageUrl = useUiStore((s) => s.roomImageUrl);
  const room = resolveRoom(preset, colors);
  const photo = preset === "custom" ? imageUrl : room.backdrop;
  return (
    <div
      aria-hidden
      data-room-atmosphere={preset}
      className={styles.atmosphere}
      style={photo ? {
        backgroundImage: `linear-gradient(180deg, #0000000a, #00000038), url(${JSON.stringify(photo)})`,
      } : preset === "custom" ? { background: room.backgroundColor } : undefined}
    />
  );
}
