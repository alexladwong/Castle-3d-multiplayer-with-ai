# Assets research: Poly Haven HDRIs + chess piece models

Verified 2026-09-09 against the live Poly Haven API / CDN, live poly.pizza pages, and the installed
packages (`three@0.185.1`, `@types/three@0.185.4`, `@react-three/drei@10.7.8`). Everything below
that names a URL, byte count, prop or signature was checked directly; see "Source" notes.

TL;DR
- Five 1k CC0 `.hdr` files are **already downloaded** to `public/hdri/{study,space,park,arcade,minimal}.hdr`
  (md5-verified against the Poly Haven API). Total 7,256,091 bytes (6.92 MiB); each file < 1,572,864 bytes.
- **No CC0 chess GLB exists on Poly Pizza** (every chess hit is CC-BY 3.0; Sketchfab needs login). Nothing was
  downloaded into `public/models/`. Build pieces procedurally with `THREE.LatheGeometry` using the profiles in
  section B3 (plus an extruded knight head).

> **UPDATE (later pass) - read section B3 before acting on the two bullets above.** A chess set
> **has** since been downloaded, re-baked and verified: `public/models/chess-pieces.glb`
> (96,580 bytes, six separate meshes named `King/Queen/Rook/Bishop/Knight/Pawn`, PBR, no Draco,
> 1 board square = 1 unit, base at `y = 0`). It is **CC-BY 3.0, not CC0** - attribution is
> mandatory, see `public/models/ATTRIBUTION.md`. The `LatheGeometry` profiles (which live in
> section **B2**, not B3) are now the documented **fallback**, not the plan.

---

## A. Poly Haven HDRIs

### A1. Public API (verified with curl)

| Endpoint | Returns | Notes |
|---|---|---|
| `GET https://api.polyhaven.com/assets?t=hdris` | JSON object keyed by asset id (994 HDRIs on 2026-09-09) | Each value: `name, categories[], tags[], description, authors{}, max_resolution[w,h], date_published, thumbnail_url, download_count, ...`. ~1 MB response. |
| `GET https://api.polyhaven.com/info/<id>` | Same record for one asset | e.g. `/info/fireplace` |
| `GET https://api.polyhaven.com/files/<id>` | `{ hdri: { "1k": { hdr: {url,size,md5}, exr: {url,size,md5} }, "2k": ..., "4k": ..., "8k": ..., "16k": ... , ["20k"/"24k"] } }` | **1k is the smallest resolution served** for every asset checked (keys were `1k,2k,4k,8k,16k[,20k/24k]`). No 512 px tier exists. |

Direct download URL pattern (verified 200 for all five below):

```
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<id>_1k.hdr
https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/1k/<id>_1k.exr
```

Gotchas found:
- `Content-Type` on dl.polyhaven.org is inconsistent (`application/octet-stream` for 4 files, `image/vnd.radiance` for `meadow_2`). drei picks the loader from the **file extension**, not the MIME type, so this does not matter (see A4).
- `Content-Length` header equals the API `size` field exactly; use the API to pre-filter instead of HEAD-ing hundreds of files.
- Almost every 1k `.hdr` is 1.5–1.9 MB. Out of ~300 candidates only ~70 are under the 1,572,864-byte cap (NFR-9). The 1k `.exr` is *sometimes* smaller (e.g. `cyclorama_hard_light` exr = 882,171 B vs hdr = 1,409,707 B) but for the newer 20k/24k-source assets the 1k `.exr` balloons to 5.5–6.2 MB (e.g. `kloppenheim_02_puresky` exr = 5,486,574 B). So `.exr` is not a reliable way to shrink; `.hdr` 1k is the safe choice.
- Licence: Poly Haven's licence page (`https://polyhaven.com/license`) states all assets are CC0 ("CC0 means absolute freedom"). No attribution required, but crediting the photographer is polite; authors are listed below.

### A2. Chosen presets (downloaded)

Files live at `public/hdri/<room>.hdr` and are served statically by Next.js at `/hdri/<room>.hdr`.

| Room (PRD FR-21i) | `players.roomPreset` | Poly Haven id | Source URL | Bytes | md5 (matches API) | Author(s) | Licence |
|---|---|---|---|---|---|---|---|
| Classic Study (warm indoor, wood) | `study` | `combination_room` | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/combination_room_1k.hdr | 1,661,444 | `490f50c323b9329e5aa4a2ea32dc23aa` | Sergej Majboroda | CC0 |
| Space (dark) | `space` | `qwantani_night_puresky` | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/qwantani_night_puresky_1k.hdr | 1,389,258 | `e8691211295e505f77c8c3bdcf3055d9` | Greg Zaal (photo), Jarod Guest (processing) | CC0 |
| Park (outdoor daylight, greenery) | `park` | `meadow_2` | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/meadow_2_1k.hdr | 1,552,993 | `7deac04bbf250f12a4daf1afaa6cab5f` | Sergej Majboroda | CC0 |
| Neon Arcade (dark, coloured lights) | `arcade` | `ferndale_studio_06` | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/ferndale_studio_06_1k.hdr | 1,228,415 | `87eb6541fcc367bce545a458c18190ec` | Dimitrios Savva, Greg Zaal | CC0 |
| Minimal White (bright clean studio) | `minimal` | `white_studio_06` | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/white_studio_06_1k.hdr | 1,330,672 | `d9950d6316c57b1b92494d909bd1a92a` | Grzegorz Wronkowski | CC0 |

Total: **7,162,782 bytes (6.83 MiB)** since the Study swap (§A2d). All five are
`#?RADIANCE` RGBE files, 1024x512, HTTP 200. Four are inside NFR-9's 1,572,864-byte cap;
the Study is 1,661,444 under a written waiver (§A2d).

What each one looks like (checked against the Poly Haven thumbnails):
- `combination_room`: a college combination room — gold damask walls, an inlaid parquet floor, a buttoned settee, a gilt armchair, a marble side table, a brass chandelier, and one bay window blown to white. Daylit and medium contrast, so the room is lit DOWN and keyed warm (see §A2d). It replaced `fireplace` — a night lounge whose amber fireplace was only a third of it and whose other two thirds were a couch under a mustard blanket (§A2c, §A2d).
- `qwantani_night_puresky`: pure sky, clear low-contrast night, visible Milky Way, faint horizon glow, no ground/props. The darkest suitable sky Poly Haven has; there is **no true starfield HDRI**. Add drei `<Stars>` on top (A4) and consider `backgroundIntensity` 0.6–0.8 so the horizon glow does not read as "dawn". Board: dark glass/metal.
- `meadow_2`: bright morning/afternoon meadow clearing, clear blue sky, direct sun, trees all round. Strong natural key from the sun; a directional light at roughly the sun azimuth gives matching shadows. Board: light wood / stone.
- `ferndale_studio_06`: an unlit black room washed magenta from a big practical globe lamp, with a violet panel opposite; magenta floor, dark walls, almost nothing else in it. Reads as a club floor rather than a photo studio. (It replaced `wooden_studio_10` — see §A2c.)
- `white_studio_06`: bright white studio, big skylight, soft low-contrast natural light. Board: matte white/light grey, subtle reflections.

Runner-ups that also fit the size cap (all verified via `/files/<id>`; swap without re-researching):

| Room | id | 1k hdr bytes | Why |
|---|---|---|---|
| study | `warm_bar` | 1,487,340 | cosy pub, amber night light, wood — but see §A2c, its bar carries brand marks |
| study | `lythwood_lounge` | 1,538,903 | warm hotel lounge, daytime |
| study | `brown_photostudio_06` | 1,569,967 | herringbone wood floor, warm sunlight through curtains (only 2.9 KB under the cap) |
| study | `christmas_photo_studio_05` | 1,513,182 | Victorian room with fireplace (has Christmas decor) |
| space | `kloppenheim_02_puresky` | 1,393,622 | clear night sky but with a bright moon bloom (less "space") |
| space | `qwantani_moon_noon_puresky` | 1,220,313 | smallest night sky; moonlit, high contrast |
| space | `qwantani_moonrise_puresky` | 1,272,812 | moonrise, cool blue |
| park | `bismarckturm` | 1,304,988 | grassy park with path, golden-hour low-contrast |
| park | `binnenalster` | 1,564,865 | overcast lakeside city park |
| park | `misty_dawn` / `spruit_sunrise` | 1,512,633 / 1,500,948 | field at dawn/sunrise |
| arcade | `ferndale_studio_05` | 1,373,092 | dark studio flooded pink/purple |
| arcade | `wooden_studio_10` | 1,453,939 | the ORIGINAL Arcade pick, replaced in §A2c |
| arcade | `newman_lobby` | 1,534,472 | real magenta neon sign, glossy floor, but brighter/mall-like |
| arcade | `wooden_studio_09` | 1,516,235 | red/teal/blue LEDs, black floor |
| minimal | `cyclorama_hard_light` | 1,409,707 | white cyc, hard umbrella light (its 1k exr is only 882,171 B) |
| minimal | `white_studio_02` | 1,312,076 | white studio, low contrast |
| minimal | `story_studio_04` / `studio_wizja_01` | 1,368,186 / 1,359,911 | white infinity cove |

