# Changelog

## Unreleased

### Added

- Added the initial `@frapx/tool-capture` package, the first `tool-*` package.
- `captureSequence()`: deterministic PNG sequence export at `frame / fps` seconds over a frame range, with abort, progress and per-frame hooks. Runs the target on its manual clock and restores the previous clock afterwards.
- `format: "png16"` and `encodePng16()`: 16-bit-per-channel PNGs from the float feedback buffer, encoded with the platform `CompressionStream`.
- Sinks: `createZipSink()` (uncompressed ZIP with ZIP64 support), `createDirectorySink()` and `pickDirectorySink()` (File System Access API), plus `canPickDirectory()` and `downloadBlob()`.
- `examples/vite-capture` now exports through this package, with 8-bit/16-bit and folder/ZIP choices.
