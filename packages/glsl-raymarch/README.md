# @frapx/glsl-raymarch

GLSL raymarching for `@frapx/fx-canvas`: sphere tracing, normals, soft shadows, ambient occlusion and camera rays around a scene function you write.

Like `@frapx/glsl-noise` and `@frapx/glsl-sdf`, this package exports plain GLSL strings to concatenate into your own fragment shader. It stops at geometry and visibility: lighting, materials, fog and color grading stay in your shader. Pair it with [`@frapx/glsl-sdf`](../glsl-sdf) for distance functions.

## Install

```sh
pnpm add @frapx/fx-canvas @frapx/glsl-raymarch @frapx/glsl-sdf
```

## Usage

Define `float frapx_map(vec3 p)`, the signed distance to your scene. The snippet forward declares it, so the definition can come before or after `${raymarch}`.

```ts
import { createShaderBackground, glsl } from "@frapx/fx-canvas";
import { raymarch, raymarchCamera, raymarchCameraUniforms } from "@frapx/glsl-raymarch";
import { sdf3d } from "@frapx/glsl-sdf";

const background = createShaderBackground({
  target: ".hero",
  uniforms: {
    camPos: [0, 1.5, 5],
    camTarget: [0, 0, 0],
    fov: Math.PI / 4
  },
  fragment: glsl`
    precision highp float;

    uniform vec2 u_resolution;

    ${sdf3d}
    ${raymarchCamera}
    ${raymarchCameraUniforms}
    ${raymarch}

    float frapx_map(vec3 p) {
      return min(frapx_sdSphere(p, 1.0), p.y + 1.0);
    }

    void main() {
      vec3 rd = frapx_cameraRay(gl_FragCoord.xy, u_resolution);
      vec3 color = vec3(0.05);

      float t = frapx_raymarch(u_camPos, rd, 0.0, 30.0);
      if (t > 0.0) {
        vec3 p = u_camPos + rd * t;
        vec3 n = frapx_normal(p, 0.0005 * t);
        vec3 light = normalize(vec3(0.6, 1.0, 0.4));
        float diffuse = max(dot(n, light), 0.0);
        diffuse *= frapx_softShadow(p + n * 0.01, light, 0.01, 10.0, 16.0);
        color = vec3(0.8) * (0.15 * frapx_ao(p, n, 0.2) + diffuse);
      }

      gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
    }
  `
});

background.setUniform("camPos", [3, 2, 4]);
```

See `examples/vite-raymarch` for an orbiting camera with shadow and occlusion controls.

## Exports

| Export | Contents |
| --- | --- |
| `raymarch` | `frapx_map` forward declaration, `frapx_raymarch`, `frapx_normal`, `frapx_softShadow`, `frapx_ao`, and the loop-limit macros |
| `raymarchCamera` | `frapx_lookAt`, `frapx_cameraRay` (from an eye and target, or from a `frapx_lookAt` matrix). Does not need `frapx_map` |
| `raymarchCameraUniforms` | `uniform vec3 u_camPos`, `uniform vec3 u_camTarget`, `uniform float u_fov` and `frapx_cameraRay(fragCoord, resolution)` that reads them. Include after `raymarchCamera` |
| `raymarchLicense` | The attribution comment included by `raymarch` and `raymarchCamera` |

The groups never define the same function signature twice, and no name overlaps `@frapx/glsl-sdf`, so they can share one shader.

### Functions

| Function | Returns |
| --- | --- |
| `float frapx_raymarch(vec3 ro, vec3 rd, float tmin, float tmax)` | Distance along `rd` to the first hit, or `-1.0` when nothing is hit before `tmax` or within the step limit |
| `vec3 frapx_normal(vec3 p, float eps)` | Surface normal from four map samples. Scale `eps` with distance, for example `0.0005 * t` |
| `float frapx_softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k)` | 0 in full shadow to 1 fully lit. Offset `ro` from the surface along its normal. `k` sets penumbra hardness (around 8 to 32) |
| `float frapx_ao(vec3 p, vec3 n, float radius)` | 0 fully occluded to 1 open, sampling up to `radius` (greater than 0) along `n` |
| `mat3 frapx_lookAt(vec3 eye, vec3 target, float roll)` | Camera basis with columns right, up, forward |
| `vec3 frapx_cameraRay(vec2 fragCoord, vec2 resolution, vec3 eye, vec3 target, float fov)` | Normalized ray direction for a pixel |
| `vec3 frapx_cameraRay(vec2 fragCoord, vec2 resolution, mat3 camera, float fov)` | Same, with a basis from `frapx_lookAt` (use this for roll) |

### Loop limits

GLSL ES 1.00 loops need constant bounds, so step counts are macros. `#define` them before the snippet to override:

| Macro | Default | Used by |
| --- | --- | --- |
| `FRAPX_RAYMARCH_STEPS` | `128` | `frapx_raymarch` |
| `FRAPX_RAYMARCH_PRECISION` | `0.0005` | Hit threshold `d < FRAPX_RAYMARCH_PRECISION * max(t, 1.0)`, relative to the distance travelled; also the minimum shadow step |
| `FRAPX_SHADOW_STEPS` | `64` | `frapx_softShadow` |
| `FRAPX_AO_SAMPLES` | `5` | `frapx_ao` |

Raise the limits for final frames only by switching the shader string, for example `#define FRAPX_RAYMARCH_STEPS 512` when exporting.

## Conventions

- World up is `+y`. `fov` is the vertical field of view in radians, so the framing height stays the same at any aspect ratio.
- Screen coordinates are normalized by `resolution.y`, the same as `(gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y`.
- `roll` turns the camera counter-clockwise as seen from behind it, so the image turns clockwise.
- `frapx_lookAt` is undefined when looking straight up or down, or when `eye` equals `target`. Set all three camera uniforms before the first frame; unset uniforms are zero, which makes the eye equal the target.
- Pass `gl_FragCoord.xy + jitter` to `frapx_cameraRay` for sub-pixel jitter.
- If `frapx_map` returns a bound rather than an exact distance (for example after `frapx_opTwist` or `frapx_opBend`), scale its result down, such as `return d * 0.5;`. Every function here marches the same map, so the shorter steps apply to shadows and occlusion too.
- Materials are up to you: after a hit, evaluate your own function at the hit point to pick a color.

## Notes

- Function names are prefixed with `frapx_` to reduce GLSL global name collisions.
- The snippets work in both GLSL ES 1.00 (WebGL1) and GLSL ES 3.00 (WebGL2).
- Use `precision highp float;` in shaders that include these snippets.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).

The raymarching helpers are adapted from Inigo Quilez's Shadertoy shaders, each published under the MIT License (Copyright (c) 2013-2020 Inigo Quilez). [`LICENSES/iq-raymarch-MIT.txt`](./LICENSES/iq-raymarch-MIT.txt) lists the source shader for each function and includes the license text.