Rejected because 1k hdr > 1,572,864 B: `studio_small_09` (1,615,248), `neon_photostudio` (1,618,638), `moonless_golf` (1,672,754), `dikhololo_night` (1,745,132), `greenwich_park_02` (1,854,789), `comfy_cafe` (1,609,391), `brown_photostudio_01` (1,649,529), `rooitou_park` (1,588,504), `photo_studio_01` (1,597,273), `hotel_room` (1,572,830 - technically under by 34 bytes, too tight).

### A2b. Tonemapped skybox JPGs (the visible background)

The 1k `.hdr` above is a **light probe**: 1024x512 of HDR data, ample for irradiance and
reflections and nowhere near enough to fill a hero canvas. Showing it raw put visible
pixels on screen, so every room carried a `backgroundBlurriness` of 0.15-0.4 to hide the
resolution — which is exactly why the background read as a smear. Poly Haven publishes a
**tonemapped JPG** of every HDRI at 8192x4096; those are now the skybox, and the `.hdr`
does nothing but light the scene (`board3d/room.tsx` renders them through drei's
`<Environment map background="only">`, which leaves `scene.environment` on the HDRI).

The API exposes them at the TOP LEVEL of `/files/<id>`, not inside `hdri`:

```
GET https://api.polyhaven.com/files/fireplace
{ "tonemapped": { "url": "...", "size": 4528196, "md5": "..." }, "hdri": { "1k": {...}, ... } }
```

URL pattern (note the encoded space — the directory really is `Tonemapped JPG`):

```
https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/<id>.jpg
```

Downscaled and re-compressed with macOS `sips` (`-Z <width>`, then
`-s format jpeg -s formatOptions <q>`), md5 of every source verified against the API
before processing. Served from `public/backdrops/<room>.jpg` at `/backdrops/<room>.jpg`,
with the same 30-day `Cache-Control` as `/hdri/*` (added to `next.config.ts`).

| Room | Poly Haven id | Source bytes | Shipped | Bytes | Author | Licence |
|---|---|---|---|---|---|---|
| Classic Study | `combination_room` | 5,285,998 (8192x4096) | 3584x1792 q72 | 1,489,755 | Sergej Majboroda | CC0 |
| Park | `meadow_2` | 51,148,187 (8192x4096) | 3072x1536 q70 | 1,546,531 | Sergej Majboroda | CC0 |
| Neon Arcade | `ferndale_studio_06` | 13,979,828 (8192x4096) | 4096x2048 q72 | 562,968 | Dimitrios Savva, Greg Zaal | CC0 |
| Minimal White | `white_studio_06` | 15,553,777 (8192x4096) | 4096x2048 q72 | 545,037 | Grzegorz Wronkowski | CC0 |

Source md5s, from `/files/<id>` and checked against the download before processing (the
shipped JPGs are re-encoded, so their own hashes differ):

| Poly Haven id | tonemapped md5 |
|---|---|
| `combination_room` | `2b279b4ca8ffe85a4851c35d81c8aa7d` |
| `meadow_2` | `5c34334a1e9d276f2390dce0f9e9d3e1` |
| `ferndale_studio_06` | `1650956c719cbde51a04311c8361e7b3` |
| `white_studio_06` | `eac2afbe7a370155e4e334b875fb0ded` |

Total 4,144,291 bytes, and never fetched together: one room is one extra JPG — 1.49 /
1.55 / 0.56 / 0.55 MB. **Space has none** — that room's background is
a flat `#04060d` plus drei `<Stars>`, by design (see A2).

Study and Park are the odd sizes. `combination_room`'s inlaid parquet fills most of the
frame and costs 2,047,644 B at 4096 q72; 3584 q72 is 1,489,755 B and keeps q72's detail,
where 4096 at the q55-q60 that would have fitted puts visible blocking into the room's
flat plaster. Meadow grass is high-entropy and would not come under the 1.6 MB
budget at 4096 (3.18 MB at q72, still 1.80 MB at q45), so it ships at 3072 wide instead,
where q70 buys more detail per byte than 4096 at q45 would.

Three things had to be true for these to render correctly, all verified in
`three@0.185.1`:
- `texture.mapping = EquirectangularReflectionMapping` and `texture.colorSpace =
  SRGBColorSpace`. Without the mapping, `WebGLBackground` falls through to its
  *plane* branch and paints the photo flat across the screen with no perspective and no
  `backgroundRotation`.
- `scene.backgroundBlurriness = 0`. Above zero, `WebGLEnvironments.get` runs the texture
  through `PMREMGenerator` instead of a plain cube conversion — i.e. the blur is not a
  post-effect you can dial back, it changes which texture is sampled.
- three tone-maps a background only when its colour space is NOT sRGB
  (`WebGLBackground.js`: `material.toneMapped = getTransfer(colorSpace) !== SRGBTransfer`),
  so an already-tonemapped JPG is passed through untouched. This is why `bgIntensity`
  still means what it meant.

VRAM, worth knowing before raising the resolution again: `scene.background` with an
equirect texture is converted to a `WebGLCubeRenderTarget` whose faces are `image.height`
square. A 4096x2048 backdrop therefore costs 6 x 2048² x 4 B = **100 MB** of cube target
plus 33 MB for the source texture; the 3072-wide Park costs 57 MB + 19 MB. That is the
real budget of this change, not the download.

### A2c. Which way the room faces (`lights.envYaw`), and the Arcade swap

Verified 2026-09-10 in the browser, not from thumbnails: a Playwright script
(`shoot.mjs`, kept in the curation scratchpad) loaded `/dev/board3d?room=&seat=` with a
temporary `?yaw=&hdri=&backdrop=` override, screenshotted the canvas at eight yaws 45 deg
apart from both seats, and laid the frames out as one contact sheet per asset.

**The thing that decides every yaw.** A seat camera sits at y 7.5 and looks at the board,
which is 40 deg below the horizon; with a 40 deg vertical fov the panorama is only ever
visible between roughly 20 and 60 deg BELOW its horizon. That is the LOWER WALL AND THE
FLOOR of the room and nothing else — no ceiling, no skyline, and none of the part of an
HDRI that its Poly Haven thumbnail shows off. Judge a candidate by cropping v 0.42-0.78
of the equirect into a strip and reading that; the rest of the image is only lighting.

Empirical mapping, measured on `fireplace` and confirmed on `ferndale_studio_06` (three
of the four terms in `<Environment>` cancel, so it is worth writing down rather than
deriving):

```
centre_u(yaw) = 0.25 + yaw / 2*PI     (mod 1)     // what the WHITE seat faces
yaw(u)        = 2*PI * (u - 0.25)     (mod 2*PI)
```

The black seat faces `centre_u + 0.5`, and a 16:9 canvas sees about +/- 0.085 in u
(61 deg of horizontal fov), so a feature more than ~0.09 away in u is safely out of frame.

| Room | Asset | `envYaw` | Why |
|---|---|---|---|
| study | `fireplace` (REPLACED in §A2d) | **1.65** | Faces the stove and the stone chimney breast. Was 0, which faced the far corner of the lounge — the yellow blanket over the couch, and the tiled floor. The exact value is set by a pair of shoes on the hearthrug at u 0.634-0.671, only 18 deg from the fire: 1.65 clears them by ~11 deg on a 16:9 canvas, 1.78 frames the fire better but let a toecap into the corner at 1440x900, and 1.90 and up puts them in properly. |
| space | `qwantani_night_puresky` | 0.6 (unchanged) | Background is a flat colour plus `<Stars>`; the HDRI is IBL only, so the yaw only turns the reflections. |
| park | `meadow_2` | -0.4 (unchanged) | Re-checked at 4 yaws. Grass and trees the whole way round, and `floor: ground` projects the meadow under the board, so the seat view barely changes; -0.4 keeps the mown path rather than the bald patches at u 0.6 / 0.75 behind the board. |
| arcade | `ferndale_studio_06` (NEW) | **2.83** | The wash just right of the studio's big magenta globe lamp: a clean gradient from a hot centre to black in the corners, with the lamp, its stand, the floor cable and the bench all out of frame. |
| minimal | `white_studio_06` | 0 (unchanged) | Re-checked at 4 yaws. It is a working photo studio (beauty dish, stands, cables, a black curtain) but this is the one room with `floor: backdrop`, and drei's `<Backdrop>` cyclorama fills the seat frame edge to edge — the skybox is never on screen and the yaw makes no visible difference. |

