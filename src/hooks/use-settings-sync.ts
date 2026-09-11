"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { PlayerSettings } from "@/lib/types";
import { selectPersistedSettings, useUiStore } from "@/lib/stores/ui-store";
import { describeConvexError } from "@/components/providers/convex-errors";

/** How long a colour drag may pause before the value is written to Convex. */
const WRITE_DEBOUNCE_MS = 400;

/**
 * Settings the player has changed by hand this session. The seed below lands
 * whenever `players.me` first resolves, which can be AFTER a change the user has
 * already made (the form unblocks on the synchronous localStorage rehydrate, the
 * query needs a round trip and, on a first sign-in, `ensurePlayer` before it) —
 * seeding those keys would visibly revert a control the user just touched while
 * Convex already holds the new value.
 *
 * Module-level because the reader (`useSettingsSync`, mounted once in the root
 * layout) and the writer (`useSettingsWriter`, mounted by the settings UI and the
 * game shell) are separate hooks with no shared component between them.
 */
const locallyChanged = new Set<keyof PlayerSettings>();

/** The server's value for `key`, unless the player has already changed it here. */
function preferLocal<K extends keyof PlayerSettings>(
  key: K,
  server: PlayerSettings,
  local: PlayerSettings,
): PlayerSettings[K] {
  return locallyChanged.has(key) ? local[key] : server[key];
}

/**
 * §E.1 step 7. Reads `players.me` once per session and seeds the ui-store from it
 * (Convex wins over anything rehydrated from localStorage).
 *
 * Deliberately seeds ONCE: `players.me` is a live subscription that also carries
 * ratings and W/L/D, so re-hydrating on every emission would clobber an in-flight
 * local change every time the player's rating moved.
 */
export function useSettingsSync(): void {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const hydrateFromServer = useUiStore((s) => s.hydrateFromServer);
  const seeded = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      seeded.current = false;
      locallyChanged.clear();
      return;
    }
    if (seeded.current || me === undefined || me === null) return;
    seeded.current = true;

    const server: PlayerSettings = {
      boardView: me.boardView,
      roomPreset: me.roomPreset,
      roomColors: me.roomColors ?? null,
      boardFlipEnabled: me.boardFlipEnabled,
      qualityTier: me.qualityTier,
      postFxEnabled: me.postFxEnabled,
    };
    // Anything the player already changed while this query was in flight wins —
    // its own write is on its way to Convex, and because the seed only ever runs
    // once, overwriting it here would stick until a reload.
    const local = selectPersistedSettings(useUiStore.getState());

    // Not a React setState — zustand's `set` is safe under react-hooks/set-state-in-effect.
    hydrateFromServer({
      boardView: preferLocal("boardView", server, local),
      roomPreset: preferLocal("roomPreset", server, local),
      roomColors: preferLocal("roomColors", server, local),
      boardFlipEnabled: preferLocal("boardFlipEnabled", server, local),
      qualityTier: preferLocal("qualityTier", server, local),
      postFxEnabled: preferLocal("postFxEnabled", server, local),
    });
  }, [isAuthenticated, me, hydrateFromServer]);

  // FR-21k. The uploaded backdrop is NOT one of the seeded settings: it is a signed
  // storage URL that changes whenever the player uploads or clears an image, so it is
  // mirrored on every emission instead of once. It is session-only in the ui-store
  // (the URL expires, so persisting it would resurrect a dead link).
  const roomImageUrl = isAuthenticated ? (me?.roomImageUrl ?? null) : null;
  useEffect(() => {
    useUiStore.getState().setRoomImageUrl(roomImageUrl);
  }, [roomImageUrl]);
}

/**
 * The write-back half. Returns a debounced patch function for the settings UI:
 * every control updates the ui-store synchronously (live preview) and calls this
 * to persist. Colour drags fire dozens of times a second, so coalesce them —
 * never one mutation per drag tick (FR-21j).
 */
export function useSettingsWriter(): (patch: Partial<PlayerSettings>) => void {
  const { isAuthenticated } = useConvexAuth();
  // Already subscribed by `useSettingsSync` in the root layout, so Convex serves
  // this from the same subscription rather than opening a second one.
  const me = useQuery(api.players.me, isAuthenticated ? {} : "skip");
  const updateSettings = useMutation(api.players.updateSettings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<Partial<PlayerSettings>>({});

  // Mirrored into a ref so the rejection path can read the current server state
  // without `flush` — and therefore the returned callback — changing identity on
  // every emission of a query that also carries ratings and W/L/D.
  const server = useRef<PlayerSettings | null>(null);
  useEffect(() => {
    server.current =
      me === undefined || me === null
        ? null
        : {
            boardView: me.boardView,
            roomPreset: me.roomPreset,
            roomColors: me.roomColors ?? null,
            boardFlipEnabled: me.boardFlipEnabled,
            qualityTier: me.qualityTier,
            postFxEnabled: me.postFxEnabled,
          };
  }, [me]);

  const flush = useCallback(() => {
    timer.current = null;
    const patch = queued.current;
    queued.current = {};
    if (Object.keys(patch).length === 0) return;
    updateSettings(patch).catch((error: unknown) => {
      console.error("[settings-sync] updateSettings failed", error);
      // Every control applies its change to the store first, so a rejected write
      // leaves the UI showing a value Convex never stored — and /settings promises
      // the opposite ("Changes save themselves"). Say so, and put the store back
      // to what the server actually holds so the two agree again.
      toast.error(describeConvexError(error, "Could not save that setting."));
      const latest = server.current;
      if (latest !== null) {
        locallyChanged.clear();
        useUiStore.getState().hydrateFromServer(latest);
      }
    });
  }, [updateSettings]);

  useEffect(() => {
    // Flush anything still pending when the settings UI unmounts.
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        flush();
      }
    };
  }, [flush]);

  return useCallback(
    (patch: Partial<PlayerSettings>) => {
      // Remember what the player touched so the one-shot seed from `players.me`
      // cannot arrive later and revert it.
      for (const key of Object.keys(patch) as (keyof PlayerSettings)[]) {
        locallyChanged.add(key);
      }
      queued.current = { ...queued.current, ...patch };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [flush],
  );
}
