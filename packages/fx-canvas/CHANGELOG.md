# Changelog

## Unreleased

### Added

- Added the MIT `LICENSE` file to the published package.

## 0.7.0 - 2026-07-12

### Changed

- **Breaking: package renamed from `@frapx/shader` to `@frapx/fx-canvas`.** No API changes — `createShaderBackground` and all other exports are unchanged; only the npm package name and import path change. `@frapx/shader` is deprecated on npm and will not receive further updates.

## 0.6.1 - 2026-06-27

### Changed

- Extracted shared WebGL utilities into `@frapx/core`. No public API or behavior changes. `@frapx/core` is added as a runtime dependency and will be installed automatically.
- Pinned the `@frapx/core` dependency to `^0.1.0` (was published as an unresolved `workspace:*` range).

## 0.6.0 - 2026-06-20

### Added

- Added `feedback: true | FeedbackOptions` to expose the previous rendered frame as a managed `u_previousFrame` texture backed by internal ping-pong framebuffers.
- Added `examples/vite-feedback` as an interactive feedback demo.

## 0.5.0 - 2026-06-20

### Added

- Added WebGL2 / GLSL ES 3.00 support: starting your fragment shader with `#version 300 es` automatically requests a `webgl2` context and selects a matching internal vertex shader (`in`/`out` syntax). No configuration needed. Shaders without this directive continue to use WebGL1 unchanged.
- Added `GLContext` exported type (`WebGLRenderingContext | WebGL2RenderingContext`). The `gl` getter and `RenderState.gl` now reflect the actual context type. This is a minor breaking change for callers typed as `WebGLRenderingContext`.
- When `#version 300 es` is detected but WebGL2 is unavailable, the instance transitions to `status: "unsupported"` and `onError` receives an `UnsupportedError` with a descriptive message. No downgrade to WebGL1 is attempted.

## 0.4.0 - 2026-06-20

### Added

- Added `pauseWhenHidden` (default `true`): pause the render loop while the document is hidden (e.g. a background tab) and resume when it is visible again.
- Added `respectReducedMotion` (default `false`): when enabled, hold a single static frame while the OS "prefers reduced motion" setting is on, with live updates when the user toggles it. The motion gate does not apply in `renderMode: "demand"`.
- Added the always-supplied `u_reducedMotion` built-in uniform (0/1) and `state.reducedMotion` on the render state.

### Changed

- **Behavior change:** `pauseWhenHidden` defaults to `true`, so the loop now pauses on hidden tabs by default. Pass `pauseWhenHidden: false` to keep the previous always-running behavior.
- Unified offscreen/hidden/reduced-motion pausing onto a single gate model so visibility and motion changes reconcile to a consistent state regardless of event order. No public API change.

## 0.3.0 - 2026-06-15

### Added

- Added `setTexture()` and `setTextures()` for runtime texture updates.

### Changed

- Preserved runtime texture updates across WebGL context restore.
- Rebound core draw state after render hooks to isolate user WebGL side effects.