**Why the Arcade asset was replaced.** `wooden_studio_10`'s visible band is a wooden
floor with a power strip, trailing cables, light stands, a prop sphere and two windows
with venetian blinds; there is no arc of it that is clean, so no yaw could save it.
`ferndale_studio_06` is a black room washed magenta by one practical globe lamp: dark
walls, a magenta floor, a bench and a doorway in one quadrant, one cable across the floor
in another, and about 140 deg of nothing but gradient — which is what the room card
("Black gloss, magenta and cyan") actually describes. It is also the smallest 1k `.hdr`
of any candidate (1,228,415 B) and its tonemapped JPG compresses to 562,968 B at
4096x2048 q72, against 1,574,766 B for the one it replaces.

Rejected for the Arcade, all verified in the harness: `ferndale_studio_05` (clean, but a
flat even purple with no gradient — reads as a painted wall); `ferndale_studio_10` (the
only candidate with real magenta AND real cyan, but its band is tripods, stands, a
monitor and cables from end to end, and it blows the board's blacks out); `ferndale_studio_02`
(blue/teal, not magenta); `newman_lobby` (a genuine magenta neon sign — spelling
"TRAPDOOR", plus posters: text and brand marks, disqualified on sight); `wooden_studio_09`
(same room and same blinds and cables as `wooden_studio_10`, in red/teal).

**Nothing on Poly Haven beat `fireplace` for the Study under the 1,572,864-byte cap**, so
that room ships a better yaw rather than a new asset. Rejected, all rendered in the
harness first: `warm_bar` (the best-looking room of the lot — timber roof, stone bar,
terracotta — but its counter carries branded bar runners, beer taps, menu cards and two
TVs showing a rugby match, and cold daylight glass doors sit a quarter turn from the
fire); `warm_restaurant_night` (a lodge dining room with laid tables — plates, napkins,
wicker chairs — in frame from both seats); `warm_reception_dinner` (a bare concrete-floored
banquet barn; warm, but nothing in the band except a stove and a barrel);
`lythwood_lounge` (one lovely parquet-and-chandelier third, five-sixths pale daylight
lounge). Over the cap and therefore never rendered: `wooden_lounge` (1,631,135),
`combination_room` (1,661,444), `pine_attic` (1,644,300), `cowboy_town_saloon` (1,733,523),
`billiard_hall` (1,629,669), `glasshouse_interior` (1,636,636), `music_hall_01` (1,650,132),
`colorful_studio` (1,666,933), `cayley_interior` (1,709,967), `aft_lounge` (1,776,815).

**Known limitation, Classic Study — FIXED in §A2d**, by both halves of it: the orbit is
now a bounded sweep and the asset is now a club room. The paragraph below is the record of
the problem.

`envYaw` fixes the two SEATS, which is where a
player spends a game, and it cannot fix the landing hero: FR-24's cinematic orbit turns a
full circle every ~42 s, so every part of the panorama eventually comes round. About 60%
of `fireplace` is a couch under a mustard blanket, and the hero lands on it roughly 5-25 s
after a room is chosen. The one candidate that is uniformly acceptable all the way round —
`warm_restaurant_night` — was rendered through a full orbit for exactly this comparison
and is worse in every frame: flat, monotone terracotta with no dark and no fire, and the
board's dark squares disappear into the floor. Fixing this properly needs an asset Poly
Haven does not have under the size cap (a real panelled library or club room), or a
modelled room instead of a photograph. See the orbit contact sheets in the curation
scratchpad.

**Light retune that came with the two changes** (`src/lib/rooms.ts`):

| Room | Before | After | Why |
|---|---|---|---|
| study | key `#ffd9a8` 2.2, env 1.0, bg 1.0 | key `#ffd9a8` **2.3**, env **0.9**, bg **0.95** | With the fire in frame the panorama does more of the lighting; the env comes down and the key up so the dark squares stay walnut instead of going orange. |
| arcade | key `#ff6ad5` 1.8, env 1.2, bg 1.0 | key **`#7cf7ff`** **1.7**, env **0.9**, bg **0.85** | The new panorama is magenta wall to wall, and a magenta key on top of it made every piece the same pink. The key becomes the room's own cyan — the token the sparkles and the legal-move highlight already use — so the two of them are the "magenta and cyan" of the room card. `glow` stays `#ff6ad5`: the ENVIRONMENT is what spills onto the page. 1.7 rather than 2.0 because the squares are metalness 0.75 / roughness 0.14 and a 2.0 key blew them to white at the top of the cinematic orbit. |

### A2d. The bounded hero sweep, and the Study swap (2026-09-10)

Two changes, and the first is the reason for the second.

**1. FR-24's idle camera no longer turns a full circle.** It swings. `RoomPreset.orbit`
(`{ centerAzimuth, halfArc }`, radians — `src/lib/camera.ts` `OrbitSweep`) gives every
room an arc, and `camera-rig.tsx` eases the azimuth back and forth across it:

```
azimuth(t) = centerAzimuth + halfArc * sin(omega * t),   omega = cinematicSpeed / halfArc
```

- `centerAzimuth` is a CAMERA azimuth in camera-controls' terms — three's
  `Spherical.theta = atan2(x, z)` measured from the board — so **0 is the white seat** and
  a positive value turns the camera anticlockwise seen from above. The exact relation to
  `envYaw` is `u_faced(A) = 0.25 + (envYaw - A) / 2*PI`: the §A2c mapping with the camera
  turned instead of the room, so one radian of centre walks the view one radian the OTHER
  way round the panorama.
- `halfArc` defaults to **0.95 rad (~55 deg)**, a 110 deg sweep. Every room ships that.
- `omega` is set so the speed at the middle of the arc is exactly `cinematicSpeed`
  (0.15 rad/s) — the pace the full circle ran at. A wider arc therefore takes longer
  rather than moving faster. One there-and-back is `2*PI*halfArc / cinematicSpeed` =
  **39.8 s** at the default, against ~42 s for the old full turn.
- The motion is a sine, so the SPEED is a cosine: fastest across the middle, easing to
  nothing and away again at each end. No corner, no stop, no rewind.
- The per-frame turn is RELATIVE (`orbitStep` returns a delta for `controls.rotate`), so a
  visitor who drags the hero board keeps their own view instead of being pulled back onto
  a line — which is exactly what the old orbit did.
- The cinematic PRESET pose is rotated to `centerAzimuth` (`rotatePoseAzimuth`), so the
  camera opens in the middle of the arc; under `prefers-reduced-motion` it stops there and
  stays. A room change re-aims it; a resize does not (the transition is keyed on the
  centre, never on the aspect).
- The exact projected-bounds fit follows the arc: `orbitFitDistance(..., halfArc)` takes
  its worst case over the azimuths the sweep actually visits. For every room shipped today
  that is the same number as before, and provably so: the board's footprint is square, so
  the fit peaks every 90 deg, and any arc wider than 45 deg either side of anywhere
  contains a peak. The bounded sweep buys a better view, not a nearer camera. Covered by
  `src/lib/__tests__/camera-fit.test.ts`, which projects all sixteen box corners at 41
  azimuths per room at aspects 1.6 (1440x900), 1.333 (1024x768), 1, 0.87 and 0.7.

Arcs, all verified in the browser with five samples across one full swing
(`sweep.mjs`, curation scratchpad `backdrop-curation-2`):

| Room | `centerAzimuth` | `halfArc` | Why |
|---|---|---|---|
| study | **-0.85** | 0.95 | The white seat sits in the middle of what the ROOM allows, not of what is worth looking at (see the yaw below). The hero is free of that constraint and takes the better half: at the far end it faces the buttoned settee across the darkest stretch of parquet, at the near end it is all but back in the white seat, and the bay window is 1.5 rad outside the arc. |
| space | 0 | 0.95 | Flat colour plus `<Stars>`; every azimuth is the same azimuth. |
| park | 0 | 0.95 | Grass and trees the whole way round, and `floor: ground` projects the meadow under the board. Five samples across the swing are indistinguishable. |
| arcade | 0 | 0.95 | `envYaw` 2.83 already centres the ~140 deg of clean gradient (§A2c), and 110 deg fits inside it with ~15 deg either side. Both shifts were rendered and are worse: **-1.2** puts the floor cables over the doorway into three frames of five, **+1.2** reaches the practical lamp, where the metalness-0.75 squares blow to white. |
| minimal | 0 | 0.95 | drei's `<Backdrop>` cyclorama fills the frame at every azimuth of the sweep, so the studio behind it is never on screen. |

**2. The Classic Study is `combination_room`, not `fireplace`.** §A2c recorded the reason
this had to wait: nothing under NFR-9's 1,572,864-byte cap beat `fireplace`, and
`fireplace` is a domestic lounge of which only a third is the fire. The owner has since
**waived NFR-9 for the Study only, to ~1.85 MB**, on the grounds that the room card
promises a panelled club and a photograph of somebody's couch is not one.

| | Before | After |
|---|---|---|
| Poly Haven id | `fireplace` (Greg Zaal) | **`combination_room`** (Sergej Majboroda) |
| 1k `.hdr` | 1,529,229 B, md5 `42ea9e4241d230a343955f4921b9ab30` | **1,661,444 B**, md5 `490f50c323b9329e5aa4a2ea32dc23aa` (over the cap, under the 1.9 MB waiver) |
| Backdrop JPG | 4096x2048 q72, 1,464,354 B | **3584x1792 q72, 1,489,755 B** (source 5,285,998 B, md5 `2b279b4ca8ffe85a4851c35d81c8aa7d`) |
| `envYaw` | 1.65 | **4.05** |
| Lights | key `#ffd9a8` 2.3, ambient 0.15, env 0.90, bg 0.95 | key `#ffd9a8` **2.4**, ambient **0.11**, env **0.72**, bg **0.80** |
| Description | "Warm lamplight, polished wood, a fire in the corner." | "Warm lamplight, polished parquet, and a settee nobody sits on." |

`combination_room` is a college combination room: gold damask walls over a white dado, an
inlaid parquet floor, a buttoned settee, a gilt armchair, a marble side table with a
painted urn on it, a brass chandelier — and one bay window blown to white. No people, no
text, no screens, no brand marks, no cables, level horizon, shot at standing height. It is
a **daylit** room where `fireplace` was a night one, which is what the light retune is for:
the key goes up and stays warm, the environment and the background come down, and the
result reads as a gold room late in the afternoon rather than a photograph at noon. The
board's amber and brown squares separate cleanly from the parquet, which is darker and
redder than either.

**The yaw is set by the window and by the fact that there are two seats.** The visible
band from a seat is 20-60 deg below the panorama's horizon (§A2c); here that is parquet
the whole way round, with the furniture standing on it and the window occupying about
1.4 rad of it (yaw ~1.5-3.2 blown out, ~1.2 and ~3.4 pale but usable). The seats are half
a turn apart, so a yaw is only legal if BOTH `E` and `E + PI` miss the window: that is
`E` in 3.15-4.89, and **4.05** is the middle of it. White gets the gilt armchair, the
marble table and the parquet; black gets the gold damask wall with the settee under it.
The hero then takes `centerAzimuth -0.85` (above) to reach the half of the room the seats
could not have.

**The Study candidates, all checked against `/files/<id>` and, where they survived the
panorama, rendered in `/dev/board3d` at eight yaws.** Every one of the ten below is inside
the 1.9 MB waiver, so size stopped being the filter; the room did.

Rendered, and rejected on what the camera actually sees:

| id | 1k hdr | Why not |
|---|---|---|
| `billiard_hall` | 1,629,669 | A real games room, and the band is oatmeal contract carpet, a red tile strip and the yellow flank of an air-hockey cabinet. Flat, cool, and the board's light squares sink into the carpet. |
| `cowboy_town_saloon` | 1,733,523 | The warmest runner-up — mahogany tables, spindle chairs, terracotta tile, hanging lamps — but it is a western saloon, not a club, and the board's dark squares are the same value as the table tops it stands against. |
| `music_hall_01` | 1,650,132 | A Victorian theatre: rows of orange seats and a patterned red carpet, edge to edge. The amber squares disappear into it. |
| `music_hall_02` | 1,596,653 | Clean honey herringbone parquet and nothing else — an empty hall floor — and the two quadrants that do have content have teal walls and a blue curtain. |
| `wooden_lounge` | 1,631,135 | Pale pine and grey concrete, with wall-mounted TVs; the floor is within a shade of the board's light squares. |

Rejected on the panorama, before rendering (the equirect preview at
`https://cdn.polyhaven.com/asset_img/primary/<id>.png?width=1024`, with the visible band
marked; sheets `eq-00`..`eq-06` in the scratchpad):

`aft_lounge` (1,776,815 — a liner's lounge: mustard sofas over a swirling brown carpet,
which is the exact failure `fireplace` was replaced for), `cayley_interior` (1,709,967 —
a modern lodge, tiled floor, glass balcony, sea view), `pine_attic` (1,644,300 — green
carpet, bean bags and a plywood hoop), `ballroom` (1,670,493 — pale cream and daylight),
`country_club` (1,728,719 — a mural in blue and orange, wall to wall), `cinema_hall` and
`pretville_cinema` (1,691,550 / 1,547,747 — both have a lit screen in frame),
`christmas_photo_studio_01` (1,679,082 — the right furniture, a Christmas tree),
`entrance_hall` / `mirrored_hall` / `dancing_hall` / `st_fagans_interior` / `decor_shop` /
`colorful_studio` / `blue_photo_studio` / `old_room` / `anniversary_lounge` /
`lythwood_room` / `hayloft` / `industrial_wooden_attic` / `warm_restaurant` /
`cowboy_town_hall` / `glasshouse_interior` / `comfy_cafe` / `hotel_room` /
`brown_photostudio_01`/`_03`/`_05`/`_06` (pale, modern, domestic, signed, screened or all
four). The §A2c rejections — `warm_bar`, `warm_restaurant_night`, `warm_reception_dinner`,
`lythwood_lounge` — still stand and were not re-rendered.

The search was the whole 994-asset index (`GET /assets?t=hdris`) filtered to indoor
categories and tags matching panelled / library / club / lounge / mahogany / leather /
fireplace / chandelier / evening / billiard / saloon / hall / attic / manor / salon —
124 assets, 39 of which were worth pricing.

### A3. Size budget note

PRD risk section says "five presets should total under 6 MB". That is **not achievable with five 1k Radiance `.hdr` files** from Poly Haven: the smallest suitable ones are ~1.22-1.39 MB each, so the floor is ~6.3 MB. The hard NFR (NFR-9, < 1.5 MB per file, lazy-loaded) is met. Options if the total matters (none verified in-browser; see open questions):
1. Lazy-load only the active room's HDRI (PRD already requires lazy load + cache); the 7 MB total is never fetched at once.
2. Serve pre-compressed: RGBE is RLE-encoded so gzip/brotli helps only modestly (untested).
3. Use `cyclorama_hard_light_1k.exr` (882 KB) for the minimal room; drei loads `.exr` via `EXRLoader` (A4).

### A4. Using them with drei (verified against installed `@react-three/drei@10.7.8`)

`core/useEnvironment.js` picks the loader from the extension of the first entry in `files`
(`.hdr` -> `RGBELoader`, `.exr` -> `EXRLoader`, `.jpg/.jpeg` -> `HDRJPGLoader`, `.webp` (3 files incl. json) -> `GainMapLoader`, 6 files -> `CubeTextureLoader`). Query strings are stripped before the extension check, so cache-busting `?v=` is fine.

`EnvironmentProps` (from `core/Environment.d.ts`):
`files?: string | string[]`, `path?: string`, `preset?`, `background?: boolean | 'only'`, `blur?`, `backgroundBlurriness?`, `backgroundIntensity?`, `backgroundRotation?: Euler`, `environmentIntensity?`, `environmentRotation?: Euler`, `map?: Texture`, `scene?`, `ground?: boolean | {radius?, height?, scale?}`, `resolution?`, `frames?`, `near?`, `far?`, `colorSpace?`, `extensions?: (loader) => void`, `children?`.

`useEnvironment.preload({ files, path, ... })` and `useEnvironment.clear(...)` exist (`core/useEnvironment.d.ts` lines 12-13) - use `preload` when the settings drawer opens (FR-21m).

```tsx
// rooms.config.ts (FR-21n: single config file)
export const ROOMS = {
  study:   { hdri: '/hdri/study.hdr',   polyhaven: 'fireplace',              bgIntensity: 1.0, envIntensity: 1.0, stars: false },
  space:   { hdri: '/hdri/space.hdr',   polyhaven: 'qwantani_night_puresky', bgIntensity: 0.7, envIntensity: 0.6, stars: true  },
  park:    { hdri: '/hdri/park.hdr',    polyhaven: 'meadow_2',               bgIntensity: 1.0, envIntensity: 1.0, stars: false },
  arcade:  { hdri: '/hdri/arcade.hdr',  polyhaven: 'ferndale_studio_06',     bgIntensity: 0.85, envIntensity: 0.9, stars: false },
  minimal: { hdri: '/hdri/minimal.hdr', polyhaven: 'white_studio_06',        bgIntensity: 1.0, envIntensity: 1.0, stars: false },
} as const;

// in the scene
import { Environment, Stars, useEnvironment } from '@react-three/drei';
<Environment files={room.hdri} background backgroundBlurriness={0.05}
             backgroundIntensity={room.bgIntensity} environmentIntensity={room.envIntensity} />
{room.stars && <Stars radius={100} depth={50} count={4000} factor={4} saturation={0} fade speed={0.5} />}

// preload all five when the drawer opens
Object.values(ROOMS).forEach(r => useEnvironment.preload({ files: r.hdri }));
```

`StarsProps` (verified `core/Stars.d.ts`): `radius?, depth?, count?, factor?, saturation?: number; fade?: boolean; speed?: number`. Component is `ForwardRefComponent<StarsProps, THREE.Points>`.

Note: `<Stars>` renders inside the scene at `radius` world units; with `background` from the HDRI the stars draw on top of the sky texture because the background is not depth-tested against scene geometry.

---

## B. Chess piece models

### B1. Poly Pizza search result: no CC0 chess set

Searched `https://poly.pizza/search/<q>` for `chess`, `chess piece`, `chess set`, `chessboard`, `chess king`, `pawn` and parsed the JSON embedded in each page (`{"id":..,"title":..,"publicID":..,"licence":..}`); also opened the individual model pages. Every chess-related asset is **CC-BY 3.0** (they are Google Poly imports):

| Title | Author | publicID | Licence (page) |
|---|---|---|---|
| Chess Set (full set, OBJ/GLTF) | Jarlan Perez | `00f9MZIwA1V` | CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/) |
| Chess Set | Pia Leung | `bfb3C6hpdi0` | CC-BY 3.0 |
| Chess King / Queen / Rook / Bishop / Knight / Pawn (singles) | Jarlan Perez | `4TP6oa34Fp-`, `0EE-Yj8eu2c`, `417Xec_xlU0`, `7xay8UYqePI`, `fMIykP6ncx7`, `0xRVhzfseb3` | CC-BY 3.0 |
| Knight chess piece / Pawn / Bishop | Poly by Google | `aW5HcCo0KZa`, `fXbCgbsujx4`, `79A3nqzZf56`, `0Iwry_4fNw0` | CC-BY 3.0 |
| Low Poly Chess - Queen / Rook | Leo Battle | `bn7Zks1cXFD`, `1qCABVTmJ_g` | CC-BY 3.0 |
| low poly chess knights | Thomas Saint Pierre | `373iD4phSZh` | CC-BY 3.0 |
| Chessboard / chessboard / Wood Checkboard / Classic Checkerboard | peter moore / Chris Braeuer / Jarlan Perez | `21bXFn9QEw9`, `8QlciymX0tY`, `cFejdg3fa2P`, `cGy_jtmd2Qf` | CC-BY 3.0 |

