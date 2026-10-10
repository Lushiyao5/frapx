# Changelog

## Unreleased

### Added

- Added the MIT `LICENSE` file to the published package.

## 0.2.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/shader-noise` to `@frapx/glsl-noise`**, grouping frapx's GLSL snippet packages under a shared `glsl-` prefix. No API changes. `@frapx/shader-noise` is deprecated on npm and will not receive further updates.

## 0.1.0 - 2026-06-13

### Added

- Added the initial `@frapx/glsl-noise` package.
- Added self-contained GLSL snippets for `frapx_simplex3d`,
  `frapx_perlin3d`, `frapx_periodicPerlin3d`, and `frapx_fbm3d`.
- Added composable 3D noise building blocks and the combined `noise3d` snippet.
