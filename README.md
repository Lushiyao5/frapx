# frapx

Web graphics utilities for building lightweight visual effects on the web.

📖 Full documentation, a live shader demo, and per-package guides:
**https://kramhash.github.io/frapx/**

## Packages

Packages are named by category, so the prefix tells you what kind of package it is:

**Effect runtimes** — instantiate directly in your app:
- [`@frapx/fx-canvas`](./packages/fx-canvas) - Create lightweight WebGL shader backgrounds for websites.

**Framework bindings** — for an effect runtime above:
- [`@frapx/react-canvas`](./packages/react-canvas) - React bindings for `@frapx/fx-canvas`.

**GLSL snippets** — string-concatenate into your own fragment shader:
- [`@frapx/glsl-noise`](./packages/glsl-noise) - Lightweight GLSL 3D noise helpers.
- [`@frapx/glsl-flowmap`](./packages/glsl-flowmap) - GLSL flowmap decode/distortion helpers.
- [`@frapx/glsl-sdf`](./packages/glsl-sdf) - GLSL 2D/3D signed distance functions and operators.
- [`@frapx/glsl-raymarch`](./packages/glsl-raymarch) - GLSL raymarching loop, normals, soft shadows, ambient occlusion and camera rays.

**Tools** — export and production utilities built on the runtimes:
- [`@frapx/tool-capture`](./packages/tool-capture) - Deterministic PNG sequence export (8-bit or 16-bit) to a folder or a ZIP, in the browser.

**Internal engine** — not installed directly; pulled in automatically as a dependency:
- [`@frapx/core`](./packages/core) - Shared WebGL runtime host used internally by `@frapx/fx-canvas`.

Not sure what you need? If you're adding an animated WebGL background, start with
`@frapx/fx-canvas` (or `@frapx/react-canvas` in a React app) and pull in a `glsl-*`
package only when you need its GLSL helpers inside your fragment shader.

## Architecture

`@frapx/fx-canvas` is the lightweight flagship effect runtime. Optional capabilities such as SDF helpers, noise utilities, and presets live in separate packages (see the naming scheme above and `AGENTS.md`) so `@frapx/fx-canvas` stays small and focused.

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
pnpm --filter @frapx/example-vite-capture dev
pnpm --filter @frapx/example-vite-sdf dev
pnpm --filter @frapx/example-vite-raymarch dev
pnpm --filter @frapx/example-vite-sdf-journey dev
pnpm --filter @frapx/example-vite-react dev
```

## Documentation Site

```sh
pnpm dev:docs
```

The docs site ([`apps/docs`](./apps/docs), Astro + Starlight) requires
`pnpm build` to have run first, since its Live Demo page imports the real
built `@frapx/fx-canvas` package rather than an aliased source path.

## License

MIT © 2026 kramhash. See [LICENSE](./LICENSE).

`@frapx/glsl-noise`, `@frapx/glsl-sdf` and `@frapx/glsl-raymarch` include third-party code under the
MIT License; its notices ship in each package's `LICENSES/` directory.

The frapx name and the logos in [`assets/brand`](./assets/brand) are not
covered by the MIT License. Use them only to refer to frapx itself.