The only CC0 hits for those queries were unrelated (Cheese Block, Chest, Cutting Board, Modular Castle Kit, a "King" character). Sketchfab was skipped (downloads require login; no direct link). **Nothing was downloaded to `public/models/`.**

Poly Pizza direct-download pattern, for the record (verified on the Jarlan Perez set page; the model-viewer `src` attribute):
```
https://static.poly.pizza/<uuid>.glb        e.g. https://static.poly.pizza/7f50b401-9f06-40de-985d-d3a5f441ec26.glb
https://static.poly.pizza/<uuid>.glb.br     (brotli-compressed twin)
```
`curl -sI` on that GLB: HTTP 200, `content-type: binary/octet-stream`, `content-length: 436704` (427 KB). It is a viable **CC-BY** fallback if the team decides attribution ("Chess Set by Jarlan Perez, CC-BY 3.0, via poly.pizza") in the settings/about screen is acceptable. It was **not** downloaded because the brief requires CC0. Its internal mesh names were not inspected.

### B2. Decision: procedural Staunton-style pieces with `LatheGeometry`

`THREE.LatheGeometry` signature (verified `@types/three@0.185.4/src/geometries/LatheGeometry.d.ts` line 33):
```ts
new THREE.LatheGeometry(points?: Vector2[], segments?: number /* default 12 */, phiStart?: number /* 0 */, phiLength?: number /* 2*PI */)
```
`points[i].x` = radius (must be > 0 except at the very top/bottom where 0 closes the cap), `points[i].y` = height. Points must go bottom-to-top monotonically in y for sane normals; call `geometry.computeVertexNormals()` is not needed (LatheGeometry computes them) but use `segments >= 32` for smooth silhouettes and mark hard edges (collars) with duplicated y values.

