# @frapx/tool-dev

Development helpers for `@frapx/fx-canvas` and `@frapx/fx-passes`. `createErrorOverlay()` shows shader compile errors on the page, with the lines they point at, so hot reloading with `setFragment()` never sends you to the console to count lines. No dependencies.

## Install

```sh
pnpm add -D @frapx/tool-dev
```

## Hot reloading with Vite

Keep the shader in its own module and swap it in when it changes:

```ts
// main.ts
import { createShaderBackground } from "@frapx/fx-canvas";
import { createErrorOverlay } from "@frapx/tool-dev";
import { fragment } from "./scene.glsl";

const fx = createShaderBackground({ target: ".stage", fragment });

if (import.meta.hot) {
  const overlay = createErrorOverlay();
  fx.ready.catch((error) => overlay.show(error)); // the first shader failed

  import.meta.hot.accept("./scene.glsl", (module) => {
    const next = module?.["fragment"];
    if (typeof next !== "string") return;
    if (fx.status === "error") return import.meta.hot!.invalidate(); // nothing to swap into
    const error = fx.setFragment(next);
    error ? overlay.show(error) : overlay.clear();
  });
}
```

`setFragment()` keeps the time, uniforms, textures and feedback history, and on a compile error keeps drawing the previous shader. Inside `if (import.meta.hot)` the overlay is dropped from production builds. For `@frapx/fx-passes`, call `fx.setFragment(passName, source)`.

## `createErrorOverlay(options?)`

| Option | Default | |
| --- | --- | --- |
| `parent` | `document.body` | Where the overlay is attached. |
| `position` | `"top"` | `"top"` or `"bottom"` edge of the viewport. |

Returns `{ show(error), clear(), destroy(), visible }`.

- `show(error)` renders a `ShaderCompileError`'s located errors: each line number and message, with two lines of source either side and the failing line highlighted. Line numbers count lines of the compiled source, after `glsl` interpolation, so a shader that includes snippets shows the snippet lines too. An error without located lines (such as a link error) shows its message; any other value shows as text.
- `clear()` hides it; the × button does the same. `destroy()` removes it.

The overlay lives in a shadow root, so page styles neither reach it nor leak out, and it builds every node with `textContent`, never parsing shader text or driver logs as HTML.

## Example

`examples/vite-hot-reload`:

```sh
pnpm --filter @frapx/example-vite-hot-reload dev
```
