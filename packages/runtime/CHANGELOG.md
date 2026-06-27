# Changelog

## 0.1.0 - 2026-06-27

Initial release. Shared WebGL runtime extracted from `@frapx/shader`.

### Added

- `createRuntimeHost` — WebGL lifecycle host with canvas setup, animation loop, visibility gating, reduced-motion support, and context-loss recovery.
- Shared error hierarchy: `ShaderError`, `UnsupportedError`, `TargetNotFoundError`, `ShaderCompileError`, `TextureLoadError`, `DestroyedError`.
- Texture loading utilities with CORS support and dual uniform naming.
- WebGL shader compilation with GLSL ES 1.00 and 3.00 support, fullscreen quad geometry.
- Uniform naming convention utilities (`toUniformName`, `fromUniformName`).
- DOM canvas setup helpers for HiDPI rendering.
- `hexToRgb` / `hexToRgba` color utilities.
- `glsl` template tag and `glslUtils` GLSL snippet helpers.
