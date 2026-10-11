# Changelog

## 0.1.0 - 2026-10-11

### Added

- Added the initial `@frapx/glsl-raymarch` package.
- `raymarch`: `frapx_map` forward declaration, `frapx_raymarch`, `frapx_normal` (tetrahedron technique), `frapx_softShadow` (improved technique with a fallback when consecutive samples do not intersect) and `frapx_ao`, with overridable loop-limit macros `FRAPX_RAYMARCH_STEPS`, `FRAPX_RAYMARCH_PRECISION`, `FRAPX_SHADOW_STEPS` and `FRAPX_AO_SAMPLES`.
- `raymarchCamera`: `frapx_lookAt` and `frapx_cameraRay` with a vertical field of view in radians.
- `raymarchCameraUniforms`: the standard `u_camPos`, `u_camTarget` and `u_fov` uniforms and a `frapx_cameraRay(fragCoord, resolution)` overload that reads them.
- `examples/vite-raymarch`: an orbiting camera with field of view, shadow and occlusion controls.
- Added the MIT `LICENSE` file and `LICENSES/iq-raymarch-MIT.txt` to the published package.
