# 3D model attribution (required)

`chess-pieces.glb` is derived from six free models by **Jarlan Perez**, published on
[Poly Pizza](https://poly.pizza) (originally Google Poly), licensed
**[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)**.

Attribution string that MUST appear in the app (settings/about panel is fine):

> Chess pieces by Jarlan Perez via Poly Pizza — CC BY 3.0

Sources (unmodified originals kept in `./source/`):

| Piece | Poly Pizza page | Direct GLB |
|---|---|---|
| King | https://poly.pizza/m/4TP6oa34Fp- | https://static.poly.pizza/a8d3f6bb-8155-4e32-9627-9c42e80647e0.glb |
| Queen | https://poly.pizza/m/0EE-Yj8eu2c | https://static.poly.pizza/4b5c36a7-059a-4b2c-bd07-83a5312ef702.glb |
| Rook | https://poly.pizza/m/417Xec_xlU0 | https://static.poly.pizza/8aa97001-9d59-4bb4-b03f-27d14ecf0ef5.glb |
| Bishop | https://poly.pizza/m/7xay8UYqePI | https://static.poly.pizza/c8df9cb7-4d63-4451-98b9-ea756909910a.glb |
| Knight | https://poly.pizza/m/fMIykP6ncx7 | https://static.poly.pizza/2b5a6939-9032-402f-b1d0-e44a6bfa226e.glb |
| Pawn | https://poly.pizza/m/0xRVhzfseb3 | https://static.poly.pizza/97097510-1b75-40b2-b24f-bfaa14d7aaba.glb |

Modifications made (see `docs/research/assets.md` section B3): merged into one GLB, re-centred on the
base, uniformly scaled (x3.930078), creased normals recomputed at 35 deg, single shared
`PieceMaterial`. CC-BY 3.0 permits derivatives; attribution is still required.

HDRIs in `public/hdri/` are CC0 from https://polyhaven.com (no attribution required), and
so are the tonemapped skybox JPGs in `public/backdrops/` — see
`public/backdrops/ATTRIBUTION.md` for the photographers.
