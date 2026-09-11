# Room environments

The visible background and the HDR lighting probe are deliberately separate.

| Room | Visible surroundings | Lighting |
| --- | --- | --- |
| Study | `study-library.png`, generated architectural panorama, 1774×887. Original tool output; not labelled or upscaled as 4K. No additional floor plane. | `combination_room` by Sergej Majboroda, CC0 |
| Space | Seamless procedural nebula and stars, rendered at the canvas resolution. | `qwantani_night_puresky` by Greg Zaal and Jarod Guest, CC0 |
| Park | `park-8k.jpg`, original 8192×4096 tonemapped panorama. The projected ground uses this same sharp texture. | `meadow_2` by Sergej Majboroda, CC0 |
| Neon Arcade | Procedural illuminated pavilion, with light strips that also work without post-processing. | `white_studio_06` by Grzegorz Wronkowski, CC0 |
| Minimal White | Continuous geometric studio sweep, rendered at the canvas resolution. | `white_studio_06` by Grzegorz Wronkowski, CC0 |

Poly Haven assets are [CC0](https://polyhaven.com/license). The Park panorama is
[Meadow 2](https://polyhaven.com/a/meadow_2), downloaded without resizing or recompression
from `https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/meadow_2.jpg`.
The 1K HDR files remain lighting probes, not the final visible photographs.

The study artwork was created using the built-in image generation tool. Prompt:
"A contemporary private chess club study / architectural library, walnut paneling,
bookshelves, warm shelf lights, cream limestone, parquet and cognac leather chairs.
Photorealistic 2:1 panoramic environment, empty central floor for an independently
rendered chess table, no people, text, logos, chandeliers or wallpaper." A second
pass refined grain, joints, curtains and leather while preserving the layout. The
tool returned 1774×887 on both passes despite requesting a larger output.

Legacy `study.jpg`, `park.jpg`, `arcade.jpg`, and `minimal.jpg` remain available but
are no longer selected by these presets. Their original sources were respectively
`combination_room` (Sergej Majboroda), `meadow_2` (Sergej Majboroda),
`ferndale_studio_06` (Dimitrios Savva and Greg Zaal), and `white_studio_06`
(Grzegorz Wronkowski), all CC0. Historical details are in `docs/research/assets.md`.