Units below: **1 board square = 1.0 world unit**, origin at the piece base centre, +Y up. Base radii keep ~0.1 clearance to the square edge. Heights follow Staunton proportions (king ~1.7x square, pawn ~55% of king). Profiles are `[radius, height]` pairs, bottom to top; the last point is `[0, H]` to close the top. Duplicated heights create crisp rings/collars.

```ts
// pieces.profiles.ts - all numbers in board-square units
export type Profile = [radius: number, height: number][];

export const PAWN: Profile = [
  [0.00, 0.00], [0.30, 0.00], [0.30, 0.04], [0.26, 0.10],   // base disc + chamfer
  [0.18, 0.16], [0.14, 0.24], [0.11, 0.40], [0.10, 0.52],   // stem
  [0.16, 0.56], [0.16, 0.60], [0.12, 0.64],                 // collar
  [0.13, 0.68], [0.16, 0.76], [0.13, 0.86], [0.06, 0.93], [0.00, 0.95], // ball head
];  // H = 0.95

export const ROOK: Profile = [
  [0.00, 0.00], [0.34, 0.00], [0.34, 0.05], [0.29, 0.12],
  [0.22, 0.20], [0.20, 0.30], [0.19, 0.60], [0.20, 0.78],   // slightly waisted cylinder
  [0.26, 0.84], [0.27, 0.90], [0.27, 1.05],                 // battlement ring (outer wall)
  [0.19, 1.05], [0.19, 0.96], [0.00, 0.96],                 // hollow top (inner wall + floor)
];  // H = 1.05. Then subtract 4 crenel notches: 4 boxes (0.10 x 0.12 x 0.30) at y=1.05, rotated 0/90/180/270 deg,
    // either via CSG or by simply overlaying 4 thin box "merlons" on a plain top ring at r=0.27.

export const BISHOP: Profile = [
  [0.00, 0.00], [0.32, 0.00], [0.32, 0.05], [0.27, 0.12],
  [0.18, 0.20], [0.14, 0.30], [0.11, 0.55], [0.10, 0.70],
  [0.17, 0.74], [0.17, 0.78], [0.12, 0.82],                 // collar
  [0.15, 0.88], [0.19, 1.00], [0.16, 1.14], [0.09, 1.24],   // mitre (egg)
  [0.05, 1.28], [0.06, 1.31], [0.04, 1.36], [0.00, 1.38],   // small knob
];  // H = 1.38. Mitre slit: a thin box (0.02 x 0.16 x 0.40) subtracted or rendered as a dark inset strip at 30 deg.

export const QUEEN: Profile = [
  [0.00, 0.00], [0.36, 0.00], [0.36, 0.05], [0.31, 0.13],
  [0.21, 0.22], [0.16, 0.34], [0.12, 0.62], [0.11, 0.88],
  [0.19, 0.93], [0.19, 0.98], [0.14, 1.02],                 // collar
  [0.17, 1.08], [0.24, 1.20], [0.27, 1.32], [0.25, 1.40],   // crown cup
  [0.19, 1.40], [0.16, 1.34],                               // cup rim / inner lip
  [0.09, 1.42], [0.11, 1.48], [0.08, 1.54], [0.00, 1.57],   // orb
];  // H = 1.57. Add 8 small spheres (r=0.035) on the rim at r=0.245, y=1.40 for the crown points.

export const KING: Profile = [
  [0.00, 0.00], [0.38, 0.00], [0.38, 0.05], [0.33, 0.13],
  [0.22, 0.23], [0.17, 0.36], [0.13, 0.66], [0.12, 0.96],
  [0.20, 1.01], [0.20, 1.06], [0.15, 1.10],                 // collar
  [0.18, 1.16], [0.25, 1.28], [0.26, 1.40], [0.22, 1.46],   // flared crown
  [0.14, 1.48], [0.12, 1.52], [0.00, 1.54],                 // flat crown top
];  // H = 1.54 body; cross on top: two boxes 0.05 thick, vertical 0.06 x 0.22 and horizontal 0.16 x 0.06,
    // centred at y = 1.54 + 0.11  -> total height ~1.76.

// KNIGHT: lathe only the base/collar, then add an extruded head.
export const KNIGHT_BASE: Profile = [
  [0.00, 0.00], [0.33, 0.00], [0.33, 0.05], [0.28, 0.12], [0.22, 0.20], [0.20, 0.28], [0.22, 0.34], [0.00, 0.34],
];  // H = 0.34
// Knight head: THREE.ExtrudeGeometry of this 2D outline (x = forward/back, y = up), depth 0.22 (centered),
// bevelEnabled true, bevelThickness 0.02, bevelSize 0.02. Place at y = 0.34, facing +X for white, -X for black.
export const KNIGHT_HEAD_OUTLINE: [number, number][] = [
  [-0.16, 0.00], [ 0.16, 0.00],            // neck bottom
  [ 0.14, 0.30], [ 0.26, 0.42],            // chest -> muzzle underside
  [ 0.30, 0.52], [ 0.24, 0.60],            // nose
  [ 0.10, 0.62], [ 0.06, 0.70], [ 0.02, 0.80],  // forehead
  [ 0.04, 0.90], [-0.02, 0.88],            // ear
  [-0.10, 0.74], [-0.20, 0.60],            // mane top
  [-0.26, 0.42], [-0.22, 0.20],            // back of neck
];  // total knight height ~ 0.34 + 0.90 = 1.24
```

