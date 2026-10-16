# @frapx/core

Shared WebGL runtime host for `@frapx` packages.

This package is the lifecycle engine (canvas setup, context management and restore, animation loop and clocks, a11y gates, frame capture) shared by `@frapx/fx-canvas`, `@frapx/fx-passes` and `@frapx/fx-particles`. It is a low-level building block and its API may change between minor versions while `@frapx/core` remains at `0.x`.

If you are building a WebGL experience, you most likely want [`@frapx/fx-canvas`](https://www.npmjs.com/package/@frapx/fx-canvas) (or another `fx-*` package) instead.

## Exports

For building a new `fx-*` runtime on the same host:

- `createRuntimeHost(options)` — the host: canvas setup, `realtime` / `manual` clocks, fixed `resolution`, offscreen / hidden / reduced-motion gates, context loss and restore, and `captureFrame()`. A runtime plugs in through `createContext`, `onInit`, `onDraw`, `onCaptureDraw`, `captureSource`, `onResize` and the context hooks.
- Programs and uniforms — `createProgram`, `createFullscreenProgram`, `createFullscreenBuffer`, `collectUniformLocations`, `applyUniform(s)`, `normalizeUniform`, `createUniformCache`, `toUniformName` / `fromUniformName`.
- Textures and targets — `loadTexture`, `createTextureSet`, `createRenderTarget`, `createPingPong`, `supportsRenderTargetFormat`, `resolveRenderTargetFormat`, `createBlitter`.
- Timelines — `createUniformBindings`, `keyframes`.
- Helpers — `waitForGpu`, `glsl`, `glslUtils`, `hexToRgb` / `hexToRgba`, `parseShaderLog`, `isWebGL2Context`, `isGLSL300`, `setupCanvas`, `resolveDpr`.
- Errors — `ShaderError`, `ShaderCompileError`, `UnsupportedError`, `TargetNotFoundError`, `TextureLoadError`, `DestroyedError`.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).
