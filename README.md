# frapx

Web graphics utilities for building lightweight visual effects on the web.

## Packages

- [`@frapx/shader`](./packages/shader) - Create lightweight WebGL shader backgrounds for websites.
- [`@frapx/shader-react`](./packages/shader-react) - React bindings for shader backgrounds.
- [`@frapx/shader-noise`](./packages/shader-noise) - Lightweight GLSL 3D noise helpers for shader backgrounds.
- [`@frapx/shader-flowmap`](./packages/shader-flowmap) - GLSL flowmap decode/distortion helpers for shader backgrounds.
- [`@frapx/runtime`](./packages/runtime) - Shared WebGL runtime host used internally by `@frapx/shader`.

## Architecture

`@frapx/shader` is the lightweight core runtime. Optional capabilities such as SDF helpers, noise utilities, and presets should live in separate packages so the core package stays small and focused.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Releasing

Release policy and manual publish steps are documented in
[`RELEASING.md`](./RELEASING.md).

## Examples

```sh
pnpm dev
```

Run a specific example with a workspace filter:

```sh
pnpm --filter @frapx/example-vite-basic dev
pnpm --filter @frapx/example-vite-feedback dev
pnpm --filter @frapx/example-vite-react dev
```