Height ladder (tallest to shortest): King 1.76, Queen 1.57, Bishop 1.38, Knight 1.24, Rook 1.05, Pawn 0.95 - the standard Staunton ordering. Suggested `segments`: 48 for king/queen, 40 for bishop/rook/pawn.

Build helper:
```ts
import * as THREE from 'three';
export function latheFromProfile(p: Profile, segments = 40) {
  return new THREE.LatheGeometry(p.map(([r, h]) => new THREE.Vector2(r, h)), segments);
}
```
Reuse one geometry per piece type (memoise with `useMemo`) and share two `MeshPhysicalMaterial`s (white/black) driven by the room's material preset (FR-26). Merge the extra parts (rook merlons, king cross, queen orbs, knight head) with `BufferGeometryUtils.mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js` so each piece is one draw call, or keep them as child meshes under one `<group>` for simplicity.

---

## Unverified / open questions

1. Poly Pizza's official API docs (`https://poly.pizza/docs/api/v1.1`) are client-rendered; the page could not be read with WebFetch/curl, so the search-filter parameter for licence and any API key requirement are unverified. The licence field name in the page-embedded JSON is `licence` with values `"CC0 1.0"` / `"CC-BY 3.0"`.
2. Sketchfab was not searched (login required for downloads, per the brief). There may be CC0 chess sets there.
3. Whether brotli/gzip meaningfully shrinks the RLE-encoded `.hdr` files when served by Next.js/Vercel was not tested; the 7.26 MB total vs the PRD's soft "under 6 MB" note is therefore unresolved (the hard NFR-9 per-file cap is met).
4. In-browser rendering of the five files with drei `Environment` was not executed (no dev server in this task); the loader/extension logic was verified only by reading `@react-three/drei/core/useEnvironment.js`.
5. The lathe profiles are authored here from Staunton proportions, not copied from a reference model; they will need a visual pass (tweak radii/heights) once rendered.
6. Internal node/mesh names of the CC-BY Jarlan Perez GLB (`7f50b401-9f06-40de-985d-d3a5f441ec26.glb`) were not inspected because it was not downloaded.

---

## B3. Verified GLB set and `useGLTF` pipeline

Added 2026-09-09. This section **supersedes B1/B2's "nothing was downloaded" conclusion**. A usable
chess set now exists at `public/models/chess-pieces.glb` (96,580 bytes) and was inspected
programmatically. B2's `LatheGeometry` profiles remain the documented fallback (see B3.9).

### B3.1 Search results (what exists, what was rejected)

| Candidate | Licence | Downloadable without login | Verdict |
|---|---|---|---|
| **Jarlan Perez individual pieces x6, Poly Pizza** | CC-BY 3.0 | yes (`https://static.poly.pizza/<uuid>.glb`) | **CHOSEN.** 11-27 KB each, one clean mesh per piece, correct Staunton height ladder. |
| Jarlan Perez "Chess Set" (whole set, `00f9MZIwA1V` -> `7f50b401-9f06-40de-985d-d3a5f441ec26.glb`) | CC-BY 3.0 | yes, 436,704 B | **Rejected.** Inspected: `nMeshes 1, nNodes 1`, one node named `Node`, one mesh with **2 primitives** (14,314 verts / mat `mat21` white, 14,388 verts / mat `mat23` black) - all 32 pieces welded into two blobs. Individual pieces cannot be extracted without CSG/island splitting. |
| Khronos glTF-Sample-Assets **`ABeautifulGame`** | CC-BY 4.0 (c) ASWF + Ed Mackey | yes | **Rejected on size.** `glTF-Binary/ABeautifulGame.glb` = **42,977,928 B (41 MB)**; `glTF-Binary-KTX-ETC1S-Draco/ABeautifulGame.glb` = **12,105,252 B (11.5 MB)**. Uses `KHR_materials_transmission` + `KHR_materials_volume`; the compressed variant also needs Draco + KTX2 (`KHR_texture_basisu`) decoders. Geometry *is* per-piece separated and it is the best-looking option if a >10 MB download is ever acceptable. URLs: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb`. |
| **Kenney.nl** | CC0 | - | **No chess asset exists.** `https://kenney.nl/assets?q=chess` returns only unrelated packs (domino-pack, mini-dungeon, tiny-farm...). |
| **Poly Haven** models | CC0 | yes | No chess / board-game asset in the library (props, furniture, plants only). |
| **Sketchfab** | - | **no** | `GET https://api.sketchfab.com/v3/search?type=models&q=chess&downloadable=true&license=cc0` returns exactly **3** hits and none is a set: "Chess piece" (180,000 faces), "078 Schachfigur / Chess piece" (499,836 faces), "Backgammon piece". Both chess hits are single photogrammetry scans, 2 orders of magnitude too heavy. And `GET https://api.sketchfab.com/v3/models/<uid>/download` returns **HTTP 401** without an OAuth token, so nothing on Sketchfab is scriptable/CI-friendly. **Sketchfab is closed out - do not re-research it.** |

### B3.2 Shipped asset

```
public/models/chess-pieces.glb      96,580 bytes   md5 35c1733c0de55d212d05473712edf80a
public/models/ATTRIBUTION.md        required attribution text (read it before shipping)
public/models/source/{king,queen,rook,bishop,knight,pawn}.glb   unmodified originals, 95,568 B total
scripts/bake-chess-pieces.mjs       reproducible build script (node scripts/bake-chess-pieces.mjs)
```

Source models and direct URLs (all verified HTTP 200 on 2026-09-09; titles read from each page's
`og:title` meta, e.g. `"Chess King - Free Model By Jarlan Perez"`):

| Piece | poly.pizza page | Direct GLB | Bytes |
|---|---|---|---|
| King | `https://poly.pizza/m/4TP6oa34Fp-` | `https://static.poly.pizza/a8d3f6bb-8155-4e32-9627-9c42e80647e0.glb` | 16,104 |
| Queen | `https://poly.pizza/m/0EE-Yj8eu2c` | `https://static.poly.pizza/4b5c36a7-059a-4b2c-bd07-83a5312ef702.glb` | 27,484 |
| Rook | `https://poly.pizza/m/417Xec_xlU0` | `https://static.poly.pizza/8aa97001-9d59-4bb4-b03f-27d14ecf0ef5.glb` | 12,816 |
| Bishop | `https://poly.pizza/m/7xay8UYqePI` | `https://static.poly.pizza/c8df9cb7-4d63-4451-98b9-ea756909910a.glb` | 13,536 |
| Knight | `https://poly.pizza/m/fMIykP6ncx7` | `https://static.poly.pizza/2b5a6939-9032-402f-b1d0-e44a6bfa226e.glb` | 11,496 |
| Pawn | `https://poly.pizza/m/0xRVhzfseb3` | `https://static.poly.pizza/97097510-1b75-40b2-b24f-bfaa14d7aaba.glb` | 14,136 |

**LICENCE - NOT CC0. Attribution is mandatory (CC-BY 3.0).** Ship this exact string somewhere a user
can see it (settings drawer / about panel / footer):

> Chess pieces by Jarlan Perez via Poly Pizza — CC BY 3.0

(link `Jarlan Perez` or `Poly Pizza` to `https://poly.pizza`, and `CC BY 3.0` to
`https://creativecommons.org/licenses/by/3.0/`). CC-BY permits the derivative work described in
B3.3. This is a change from the PRD's "CC0" assumption in the tech table - flag it once to the user.

### B3.3 What the bake script did to the originals

The raw Poly Pizza files are `obj2gltf` output with three problems: every node is named `Node`, the
only vertex attribute is `POSITION` (**no NORMAL**, so three.js sets `flatShading = true` and the
pieces render faceted), and the origin sits in the middle of the piece, not on its base.
`scripts/bake-chess-pieces.mjs` (verified: it runs from the repo with `node scripts/bake-chess-pieces.mjs`) fixes all three:

1. loads each source GLB with `three/examples/jsm/loaders/GLTFLoader.js` `.parse(arrayBuffer, '', cb)`;
2. re-centres X/Z on the **base ring** (mean of vertices in the lowest 3% of the height - important
   for the Knight, whose bbox is asymmetric) and translates so the foot is exactly at `y = 0`;
