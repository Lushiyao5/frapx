# @frapx/glsl-flowmap

GLSL flowmap helpers for [`@frapx/fx-canvas`](https://github.com/kramhash/frapx).

Provides GLSL ES 3.00 snippet strings that decode frapx-convention RG flowmap
textures and apply three-phase advection distortion to a base texture.

**Requires WebGL2** (`#version 300 es`).

---

## Install

```bash
pnpm add @frapx/glsl-flowmap
```

## Usage

```ts
import { glsl } from "@frapx/fx-canvas";
import { flowDecode, flowDistort } from "@frapx/glsl-flowmap";
import { createShaderBackground } from "@frapx/fx-canvas";

const fx = createShaderBackground({
  target: "#canvas-container",
  textures: {
    // flipY: true is the default — matches the frapx flowmap encoding convention
    flow: "flowmap.png",
    base: "water.jpg",
  },
  uniforms: {
    flowSpeed: 0.3,
    flowStrength: 0.15,
    tiling: 2.0,
  },
  fragment: glsl`#version 300 es
    precision highp float;

    in vec2 v_uv;
    out vec4 fragColor;

    uniform sampler2D u_flow;
    uniform sampler2D u_base;
    uniform float u_time;
    uniform float u_flowSpeed;
    uniform float u_flowStrength;
    uniform float u_tiling;

    ${flowDecode}
    ${flowDistort}

    void main() {
      vec2 flow = frapx_flowDecode(u_flow, v_uv);
      vec2 baseUv = v_uv * u_tiling;
      fragColor = frapx_flowDistort(
        u_base, flow, baseUv, v_uv,
        u_time, u_flowSpeed, u_flowStrength
      );
    }
  `,
});
```

---

## Encoding convention

Flowmap textures must follow the frapx RG convention:

| Channel | Value |
|---------|-------|
| R byte | `round(127.5 + dx * 127.5)` |
| G byte | `round(127.5 - dy * 127.5)` (canvas Y negated to match WebGL Y-up) |
| Neutral (no flow) | `rgb(128, 128, 0)` |

Textures produced by [frapx flowmap-painter](../../apps/flowmap-painter) follow this convention.

### flipY requirement

`@frapx/fx-canvas` uploads textures with **`flipY: true` by default**, which matches the
encoding above. If you upload a flow texture manually, ensure `UNPACK_FLIP_Y_WEBGL` is
set to `true`, otherwise the Y axis of the decoded flow will be inverted.

---

## API

### `flowDecode` — `string`

GLSL ES 3.00 function that unpacks an RG flowmap into a signed velocity vector:

```glsl
vec2 frapx_flowDecode(sampler2D flowTex, vec2 uv) → vec2 in [-1, 1]²
```

### `flowDistort` — `string`

GLSL ES 3.00 function that applies three-phase advection of a base texture along a
precomputed flow vector. Self-contained — no other frapx_ snippet required.

Quality improvements over a naive scroll (as of 0.3.0):
- **Spatio-temporal phase decorrelation** — bounded 3D value noise offsets each region's
  animation phase without allowing local phase reversal, so the exact 1/speed loop never
  recurs; intended for real-time playback (not clean-loop export)
- **Stable phase domain** — separate base and phase UVs keep the noise scale independent
  from base-texture tiling
- **Three-phase normalised tent blend** — phases spaced 1/3 apart with tent weights that
  are zero at each reset boundary. Reduces the double-image (ghost) smear by ~33 %
  compared to the two-phase design. Requires three texture fetches per fragment.

```glsl
vec4 frapx_flowDistort(
  sampler2D base,
  vec2 flow,      // signed flow vector from frapx_flowDecode
  vec2 baseUv,    // base texture coords (apply tiling before calling)
  vec2 phaseUv,   // untiled coords used for phase decorrelation
  float time,     // elapsed time (e.g. u_time)
  float speed,    // animation speed multiplier
  float strength  // distortion magnitude
) → vec4
```

The previous six-argument signature remains available for compatibility. It uses
`baseUv` as the phase coordinate; new code should use the seven-argument signature
above when applying tiling:

```glsl
frapx_flowDistort(base, flow, baseUv, time, speed, strength)
```
