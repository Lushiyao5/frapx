# Changelog

## 0.1.0 - 2026-10-10

### Added

- Added the initial `@frapx/glsl-sdf` package.
- `sdf2d`: 2D primitives (`frapx_sdCircle`, `frapx_sdBox`, `frapx_sdRoundBox`, `frapx_sdSegment`, `frapx_sdTriangle`, `frapx_sdEquilateralTriangle`, `frapx_sdHexagon`, `frapx_sdRhombus`, `frapx_sdPie`, `frapx_sdArc`).
- `sdf3d`: 3D primitives (`frapx_sdSphere`, `frapx_sdBox`, `frapx_sdRoundBox`, `frapx_sdBoxFrame`, `frapx_sdTorus`, `frapx_sdCylinder`, `frapx_sdCappedCone`, `frapx_sdCapsule`, `frapx_sdPlane`, `frapx_sdEllipsoid`, `frapx_sdOctahedron`, `frapx_sdHexPrism`).
- `sdfOps`: hard and smooth union / subtraction / intersection, `frapx_opRound` and `frapx_opOnion`.
- `sdfDomain`: `frapx_rotate`, `frapx_opRepeat`, `frapx_opRepeatLimited`, `frapx_opTwist` and `frapx_opBend`.
- `sdf`: every group in one snippet.
- `examples/vite-sdf`: a 2D distance field and a raymarched 3D scene.
- Added the MIT `LICENSE` file to the published package.