3. applies uniform scale **S = 3.9300778482649874** (= 1.75 / king's raw height 0.445284) so
   **1 board square = 1 world unit**;
4. `toCreasedNormals(geometry, degToRad(35))` from
   `three/examples/jsm/utils/BufferGeometryUtils.js` - smooth shading around the lathe, hard edges
   at the collars/base chamfers;
5. names the meshes `King/Queen/Rook/Bishop/Knight/Pawn` under a group named `ChessPieces`, all
   sharing one `MeshStandardMaterial` named `PieceMaterial` (white, `metalness 0`, `roughness 0.35`);
6. exports with `three/examples/jsm/exporters/GLTFExporter.js` `{ binary: true }`;
7. `npx @gltf-transform/cli weld` re-indexes: **227,396 -> 96,580 bytes, lossless** (creased normals
   preserved because weld splits on differing NORMAL).

Node gotcha for anyone re-running the script: three's `GLTFExporter` calls `new FileReader()`, which
Node does not define. The script installs a 6-line polyfill (`readAsArrayBuffer` -> `blob.arrayBuffer()`).

### B3.4 Inspection of the shipped `chess-pieces.glb` (verified with three@0.185.1 GLTFLoader **and** `npx @gltf-transform/cli inspect`)

- glTF 2.0, generator `THREE.GLTFExporter r185`. **`extensionsUsed` / `extensionsRequired`: none.**
  **No Draco, no meshopt, no KTX2.** No textures, no images, no animations, no skinning.
- Scene root: `Group` named `ChessPieces`; six sibling `Mesh` children, each with an identity
  transform (`position 0,0,0`, `rotation 0,0,0`, `scale 1,1,1`) - so `nodes.<Name>.geometry` is
  directly usable without copying a node matrix.
- Every mesh is a **separate mesh with its own geometry** (this is the thing B1 could not deliver).
- Attributes: `POSITION` (f32) + `NORMAL` (f32) only. **No UVs (`uv` is absent)** - see B3.7.
- One material for all six: `PieceMaterial`, `MeshStandardMaterial`, `color #ffffff`,
  `metalness 0`, `roughness 0.35`, `flatShading false`, `side 0` (FrontSide), no maps. It is a
  **PBR metallic-roughness** material, so FR-26 room presets can override
  `metalness` / `roughness` / `color` / `envMapIntensity` freely, or replace it entirely.
- Up axis **+Y** (glTF convention), pieces stand along +Y, base plane exactly `y = 0`.

| Mesh name | verts | tris | height (units) | base diameter X | base diameter Z | bbox |
|---|---|---|---|---|---|---|
| `King` | 504 | 532 | **1.7500** | 0.4936 | 0.4936 | min `[-0.2468, 0, -0.2468]` max `[0.2468, 1.7500, 0.2468]` |
| `Queen` | 876 | 892 | **1.5720** | 0.5178 | 0.5178 | min `[-0.2589, 0, -0.2589]` max `[0.2589, 1.5720, 0.2589]` |
| `Bishop` | 449 | 448 | **1.1121** | 0.4936 | 0.4936 | min `[-0.2468, 0, -0.2468]` max `[0.2468, 1.1121, 0.2468]` |
| `Knight` | 420 | 372 | **1.0875** | 0.5140 | 0.4936 | min `[-0.2672, 0, -0.2468]` max `[0.2468, 1.0875, 0.2468]` |
| `Rook` | 432 | 416 | **0.9432** | 0.4936 | 0.4936 | min `[-0.2468, 0, -0.2468]` max `[0.2468, 0.9432, 0.2468]` |
| `Pawn` | 410 | 444 | **0.8450** | 0.4936 | 0.4936 | min `[-0.2468, 0, -0.2468]` max `[0.2468, 0.8450, 0.2468]` |

Whole-scene bbox: min `[-0.2672, 0, -0.2589]`, max `[0.2589, 1.75, 0.2589]`. Total 9,312 render
vertices, 3,104 triangles for the whole set; a full 32-piece board is ~24k triangles - trivial.

Height ladder is correct Staunton order (King > Queen > Bishop > Knight > Rook > Pawn). Base
diameter is ~0.49 squares, so pieces on adjacent squares have ~0.5 units of clearance; a selection
ring / legal-move disc up to r = 0.45 fits under a piece without z-fighting the neighbours.

**Silhouettes were rasterised** (orthographic X-Y projection of every triangle, ASCII) to confirm the
shapes are the intended Staunton forms - King has a cross finial, Queen a coronet, Rook crenellated
battlements, Bishop a mitre with the collar, Pawn ball-on-collar. This is the visual check B2's
lathe profiles never got.

**Knight orientation:** the Knight is the only non-radially-symmetric piece. Its bbox is asymmetric
in X only (`-0.2672 .. +0.2468`), and the silhouette shows the muzzle protruding toward **-X** with
the ears/poll toward **+X**. So the model faces **-X** by default. To make a knight face **+Z**
apply `rotation-y={Math.PI / 2}`; to face **-Z** apply `rotation-y={-Math.PI / 2}`. Pick per colour
so both knights look toward the opponent. (Inferred from the silhouette raster - eyeball it once in
the browser before locking it in.)

### B3.5 Consuming it with drei (verified against the installed `@react-three/drei@10.7.8` source)

`node_modules/@react-three/drei/core/Gltf.d.ts` / `Gltf.js`:

```ts
export declare const useGLTF: {
  <T extends Path>(path: T, useDraco?: boolean | string, useMeshopt?: boolean,
                   extendLoader?: (loader: GLTFLoader) => void):
    T extends any[] ? (GLTF & ObjectMap)[] : GLTF & ObjectMap;
  preload(path, useDraco?, useMeshopt?, extendLoader?): void;
  clear(path): void;
  setDecoderPath(path: string): void;   // Draco decoder base URL
};
// Path = string | string[]  -> passing an array returns an array of results
```

`ObjectMap` (verified `@react-three/fiber/dist/declarations/src/core/utils.d.ts` L206 and the
`buildGraph` implementation in `dist/events-156d8d12.esm.js` L160) is:

```ts
interface ObjectMap {
  nodes:     { [name: string]: THREE.Object3D };  // every object with a non-empty .name
  materials: { [name: string]: THREE.Material };  // first material seen per material .name
  meshes:    { [name: string]: THREE.Mesh };      // meshes only
}
```
So for our file: `nodes` keys are exactly `ChessPieces, King, Queen, Rook, Bishop, Knight, Pawn`,
`materials` has the single key `PieceMaterial`, and `meshes` has the six piece keys.
`nodes.King` and `meshes.King` are the same object here.

**Gotcha - `useDraco` defaults to `true`.** `Gltf.js` does
`extensions(useDraco = true, useMeshopt = true, extendLoader)`, so calling `useGLTF(url)` with no
second argument still attaches a `DRACOLoader` pointed at
`https://www.gstatic.com/draco/versioned/decoders/1.5.5/` (and a meshopt decoder). The decoder WASM
is only fetched when a Draco-compressed file is actually decoded, so our uncompressed file never
hits gstatic - but pass `useGLTF(url, false)` if you want to be certain there is no third-party
request, or `useGLTF.setDecoderPath('/draco/')` and self-host if you ever switch to Draco.

**Gotcha - do not `import { GLTF } from 'three-stdlib'`.** drei loads with **three-stdlib's**
`GLTFLoader` (`three-stdlib@2.36.1`), not `three/examples/jsm`'s. Under this project's pnpm layout
`three-stdlib` is **not** resolvable from app code (`require.resolve('three-stdlib')` ->
`MODULE_NOT_FOUND`; there is no `node_modules/three-stdlib`, only
`node_modules/.pnpm/three-stdlib@2.36.1_three@0.185.1`). Declare the shape locally instead:

```ts
// components/three/useChessPieces.ts
'use client';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

export const PIECE_MODEL_URL = '/models/chess-pieces.glb';
export type PieceMeshName = 'King' | 'Queen' | 'Rook' | 'Bishop' | 'Knight' | 'Pawn';

type ChessPiecesGLTF = {
  nodes: Record<PieceMeshName | 'ChessPieces', THREE.Object3D> & Record<PieceMeshName, THREE.Mesh>;
  materials: { PieceMaterial: THREE.MeshStandardMaterial };
};

export function useChessPieces() {
  return useGLTF(PIECE_MODEL_URL) as unknown as ChessPiecesGLTF;
}
useGLTF.preload(PIECE_MODEL_URL);   // module-scope preload; see B3.8
```

chess.js piece letters map to mesh names:

```ts
export const MESH_BY_TYPE = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' } as const;
```

### B3.6 Reusing one geometry across 8 pawns - three options, ranked

The whole set is 3,104 triangles and a full board is 32 draw calls. **Plain `<mesh>` reusing the
loaded geometry is the right answer here**; instancing is premature and costs you per-piece
materials and simple pointer events.

**1. (Recommended) Plain `<mesh>`, shared geometry + two shared materials.** Geometry and material
are shared by reference, so 8 pawns cost one geometry upload:

```tsx
'use client';
import * as THREE from 'three';
import { useMemo } from 'react';
import { useChessPieces, MESH_BY_TYPE } from './useChessPieces';

function usePieceMaterials(room: RoomPreset) {         // FR-26
  return useMemo(() => ({
    w: new THREE.MeshPhysicalMaterial({ color: room.whiteColor, metalness: room.metalness, roughness: room.roughness, clearcoat: room.clearcoat ?? 0 }),
    b: new THREE.MeshPhysicalMaterial({ color: room.blackColor, metalness: room.metalness, roughness: room.roughness, clearcoat: room.clearcoat ?? 0 }),
  }), [room]);
}

export function Piece({ type, color, x, z, selected }: PieceProps) {
  const { nodes } = useChessPieces();
  const mats = usePieceMaterials(useRoom());
  const geometry = nodes[MESH_BY_TYPE[type]].geometry;      // <- shared, never cloned
  return (
    <mesh
      geometry={geometry}
      material={mats[color]}
      position={[x, selected ? 0.15 : 0, z]}                 // 1 square = 1 unit, base sits at y=0
      rotation-y={type === 'n' ? (color === 'w' ? Math.PI / 2 : -Math.PI / 2) : 0}  // knight faces the opponent
      castShadow
      receiveShadow={false}
      onPointerDown={onSelect}
    />
  );
}
```
Because `PieceMaterial` from the file is never used, you can ignore `materials.PieceMaterial`
entirely - or mutate it if you prefer a single material for both colours.

**2. `<Clone object={nodes.Pawn} />`** (`core/Clone.d.ts` / `Clone.js`, verified). Props:
`object: Object3D | Object3D[]`, `deep?: boolean | 'materialsOnly' | 'geometriesOnly'`,
`keys?: string[]`, `inject?`, `castShadow?`, `receiveShadow?`, plus all `group` props.
With `deep` unset it **shares** geometry and material by reference (it copies the keys
`geometry, material, position, rotation, scale, name, ...` onto a new `<mesh>`), so it is
functionally identical to option 1 for a single-mesh node, just less explicit. Use it when you need
to clone a whole **subtree** (our file has none). `deep` clones geometry/material per instance -
never do that for 8 pawns. Note `Clone` runs `SkeletonUtils.clone` only for skinned meshes (ours
are not).

**3. `<Instances>` / `<Instance>`** (`core/Instances.d.ts`, verified). `InstancesProps` extends
`instancedMesh` props with `range?`, `limit?` (default **1000**), `frames?` (default `Infinity`),
`context?`. Requires one `<Instances geometry={...} material={...}>` per (piece type x colour) pair,
because an `InstancedMesh` has exactly one material - i.e. 12 groups for a chess set, which is
*more* objects than the 32 plain meshes it replaces. `PositionMesh.raycast` is implemented so
`<Instance onPointerDown>` does work, and `<Instance color={...}>` can tint per instance, but
per-instance emissive/outline for selection is not straightforward. **Do not use for the chess
board.** (`<Merged meshes={{...}}>{(Pawn, Rook) => ...}` is the same machinery with a different API.)

### B3.7 Materials, shadows and the missing UVs (FR-26/FR-27/FR-28)

- The geometry has **no `uv` attribute**. Any material map that needs UVs - `map`, `normalMap`,
  `roughnessMap`, `aoMap` - will not work. Use **procedural / non-textured PBR** for the room
  presets (colour + metalness + roughness + clearcoat + `envMapIntensity`), which is exactly what
  FR-26's "polished wood / marble / glass / metal" presets need when driven by the HDRI
  (`Environment` from section A4) rather than by albedo textures. If a texture is ever required,
  generate UVs offline (`npx @gltf-transform/cli` has no unwrapper; Blender's Smart UV Project is
  the practical route) - or apply a triplanar shader.
- Glass preset: `MeshPhysicalMaterial` with `transmission`, `thickness`, `ior`, `roughness`. Works
  without UVs. Costs a transmission render pass per frame; test on mobile before shipping it.
- `castShadow` on pieces + `receiveShadow` on the board plane is the FR-28 setup. The pieces are
  closed solids (obj2gltf output, `side = FrontSide`), so shadow maps behave; the base sits exactly
  at `y = 0`, so `<ContactShadows position={[0, 0.001, 0]} />` reads correctly with no gap.
- `MeshReflectorMaterial` (FR-27) goes on the board, not the pieces; nothing here interferes.

### B3.8 Preloading (NFR-2a, FR-21m)

`useGLTF.preload` maps to `useLoader.preload(GLTFLoader, path, extensions)` - fire it at module
scope of the 3D chunk, or from the 2D view once the game page mounts, so the 2D -> 3D toggle is
instant:

```ts
import { useGLTF } from '@react-three/drei';
useGLTF.preload('/models/chess-pieces.glb');
// pair with the HDRI preload from A4:
// Object.values(ROOMS).forEach(r => useEnvironment.preload({ files: r.hdri }));
```
`useGLTF.clear('/models/chess-pieces.glb')` drops it from the loader cache (only needed for HMR
edge cases). Both are verified in `core/Gltf.js`.

Budget: 96,580 bytes, served statically from `public/` at `/models/chess-pieces.glb`, cached by the
browser - roughly 1/15th of a single 1k HDRI.

### B3.9 Further compression - and the trap

Verified with `npx @gltf-transform/cli@latest` (`inspect`, `weld`, `optimize` all ran successfully
against this file):

| Command | Result | Safe? |
|---|---|---|
| `weld in.glb out.glb` | 227,396 -> **96,580 B**, node names + creased normals intact, no extensions | **YES - already applied to the shipped file.** |
| `optimize in.glb out.glb --compress quantize --texture-compress false` | 227,396 -> 67,308 B | **NO. `optimize` runs `join` by default: all six meshes collapse into ONE mesh named `King`.** `nodes.Pawn` disappears. Verified by re-loading the output: `nodes keys: ['ChessPieces','King']`. |
| `optimize ... --join false --compress quantize` | 227,396 -> 70,852 B, all six names intact | **Only with care.** Adds `extensionsRequired: ["KHR_mesh_quantization"]` (three supports it) but bakes a per-node scale/translation: each geometry's bbox becomes `-1..1` and the real size lives on the node matrix. `<mesh geometry={nodes.Pawn.geometry} />` would then render the wrong size. You would have to use `<primitive object={nodes.Pawn} />` / `<Clone>` (which copy `position/scale`) instead. Not worth 26 KB. |

Draco (`--compress draco`) is not worth it either: it would pull the gstatic decoder WASM (~200 KB)
to save ~40 KB.

### B3.10 Fallback

Keep section **B2's `LatheGeometry` profiles** as the fallback path if the CC-BY attribution is
rejected, or if the low-poly look does not survive the visual pass. The B2 profiles use the same
convention (1 square = 1 unit, base at `y = 0`, +Y up) so they are drop-in for the `Piece` component
above - only the height ladder differs slightly (B2: King 1.76 / Queen 1.57 / Bishop 1.38 /
Knight 1.24 / Rook 1.05 / Pawn 0.95; B3: 1.75 / 1.57 / 1.11 / 1.09 / 0.94 / 0.85). The B2 profiles
are still un-rendered and un-verified; the B3 GLB is measured. Prefer B3.

---

## Unverified / open questions (B3 addendum)

7. **Nothing has been rendered in a browser.** The GLB was verified by loading it with three's
   `GLTFLoader` under Node and by ASCII silhouette rasterisation, not by a WebGL frame. The
   creased-normal shading at 35 deg, whether the low-poly faceting reads acceptably at game camera
   distance, and how the pieces look under each room HDRI are all unconfirmed. First 3D task should
   open the scene and eyeball it.
8. **Knight facing (-X) is inferred from the silhouette projection**, not from a rendered view.
   Confirm the `rotation-y` sign before shipping; the fix is a one-character change.
9. **Scale choice is a judgement call.** `S = 3.930078` was picked so King = 1.75 squares tall; that
   leaves the base at 0.49 squares, which is slimmer than a real Staunton set (base ~0.7 squares).
   Change `KING_TARGET_HEIGHT` in `scripts/bake-chess-pieces.mjs` and re-run if the pieces look too
   spindly - or just put a uniform `scale` on the piece `<group>`; nothing else depends on the
   absolute numbers.
10. The board model is still **not** solved - no board GLB was downloaded. Build the 8x8 board
    procedurally (64 `BoxGeometry`/`PlaneGeometry` squares or one plane with a generated texture)
    plus `MeshReflectorMaterial` per FR-27.
11. Poly Pizza's CC-BY 3.0 licence text was read off the model pages (section B1) and the
    `static.poly.pizza` CDN; there is no machine-readable licence field inside the GLB itself.
12. `gltf-transform` was run via `npx` (network). It is **not** a project dependency - CI cannot
    re-run the `weld` step without adding `@gltf-transform/cli` to devDependencies. The baked file
    is committed, so this only matters if the source pieces change.
