# Changelog

## 0.1.0 - 2026-10-13

### Added

- Added the initial `@frapx/fx-passes` package: a WebGL2 multipass runtime for video work on the `@frapx/core` host shared with `@frapx/fx-canvas`.
- `createPasses({ passes })`: passes drawn in order, the last one shown and captured. `inputs` sample other passes as `u_<name>` / `u_<name>Size`. An earlier pass gives this frame's output, and the pass itself or a later one gives the previous frame's (Shadertoy-style, with automatic double buffering and `resetFeedback()`). Each pass has its own `format` (`rgba8`, `rgba16f` by default, `rgba32f`), `scale`, `filter` and `wrap`.
- Sample accumulation: `accumulate: true` passes draw `accumulation.samples` samples per frame. The runtime sums them in 32-bit float and passes the mean on. `u_time` spreads over the open shutter (`shutter` as a fraction of `1 / fps`), with `u_frameTime`, `u_jitter` (R3 sequence, none on sample 0), `u_sampleIndex` and `u_sampleCount`. `setAccumulation()`, `samplesDrawn` and `onSample` cover changes and progress.
- Progressive refinement: an unchanged frame gains one sample per draw, and a stopped or manual-clock instance refines it on animation frames.
- `captureFrame()` draws every sample of the frame from scratch, waits for the GPU between adaptive batches, honors `signal` between samples, and reads the last pass (`rgba16f` reads its float output).
- Re-exports the `glsl` template tag from `@frapx/core`.
- `examples/vite-passes`: an accumulated, motion-blurred fan with a quarter-resolution glow pass, also used by the E2E tests.
