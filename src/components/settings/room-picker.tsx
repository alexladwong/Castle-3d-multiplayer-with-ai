"use client";

import { useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoomCard } from "@/components/ui-kit";
import { ColourPickers } from "@/components/settings/colour-pickers";
import { preloadBoard3D } from "@/components/board3d/board-3d-loader";
import { useUiStore } from "@/lib/stores/ui-store";
import {
  DEFAULT_ROOM_COLORS,
  HDRI_FILES,
  ROOMS,
  ROOM_ORDER,
  resolveRoom,
} from "@/lib/rooms";
import { MAX_ROOM_IMAGE_BYTES } from "@/lib/constants";
import type { PlayerSettings, RoomColors, RoomPresetId } from "@/lib/types";
import { describeConvexError } from "@/components/providers/convex-errors";

/**
 * FR-21m — "preset switching is instant (assets preloaded on the settings drawer open)".
 *
 * TWO layers, both driven by INTENT — never by a bare mount. §I-8 caps what a page may
 * download speculatively, and `/settings` has no canvas and no drawer, so its trigger is
 * the first hover/focus on the room list rather than `useEffect(..., [])`: a visitor who
 * came for the sound toggle must not pay ~8 MB (5 HDRIs + the three/drei chunk) for it.
 *
 * 1. `preloadRoomAssets()` — the bulk warm, fired once per session from the in-game
 *    settings drawer opening (game-shell) or the first room-list hover/focus here. It
 *    pulls the 3D chunk with a DYNAMIC import (so `/settings` still ships no three.js in
 *    its own bundle) and then uses drei's documented preload APIs:
 *    `useEnvironment.preload({ files })` for all five HDRIs and `useGLTF.preload()` for
 *    the piece GLB, via `preloadBoard3D` (r3f-drei.md §3/§4). Those populate drei's own
 *    loader cache, so a later preset switch inside the scene neither re-fetches nor
 *    re-decodes — an HTTP-cache-only warm would still pay the RGBE decode.
 *    ~6.9 MB of HDRI + 96 KB of GLB; `next.config.ts` serves `/hdri/*` with
 *    `max-age=2592000`, so repeat sessions are cache hits. Skipped entirely on Save-Data
 *    and on 3g/2g/slow-2g connections (see §I-8) — those players keep layer 2 only, and
 *    every room still works, it just downloads on demand.
 *
 * 2. `prefetchHdri()` — the per-room warm on hover/focus/selection, for exactly the
 *    connections (and the repeat hovers) that layer 1 does not cover.
 */
const warmed = new Set<string>();

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

function networkInformation(): NetworkInformation | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/** Connections on which ~7 MB of speculative download is not acceptable (§I-8). */
const METERED_EFFECTIVE_TYPES = new Set(["slow-2g", "2g", "3g"]);

function isMeteredConnection(): boolean {
  const connection = networkInformation();
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return (
    connection.effectiveType !== undefined &&
    METERED_EFFECTIVE_TYPES.has(connection.effectiveType)
  );
}

let roomAssetsPreloaded = false;

/**
 * Warm every room preset's HDRI plus the piece GLB, once per session. Called when the
 * in-game settings drawer opens (game-shell) and on the first room-list hover/focus
 * here. Safe to call any number of times; a no-op after the first run and on metered
 * links.
 *
 * The HDRIs are NOT marked warmed here. `preloadBoard3D` resolves as soon as the chunk
 * is imported — `useEnvironment.preload`/`useGLTF.preload` are fire-and-forget, so a
 * file that 404s or dies on a flaky connection never reaches the `catch`. Marking them
 * up front therefore suppressed the hover retry permanently for the very users it
 * exists for; `prefetchHdri` owns the `warmed` set alone, and a duplicate request for
 * an already-cached HDRI is a cheap disk hit.
 *
 * @returns true when THIS call started the bulk warm, so a caller that also wants one
 * specific file can skip the redundant single fetch.
 */
export function preloadRoomAssets(): boolean {
  if (roomAssetsPreloaded || typeof window === "undefined") return false;
  if (isMeteredConnection()) return false;
  roomAssetsPreloaded = true;
  void preloadBoard3D(HDRI_FILES).catch(() => {
    // The chunk failed; let hover/selection retry file by file.
    roomAssetsPreloaded = false;
  });
  return true;
}

/**
 * Hover/focus on the room list: the earliest reliable "a preset switch is coming" signal
 * on `/settings`, which has no drawer to open. The bulk warm covers every HDRI, so the
 * single-file fetch only runs when it declined (already warmed this session, a metered
 * link, or the in-game drawer got there first).
 */
function warmRoom(url: string): void {
  if (!preloadRoomAssets()) prefetchHdri(url);
}

function prefetchHdri(url: string): void {
  if (warmed.has(url) || typeof window === "undefined") return;
  if (networkInformation()?.saveData === true) return;
  warmed.add(url);
  fetch(url, { cache: "force-cache" })
    .then((response) => response.arrayBuffer())
    .catch(() => {
      warmed.delete(url);
    });
}

