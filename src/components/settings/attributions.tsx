import { PIECE_MODEL_CREDIT } from "@/lib/constants";

/**
 * MANDATORY (§I-7). The piece models are CC-BY 3.0, not CC0, so this credit is a
 * licence obligation and must stay reachable in the UI. The strings come from
 * `PIECE_MODEL_CREDIT` in `src/lib/constants.ts` — do not retype them; the full
 * text lives in `public/models/ATTRIBUTION.md`.
 *
 * The Poly Haven HDRIs are CC0 and need no attribution; the photographers are
 * credited anyway because it costs nothing.
 */
const HDRI_CREDITS: ReadonlyArray<{ room: string; asset: string; author: string }> = [
  { room: "Classic Study", asset: "combination_room", author: "Sergej Majboroda" },
  { room: "Space", asset: "qwantani_night_puresky", author: "Greg Zaal, Jarod Guest" },
  { room: "Park", asset: "meadow_2", author: "Sergej Majboroda" },
  { room: "Neon Arcade", asset: "white_studio_06", author: "Grzegorz Wronkowski" },
  { room: "Minimal White", asset: "white_studio_06", author: "Grzegorz Wronkowski" },
];

export function Attributions() {
  return (
    <div className="grid gap-4 text-sm">
      <div>
        <h3 className="font-medium">3D piece models</h3>
        <p className="mt-1 text-muted-foreground">
          {PIECE_MODEL_CREDIT.text}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <a
            href={PIECE_MODEL_CREDIT.authorUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Poly Pizza
          </a>
          <a
            href={PIECE_MODEL_CREDIT.licenseUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            CC BY 3.0 licence
          </a>
        </p>
      </div>

      <div>
        <h3 className="font-medium">Room environments</h3>
        <p className="mt-1 text-muted-foreground">
          HDRIs from{" "}
          <a
            href="https://polyhaven.com"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Poly Haven
          </a>
          , released under CC0. Attribution is not required; the photographers are credited here
          anyway.
        </p>
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
          {HDRI_CREDITS.map((credit) => (
            <li key={credit.room}>
              <span className="text-foreground">{credit.room}</span> — {credit.asset} by{" "}
              {credit.author}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          The study panorama was created with image generation. The space nebula and neon
          pavilion are rendered procedurally.
        </p>
      </div>

      <div>
        <h3 className="font-medium">Chess engine</h3>
        <p className="mt-1 text-muted-foreground">
          Stockfish 11, licensed under the GPL v3. The full licence ships alongside the engine at{" "}
          <code className="font-mono text-xs">/stockfish/sf11/LICENSE-GPL-3.0.txt</code>.
        </p>
      </div>
    </div>
  );
}
