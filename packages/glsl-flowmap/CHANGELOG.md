# Changelog

## 0.4.1 - 2026-10-10

### Added

- Added the MIT `LICENSE` file to the published package.

## 0.4.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/shader-flowmap` to `@frapx/glsl-flowmap`**, grouping frapx's GLSL snippet packages under a shared `glsl-` prefix. No API changes. `@frapx/shader-flowmap` is deprecated on npm and will not receive further updates.

## 0.3.0 - 2026-06-27

### Changed

- `flowDecode` — simplified to `centered / 127.5` (clamp to [-1, 1]).
  Same contract as before (byte 128 → exactly 0, strictly monotonic), but
  fewer GPU instructions and no slope discontinuity at zero.
- `flowDistort` — upgraded from two-phase to three-phase normalised tent blend:
  - Phases are spaced 1/3 apart (was 1/2). Tent weights are zero at each
    phase boundary, so a resetting sample contributes nothing (no pop).
  - Reduces the visible double-image (ghost) smear by ~33 % in high-flow regions.
  - Requires three texture fetches per fragment (was two).
  - Phase decorrelation amplitude increased from ±0.1 to ±0.2, giving
    neighbouring regions more independent timing for a more organic look.
  - Behaviour change: output is no longer bit-identical to 0.2.x.

## 0.2.0 - 2026-06-27

### Added

- A seven-argument `frapx_flowDistort` overload that separates tiled base UVs from
  untiled phase UVs. The six-argument signature remains compatible.

### Changed

- `flowDecode` now treats the Painter's 8-bit value 128 as exact neutral flow.
- `flowDistort` — improved quality; now self-contained (no external frapx_ helpers needed):
  - **Spatio-temporal phase decorrelation**: bounded 3D value noise offsets each pixel's animation phase without allowing local phase reversal, eliminating the exact 1/speed loop the eye recognises as a seam; intended for real-time playback, not clean-loop video export
  - **Tiling-independent phase domain**: the new overload accepts a separate untiled phase UV
  - **Smoothstep blend**: softens the triangle-wave seam between the two animation phases
  - Behaviour change: output is no longer bit-identical to 0.1.x

## 0.1.0 - 2026-06-27

### Added

- `flowDecode` — GLSL ES 3.00 snippet to unpack RG-encoded flow textures (frapx convention)
- `flowDistort` — GLSL ES 3.00 snippet for two-phase advection distortion of a base texture
