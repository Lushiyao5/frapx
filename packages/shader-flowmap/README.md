# @frapx/shader-flowmap

GLSL flowmap helpers for [`@frapx/shader`](https://github.com/kramhash/frapx).

Provides two GLSL ES 3.00 snippet strings that decode frapx-convention RG flowmap
textures and apply two-phase advection distortion to a base texture.

**Requires WebGL2** (`#version 300 es`).

---

## Install

```bash
pnpm add @frapx/shader-flowmap
```

## Usage

```ts
import { glsl } from "@frapx/shader";
import { flowDecode, flowDistort } from "@frapx/shader-flowmap";
import { createShaderBackground } from "@frapx/shader";

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
      vec2 uv   = v_uv * u_tiling;
      fragColor = frapx_flowDistort(u_base, flow, uv, u_time, u_flowSpeed, u_flowStrength);
    }
  `,
});
```

---

## Encoding convention

Flowmap textures must follow the frapx RG convention:

| Channel | Value |
|---------|-------|
| R | `0.5 + dx * 0.5` |
| G | `0.5 - dy * 0.5` (canvas Y negated to match WebGL Y-up) |
| Neutral (no flow) | `rgb(128, 128, 0)` |

Textures produced by [frapx flowmap-painter](../../apps/flowmap-painter) follow this convention.

### flipY requirement

`@frapx/shader` uploads textures with **`flipY: true` by default**, which matches the
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

GLSL ES 3.00 function that applies two-phase advection of a base texture along a
precomputed flow vector. Uses two interleaved scroll phases offset by 0.5 in the
animation cycle to avoid the infinite-stretching artifact of single-phase scrolling:

```glsl
vec4 frapx_flowDistort(
  sampler2D base,
  vec2 flow,      // signed flow vector from frapx_flowDecode
  vec2 uv,        // texture coords (apply tiling before calling)
  float time,     // elapsed time (e.g. u_time)
  float speed,    // animation speed multiplier
  float strength  // distortion magnitude
) → vec4
```
