# @frapx/glsl-noise

[![npm version](https://img.shields.io/npm/v/@frapx/glsl-noise.svg)](https://www.npmjs.com/package/@frapx/glsl-noise)

Lightweight GLSL 3D noise helpers for `@frapx/fx-canvas`.

This package is intentionally separate from `@frapx/fx-canvas` so the core runtime stays small. It exports GLSL strings that can be embedded in fragment shaders.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/glsl-noise
```

## Usage

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { fbm3d } from "@frapx/glsl-noise";

createShaderBackground({
  target: ".hero",
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    ${fbm3d}

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float n = frapx_fbm3d(vec3(uv * 4.0, u_time * 0.1));
      gl_FragColor = vec4(vec3(n * 0.5 + 0.5), 1.0);
    }
  `
});
```

## Exports

- `simplex3d` - self-contained `frapx_simplex3d(vec3)`
- `perlin3d` - self-contained `frapx_perlin3d(vec3)`
- `periodicPerlin3d` - self-contained `frapx_periodicPerlin3d(vec3, vec3)`
- `fbm3d` - self-contained `frapx_fbm3d(vec3)` using simplex noise
- `simplex3dGrad` - self-contained `frapx_simplex3dGrad(vec3, out vec3)`: simplex noise plus its analytic gradient
- `curl3d` - self-contained `frapx_curl3d(vec3)`: a divergence-free vector field (curl noise)
- `noise3d` - combined snippet with all 3D functions
- `noise3dCommon`, `simplex3dBody`, `simplex3dGradBody`, `curl3dBody`, `perlin3dBody`, `periodicPerlin3dBody`, `fbm3dBody` - composable building blocks

Use `noise3d` when you need multiple functions in one shader to avoid duplicating shared helper functions.

## Curl noise

`frapx_curl3d(p)` returns the curl of a vector potential made of three offset
simplex fields. It has no divergence, so anything advected by it swirls
without bunching up or thinning out — the usual choice for drifting particles
and smoke-like motion. The result is not normalized: lengths average about 3.5
and peak near 10, so scale it to taste.

```glsl
// after interpolating ${curl3d} into the shader
vec3 velocity = frapx_curl3d(position * 0.5 + vec3(0.0, 0.0, u_time * 0.1)) * 0.2;
```

It costs three `frapx_simplex3dGrad` calls, each about as expensive as one
`frapx_simplex3d`.

## Notes

- Function names are prefixed with `frapx_` to reduce GLSL global name collisions.
- The snippets target WebGL1 / GLSL ES 1.00.
- Use `precision highp float;` in shaders that include these snippets.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).

The 3D simplex and classic Perlin implementations are derived from `webgl-noise` by Ashima Arts and Stefan Gustavson, distributed under the MIT license. See [`LICENSES/webgl-noise-MIT.txt`](./LICENSES/webgl-noise-MIT.txt).