export function RoomPicker({ save }: { save: (patch: Partial<PlayerSettings>) => void }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const generateUploadUrl = useMutation(api.players.generateUploadUrl);
  const setRoomImage = useMutation(api.players.setRoomImage);
  const clearRoomImage = useMutation(api.players.clearRoomImage);

  const roomPreset = useUiStore((s) => s.roomPreset);
  const roomColors = useUiStore((s) => s.roomColors);
  const setRoomPreset = useUiStore((s) => s.setRoomPreset);
  const setRoomColors = useUiStore((s) => s.setRoomColors);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const colours = roomColors ?? DEFAULT_ROOM_COLORS;
  // Resolved rather than hard-coded so the warmed file follows `resolveRoom`'s
  // choice of base preset if that ever changes.
  const customRoom = resolveRoom("custom", colours);

  function choose(preset: RoomPresetId) {
    setRoomPreset(preset);
    if (preset === "custom") {
      // Custom is Minimal White's rig with the player's colours — `background:
      // "colour"` only drops the skybox, the HDRI is still the IBL source
      // (board3d/room.tsx). Warm it like any other preset or the first game after
      // picking Custom mounts unlit until minimal.hdr downloads.
      prefetchHdri(customRoom.hdri);
      // Make sure the server has something to store the first time custom is picked.
      const next = roomColors ?? DEFAULT_ROOM_COLORS;
      setRoomColors(next);
      save({ roomPreset: preset, roomColors: next });
      return;
    }
    prefetchHdri(ROOMS[preset].hdri);
    save({ roomPreset: preset });
  }

  function previewColours(next: RoomColors) {
    setRoomColors(next);
    save({ roomColors: next });
  }

  async function upload(file: File) {
    if (uploading) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image.");
      return;
    }
    if (file.size > MAX_ROOM_IMAGE_BYTES) {
      toast.error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${
          MAX_ROOM_IMAGE_BYTES / 1024 / 1024
        } MB.`,
      );
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`upload failed with ${response.status}`);
      const { storageId } = (await response.json()) as { storageId: string };
      await setRoomImage({ storageId: storageId as Id<"_storage"> });
      // The mutation forces `roomPreset: "custom"` server-side; mirror it locally.
      setRoomPreset("custom");
      toast.success("Background image saved.");
    } catch (error) {
      toast.error(describeConvexError(error, "Could not save that image."));
    } finally {
      setUploading(false);
      if (fileInput.current !== null) fileInput.current.value = "";
    }
  }

  async function clearImage() {
    try {
      await clearRoomImage({});
      toast.success("Background image removed.");
    } catch (error) {
      toast.error(describeConvexError(error, "Could not remove that image."));
    }
  }

  return (
    <div className="@container grid gap-5">
      <div
        role="group"
        aria-label="Room preset"
        className="grid grid-cols-2 gap-2 @xl:grid-cols-3"
      >
        {ROOM_ORDER.map((id) => {
          const room = ROOMS[id];
          return (
            <RoomCard
              key={id}
              name={room.label}
              description={room.description}
              lightSquare={room.board.lightSquare}
              darkSquare={room.board.darkSquare}
              active={roomPreset === id}
              onClick={() => choose(id)}
              onPointerEnter={() => warmRoom(room.hdri)}
              onFocus={() => warmRoom(room.hdri)}
            />
          );
        })}

        <RoomCard
          name="Custom"
          description="Your own colours, and an optional backdrop image."
          lightSquare={colours.lightSquare}
          darkSquare={colours.darkSquare}
          active={roomPreset === "custom"}
          onClick={() => choose("custom")}
          onPointerEnter={() => warmRoom(customRoom.hdri)}
          onFocus={() => warmRoom(customRoom.hdri)}
        />
      </div>

      {roomPreset === "custom" ? (
        <div className="grid gap-5 rounded-xl border border-border bg-bg-sunken p-3">
          <ColourPickers
            value={colours}
            onPreview={previewColours}
            onCommit={previewColours}
          />

          <div className="grid gap-2">
            <Label htmlFor="room-image">Background image (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Used as a blurred backdrop behind the board, not as an environment map. PNG or JPEG,
              up to {MAX_ROOM_IMAGE_BYTES / 1024 / 1024} MB.
            </p>
            <input
              ref={fileInput}
              id="room-image"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void upload(file);
              }}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted disabled:opacity-50"
            />
            {me?.roomImageUrl ? (
              <div className="flex items-center gap-3">
                {/* Convex storage URLs are not a configured next/image remote pattern,
                    and this is a user-supplied blob, so a plain img is correct here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={me.roomImageUrl}
                  alt="Your custom board background"
                  className="h-16 w-24 rounded-lg border border-border object-cover"
                />
                <Button variant="outline" size="sm" onClick={clearImage} disabled={uploading}>
                  Remove image
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
