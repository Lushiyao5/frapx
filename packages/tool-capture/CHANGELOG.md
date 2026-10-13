# Changelog

## 0.1.0 - 2026-10-13

### Added

- Added the initial `@frapx/tool-capture` package, the first `tool-*` package.
- `captureSequence()`: deterministic PNG sequence export at `frame / fps` seconds over a frame range, with abort, progress and per-frame hooks. Runs the target on its manual clock and restores the previous clock afterwards.
- `format: "png16"` and `encodePng16()`: 16-bit-per-channel PNGs from the float feedback buffer, encoded with the platform `CompressionStream`.
- Sinks: `createZipSink()` (uncompressed ZIP with ZIP64 support), `createDirectorySink()` and `pickDirectorySink()` (File System Access API), plus `canPickDirectory()` and `downloadBlob()`.
- `examples/vite-capture` now exports through this package, with 8-bit/16-bit and folder/ZIP choices.
- `captureSequence()` passes its `signal` to each `captureFrame()`, so a frame drawn over several tasks can stop part-way. `CaptureTarget.captureFrame` accepts an optional `signal`.
- `@frapx/fx-passes` instances are capture targets as is; accumulated frames export with all their samples.
