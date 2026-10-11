# @frapx/glsl-sdf

GLSL signed distance functions for `@frapx/fx-canvas`: 2D and 3D primitives, smooth booleans and domain operators.

Like `@frapx/glsl-noise`, this package exports plain GLSL strings to concatenate into your own fragment shader. It contains no raymarching loop or lighting; for the loop, normals, shadows and camera rays, see [`@frapx/glsl-raymarch`](../glsl-raymarch).

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/glsl-sdf
```

## Usage

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { sdf2d, sdfOps } from "@frapx/glsl-sdf";

createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    ${sdf2d}
    ${sdfOps}

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
      float circle = frapx_sdCircle(p - vec2(0.2 * sin(u_time), 0.0), 0.15);
      float box = frapx_sdBox(p, vec2(0.2));
      float d = frapx_opSmoothUnion(circle, box, 0.08);
      gl_FragColor = vec4(vec3(smoothstep(0.004, 0.0, d)), 1.0);
    }
  `
});
```

For 3D, include `sdf3d` and evaluate it from your own raymarching loop or from `@frapx/glsl-raymarch`. See `examples/vite-sdf` for a 2D field and a raymarched 3D scene.

## Exports

Each export is a self-contained snippet. The groups never define the same function signature twice, so include any combination of them, or `sdf` for everything.

| Export | Contents |
| --- | --- |
| `sdf2d` | `frapx_sdCircle`, `frapx_sdBox`, `frapx_sdRoundBox` (uniform or per-corner radii), `frapx_sdSegment`, `frapx_sdTriangle`, `frapx_sdEquilateralTriangle`, `frapx_sdHexagon`, `frapx_sdRhombus`, `frapx_sdPie`, `frapx_sdArc` |
| `sdf3d` | `frapx_sdSphere`, `frapx_sdBox`, `frapx_sdRoundBox`, `frapx_sdBoxFrame`, `frapx_sdTorus`, `frapx_sdCylinder`, `frapx_sdCappedCone`, `frapx_sdCapsule`, `frapx_sdPlane`, `frapx_sdEllipsoid`, `frapx_sdOctahedron`, `frapx_sdHexPrism` |
| `sdfOps` | `frapx_opUnion`, `frapx_opSubtract`, `frapx_opIntersect`, `frapx_opSmoothUnion`, `frapx_opSmoothSubtract`, `frapx_opSmoothIntersect`, `frapx_opRound`, `frapx_opOnion` |
| `sdfDomain` | `frapx_rotate`, `frapx_opRepeat`, `frapx_opRepeatLimited` (2D and 3D), `frapx_opTwist`, `frapx_opBend` |
| `sdf` | all of the above |

Conventions:

- Distances are negative inside and positive outside.
- Box sizes are half extents. For `frapx_sdRoundBox` the size includes the rounding.
- `frapx_opSubtract(a, b)` removes `b` from `a`. Smooth operators take a blend radius `k` that must be greater than 0.
- 2D and 3D versions share a name and differ by argument type, for example `frapx_sdBox(vec2, vec2)` and `frapx_sdBox(vec3, vec3)`.
- Rotate a 3D point about one axis by rotating a swizzle: `p.xz = frapx_rotate(p.xz, angle)`.
- `frapx_sdEllipsoid` returns a bound rather than an exact distance. `frapx_opTwist` and `frapx_opBend` distort space, so shorten raymarching steps (for example, multiply the distance by 0.5) when using them.

## Notes

- Function names are prefixed with `frapx_` to reduce GLSL global name collisions.
- The snippets work in both GLSL ES 1.00 (WebGL1) and GLSL ES 3.00 (WebGL2).
- Use `precision highp float;` in shaders that include these snippets.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).

The distance functions are adapted from Inigo Quilez's Shadertoy shaders, each published under the MIT License (Copyright (c) 2013-2020 Inigo Quilez). [`LICENSES/iq-distfunctions-MIT.txt`](./LICENSES/iq-distfunctions-MIT.txt) lists the source shader for each function and includes the license text.
