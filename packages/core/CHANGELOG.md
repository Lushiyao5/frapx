# Changelog

## Unreleased

### Added

- `clock: "manual"` option on `createRuntimeHost` and `setClock()` / `setTime()` on the instance. A manual clock never schedules frames: time changes only through `setTime()` (with `delta` the difference from the previous call) and frames are drawn only by `render()`, which ignores offscreen/hidden gating. The frame state reports a neutral pointer and `reducedMotion: false`, so identical time and uniforms produce identical pixels.
- `resolution` option and `setResolution([w, h] | null)` to fix the internal render size independently of the target. The canvas is letterboxed with `object-fit: contain`, the viewport size still tracks the target, and `pixelRatio` is derived from the fit (`dpr` / `maxDpr` are ignored). Sizes beyond the GPU's viewport/renderbuffer limits fail with `UnsupportedError`.
- Creating a host with neither `target` nor `canvas` now works when `resolution` is given: a detached canvas is created and no layout observers are attached.
- `ClockMode` and `Resolution` types, and `SetupCanvasOptions.detached` / `DomSetup.detached`.

## 0.2.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/runtime` to `@frapx/core`.** No API changes — only the npm package name and import path change. `@frapx/runtime` is deprecated on npm and will not receive further updates.

### Added

- _Correction (noted after release):_ this version also shipped the `onResize` host option (called only when the measured size actually changes) and the `createBlitter(gl)` fullscreen-quad blit utility, which the entry above omitted.

## 0.1.0 - 2026-06-27

Initial release. Shared WebGL runtime extracted from `@frapx/fx-canvas`.

### Added

- `createRuntimeHost` — WebGL lifecycle host with canvas setup, animation loop, visibility gating, reduced-motion support, and context-loss recovery.
- Shared error hierarchy: `ShaderError`, `UnsupportedError`, `TargetNotFoundError`, `ShaderCompileError`, `TextureLoadError`, `DestroyedError`.
- Texture loading utilities with CORS support and dual uniform naming.
- WebGL shader compilation with GLSL ES 1.00 and 3.00 support, fullscreen quad geometry.
- Uniform naming convention utilities (`toUniformName`, `fromUniformName`).
- DOM canvas setup helpers for HiDPI rendering.
- `hexToRgb` / `hexToRgba` color utilities.
- `glsl` template tag and `glslUtils` GLSL snippet helpers.
